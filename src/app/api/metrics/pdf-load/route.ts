import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { debugLog } from '@/lib/debug'

/**
 * Metric row shape from database query
 */
interface MetricRow {
  load_time_ms: number
  first_page_time_ms: number | null
  file_size_bytes: number | null
  cache_hit: boolean
}

/**
 * POST /api/metrics/pdf-load
 *
 * Record a PDF load performance metric.
 * Fire-and-forget from client - always returns 200 to not block UI.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Get current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      // Still return 200 - metrics are optional
      debugLog('[PDF Metrics API] No authenticated user, skipping metric')
      return NextResponse.json({ ok: true, skipped: true })
    }

    // Parse request body
    const body = await request.json()
    const { fileId, loadTimeMs, firstPageTimeMs, totalPages, fileSizeBytes, cacheHit } = body

    // Validate required fields
    if (!fileId || typeof loadTimeMs !== 'number') {
      return NextResponse.json({ ok: false, error: 'Missing required fields' }, { status: 400 })
    }

    // Insert metric
    const { error: insertError } = await supabase.from('pdf_load_metrics').insert({
      file_id: fileId,
      user_id: user.id,
      load_time_ms: loadTimeMs,
      first_page_time_ms: firstPageTimeMs ?? null,
      total_pages: totalPages ?? null,
      file_size_bytes: fileSizeBytes ?? null,
      cache_hit: cacheHit ?? false,
    })

    if (insertError) {
      // Log but don't fail - metrics are optional
      console.warn('[PDF Metrics API] Insert error:', insertError.message)
      // Check if table doesn't exist (migration not run)
      if (insertError.message.includes('relation') && insertError.message.includes('does not exist')) {
        debugLog('[PDF Metrics API] Table not found - migration may not be applied yet')
        return NextResponse.json({ ok: true, skipped: true, reason: 'table_not_found' })
      }
      return NextResponse.json({ ok: true, skipped: true, reason: 'insert_error' })
    }

    debugLog('[PDF Metrics API] Recorded metric for file:', fileId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    // Never fail metrics endpoint - always return 200
    console.error('[PDF Metrics API] Error:', err)
    return NextResponse.json({ ok: true, skipped: true, reason: 'error' })
  }
}

/**
 * GET /api/metrics/pdf-load
 *
 * Get aggregated PDF load metrics for analytics.
 * Query params:
 * - period: 'hour' | 'day' | 'week' (default: 'day')
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Get current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get period from query params
    const { searchParams } = new URL(request.url)
    const period = (searchParams.get('period') || 'day') as 'hour' | 'day' | 'week'

    // Calculate time boundaries
    const now = new Date()
    const startTime = new Date(now)

    switch (period) {
      case 'hour':
        startTime.setHours(startTime.getHours() - 1)
        break
      case 'day':
        startTime.setDate(startTime.getDate() - 1)
        break
      case 'week':
        startTime.setDate(startTime.getDate() - 7)
        break
    }

    // Query metrics for the period (user's own metrics only)
    const { data: metrics, error: queryError } = await supabase
      .from('pdf_load_metrics')
      .select('load_time_ms, first_page_time_ms, file_size_bytes, cache_hit')
      .eq('user_id', user.id)
      .gte('created_at', startTime.toISOString())
      .lte('created_at', now.toISOString())

    if (queryError) {
      // Check if table doesn't exist
      if (queryError.message.includes('relation') && queryError.message.includes('does not exist')) {
        return NextResponse.json({
          period,
          startTime: startTime.toISOString(),
          endTime: now.toISOString(),
          totalLoads: 0,
          cacheHits: 0,
          cacheMisses: 0,
          cacheHitRate: 0,
          avgLoadTimeMs: 0,
          avgFirstPageTimeMs: 0,
          p50LoadTimeMs: 0,
          p95LoadTimeMs: 0,
          avgFileSizeBytes: 0,
          totalBytesLoaded: 0,
        })
      }
      console.error('[PDF Metrics API] Query error:', queryError)
      return NextResponse.json({ error: 'Failed to fetch metrics' }, { status: 500 })
    }

    // Calculate aggregations
    const samples: MetricRow[] = (metrics as MetricRow[]) || []
    const totalLoads = samples.length
    const cacheHits = samples.filter((s: MetricRow) => s.cache_hit).length
    const cacheMisses = totalLoads - cacheHits

    // Load time stats
    const loadTimes: number[] = samples
      .map((s: MetricRow) => s.load_time_ms)
      .sort((a: number, b: number) => a - b)
    const avgLoadTimeMs =
      loadTimes.length > 0
        ? Math.round(loadTimes.reduce((a: number, b: number) => a + b, 0) / loadTimes.length)
        : 0

    // First page time stats
    const firstPageTimes: number[] = samples
      .map((s: MetricRow) => s.first_page_time_ms)
      .filter((t: number | null): t is number => t !== null)
      .sort((a: number, b: number) => a - b)
    const avgFirstPageTimeMs =
      firstPageTimes.length > 0
        ? Math.round(firstPageTimes.reduce((a: number, b: number) => a + b, 0) / firstPageTimes.length)
        : 0

    // Percentile helper
    const getPercentile = (arr: number[], p: number): number => {
      if (arr.length === 0) return 0
      const idx = Math.ceil((arr.length * p) / 100) - 1
      return arr[Math.max(0, idx)]
    }

    // Size stats
    const fileSizes: number[] = samples
      .map((s: MetricRow) => s.file_size_bytes)
      .filter((s: number | null): s is number => s !== null)
    const totalBytesLoaded = fileSizes.reduce((a: number, b: number) => a + b, 0)
    const avgFileSizeBytes =
      fileSizes.length > 0 ? Math.round(totalBytesLoaded / fileSizes.length) : 0

    return NextResponse.json({
      period,
      startTime: startTime.toISOString(),
      endTime: now.toISOString(),
      totalLoads,
      cacheHits,
      cacheMisses,
      cacheHitRate: totalLoads > 0 ? cacheHits / totalLoads : 0,
      avgLoadTimeMs,
      avgFirstPageTimeMs,
      p50LoadTimeMs: getPercentile(loadTimes, 50),
      p95LoadTimeMs: getPercentile(loadTimes, 95),
      avgFileSizeBytes,
      totalBytesLoaded,
    })
  } catch (err) {
    console.error('[PDF Metrics API] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
