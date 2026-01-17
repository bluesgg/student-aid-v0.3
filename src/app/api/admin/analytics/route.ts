/**
 * GET /api/admin/analytics - Get system-wide analytics
 *
 * Protected admin endpoint for viewing user activity and system metrics.
 * Requires ADMIN_SECRET header for authentication.
 */

import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { successResponse, errors } from '@/lib/api-response'
import { verifyAdminAuth, adminUnauthorizedError } from '@/lib/auth/admin-auth'

export const dynamic = 'force-dynamic'

/**
 * Create Supabase client with service role (bypasses RLS)
 */
function createServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase configuration')
  }

  return createClient(supabaseUrl, supabaseServiceKey)
}

/**
 * GET /api/admin/analytics
 *
 * Query parameters:
 * - days: number of days to look back (default: 30)
 */
export async function GET(request: NextRequest) {
  // Verify admin authentication
  if (!verifyAdminAuth(request)) {
    return adminUnauthorizedError()
  }

  try {
    const searchParams = request.nextUrl.searchParams
    const days = parseInt(searchParams.get('days') || '30', 10)

    const supabase = createServiceClient()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    // 1. Active users by day (from AI usage logs)
    const { data: activeUsersData, error: activeUsersError } = await supabase.rpc(
      'get_active_users_by_day',
      {
        start_date: startDate.toISOString(),
      }
    )

    // If RPC doesn't exist, fallback to direct query
    let activeUsersByDay = []
    if (activeUsersError) {
      const { data, error } = await supabase
        .from('ai_usage_logs')
        .select('created_at, user_id')
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: false })

      if (!error && data) {
        // Group by date
        const grouped = data.reduce(
          (acc, log) => {
            const date = log.created_at.split('T')[0]
            if (!acc[date]) {
              acc[date] = new Set()
            }
            if (log.user_id) {
              acc[date].add(log.user_id)
            }
            return acc
          },
          {} as Record<string, Set<string>>
        )

        activeUsersByDay = Object.entries(grouped).map(([date, users]) => ({
          date,
          active_users: users.size,
        }))
      }
    } else {
      activeUsersByDay = activeUsersData || []
    }

    // 2. Operation type distribution
    const { data: operationStats, error: operationError } = await supabase
      .from('ai_usage_logs')
      .select('operation_type, user_id')
      .gte('created_at', startDate.toISOString())

    const operationDistribution = operationStats
      ? Object.entries(
          operationStats.reduce(
            (acc, log) => {
              if (!acc[log.operation_type]) {
                acc[log.operation_type] = { count: 0, users: new Set() }
              }
              acc[log.operation_type].count++
              if (log.user_id) {
                acc[log.operation_type].users.add(log.user_id)
              }
              return acc
            },
            {} as Record<string, { count: number; users: Set<string> }>
          )
        ).map(([type, data]) => ({
          operation_type: type,
          count: data.count,
          unique_users: data.users.size,
        }))
      : []

    if (operationError) {
      console.error('Error fetching operation stats:', operationError)
    }

    // 3. New user registrations
    const { data: usersData, error: usersError } = await supabase.rpc('get_user_stats', {
      start_date: startDate.toISOString(),
    })

    // Fallback for new users
    let newUsersByDay = []
    let totalUsers = 0
    if (usersError) {
      const { count } = await supabase.from('auth.users').select('*', { count: 'exact', head: true })
      totalUsers = count || 0
    } else {
      newUsersByDay = usersData?.newUsersByDay || []
      totalUsers = usersData?.totalUsers || 0
    }

    // 4. Error statistics
    const { data: errorStats, error: errorStatsError } = await supabase
      .from('ai_usage_logs')
      .select('error_code, created_at')
      .gte('created_at', startDate.toISOString())
      .eq('success', false)

    const errorDistribution = errorStats
      ? Object.entries(
          errorStats.reduce(
            (acc, log) => {
              const code = log.error_code || 'UNKNOWN'
              acc[code] = (acc[code] || 0) + 1
              return acc
            },
            {} as Record<string, number>
          )
        ).map(([code, count]) => ({ error_code: code, count }))
      : []

    if (errorStatsError) {
      console.error('Error fetching error stats:', errorStatsError)
    }

    // 5. Total cost and token usage
    const { data: costData, error: costError } = await supabase
      .from('ai_usage_logs')
      .select('cost_usd_approx, input_tokens, output_tokens')
      .gte('created_at', startDate.toISOString())

    const totalCost = costData?.reduce((sum, log) => sum + (log.cost_usd_approx || 0), 0) || 0
    const totalInputTokens = costData?.reduce((sum, log) => sum + (log.input_tokens || 0), 0) || 0
    const totalOutputTokens =
      costData?.reduce((sum, log) => sum + (log.output_tokens || 0), 0) || 0

    if (costError) {
      console.error('Error fetching cost data:', costError)
    }

    // 6. Get total counts
    const { count: totalCourses } = await supabase
      .from('courses')
      .select('*', { count: 'exact', head: true })
    const { count: totalFiles } = await supabase
      .from('files')
      .select('*', { count: 'exact', head: true })
    const { count: totalStickers } = await supabase
      .from('stickers')
      .select('*', { count: 'exact', head: true })

    // 7. Q&A interactions count
    const { count: totalQAInteractions } = await supabase
      .from('qa_interactions')
      .select('*', { count: 'exact', head: true })

    const { count: qaInPeriod } = await supabase
      .from('qa_interactions')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startDate.toISOString())

    // 8. PDF statistics (page counts)
    const { data: fileStats } = await supabase
      .from('files')
      .select('page_count, is_scanned, uploaded_at')

    const pdfStats = {
      totalPages: fileStats?.reduce((sum, f) => sum + (f.page_count || 0), 0) || 0,
      avgPagesPerFile: fileStats?.length
        ? Math.round(
            (fileStats.reduce((sum, f) => sum + (f.page_count || 0), 0) / fileStats.length) * 10
          ) / 10
        : 0,
      scannedFiles: fileStats?.filter((f) => f.is_scanned).length || 0,
      filesInPeriod:
        fileStats?.filter((f) => new Date(f.uploaded_at) >= startDate).length || 0,
    }

    // 9. Summaries count
    const { count: totalSummaries } = await supabase
      .from('summaries')
      .select('*', { count: 'exact', head: true })

    // 10. Context entries count (if table exists)
    let totalContextEntries = 0
    try {
      const { count } = await supabase
        .from('pdf_context_entries')
        .select('*', { count: 'exact', head: true })
      totalContextEntries = count || 0
    } catch {
      // Table may not exist
    }

    // 11. Daily cost trend
    const costByDay = costData
      ? Object.entries(
          costData.reduce(
            (acc, log) => {
              if (log.cost_usd_approx) {
                const date = new Date().toISOString().split('T')[0] // fallback
                acc[date] = (acc[date] || 0) + log.cost_usd_approx
              }
              return acc
            },
            {} as Record<string, number>
          )
        ).map(([date, cost]) => ({ date, cost: Math.round(cost * 100) / 100 }))
      : []

    return successResponse({
      overview: {
        totalUsers,
        totalCourses: totalCourses || 0,
        totalFiles: totalFiles || 0,
        totalStickers: totalStickers || 0,
        totalQAInteractions: totalQAInteractions || 0,
        totalSummaries: totalSummaries || 0,
        totalContextEntries,
        totalCost,
        totalInputTokens,
        totalOutputTokens,
        period: {
          days,
          startDate: startDate.toISOString(),
          endDate: new Date().toISOString(),
        },
      },
      activeUsers: {
        byDay: activeUsersByDay,
      },
      operations: {
        distribution: operationDistribution.sort((a, b) => b.count - a.count),
      },
      newUsers: {
        byDay: newUsersByDay,
      },
      errors: {
        distribution: errorDistribution.sort((a, b) => b.count - a.count),
        total: errorStats?.length || 0,
      },
      pdfStats: {
        ...pdfStats,
        filesInPeriod: pdfStats.filesInPeriod,
      },
      qaStats: {
        total: totalQAInteractions || 0,
        inPeriod: qaInPeriod || 0,
      },
      costTrend: costByDay,
    })
  } catch (error) {
    console.error('Admin analytics error:', error)
    return errors.internalError()
  }
}
