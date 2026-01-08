import { createClient } from '@/lib/supabase/server'
import { successResponse, errors } from '@/lib/api-response'

// Default quota limits per bucket
const DEFAULT_LIMITS = {
  learningInteractions: 150,
  documentSummary: 10,
  sectionSummary: 30,
  courseSummary: 6,
  autoExplain: 100,
}

/**
 * GET /api/quotas - Get current user's quota usage
 */
export async function GET() {
  try {
    const supabase = createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return errors.unauthorized()
    }

    // Get existing quotas
    const { data: quotas, error } = await supabase
      .from('quotas')
      .select('*')
      .eq('user_id', user.id)

    if (error) {
      console.error('Error fetching quotas:', error)
      return errors.internalError()
    }

    // Build response with all buckets
    const buckets = Object.entries(DEFAULT_LIMITS).map(([bucket, limit]) => {
      const existing = quotas?.find((q) => q.bucket === bucket)
      return {
        bucket,
        used: existing?.used ?? 0,
        limit: existing?.limit ?? limit,
        resetAt: existing?.reset_at ?? null,
      }
    })

    // Calculate total for learningInteractions (main quota shown in UI)
    const mainQuota = buckets.find((b) => b.bucket === 'learningInteractions')
    const totalUsed = mainQuota?.used ?? 0
    const totalLimit = mainQuota?.limit ?? DEFAULT_LIMITS.learningInteractions

    return successResponse({
      buckets,
      summary: {
        used: totalUsed,
        limit: totalLimit,
        remaining: totalLimit - totalUsed,
        percentUsed: Math.round((totalUsed / totalLimit) * 100),
      },
    })
  } catch {
    return errors.internalError()
  }
}
