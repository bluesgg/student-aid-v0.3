import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { debugLog } from '@/lib/debug'

interface MetricRow {
  load_time_ms: number
  first_page_time_ms: number | null
  file_size_bytes: number | null
  cache_hit: boolean
}

/**
 * Record a PDF load performance metric.
 * Fire-and-forget from client - always returns 200 to not block UI.
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const supabase = await createClient()

    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      debugLog('[PDF Metrics API] No authenticated user, skipping metric')
      return NextResponse.json({ ok: true, skipped: true })
    }

    const body = await request.json()
    const { fileId, loadTimeMs, firstPageTimeMs, totalPages, fileSizeBytes, cacheHit } = body

    if (!fileId || typeof loadTimeMs !== 'number') {
      return NextResponse.json({ ok: false, error: 'Missing required fields' }, { status: 400 })
    }

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
      console.warn('[PDF Metrics API] Insert error:', insertError.message)
      const isTableMissing = insertError.message.includes('relation') && insertError.message.includes('does not exist')
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: isTableMissing ? 'table_not_found' : 'insert_error'
      })
    }

    debugLog('[PDF Metrics API] Recorded metric for file:', fileId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[PDF Metrics API] Error:', err)
    return NextResponse.json({ ok: true, skipped: true, reason: 'error' })
  }
}

/**
 * Get aggregated PDF load metrics for analytics.
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const period = (searchParams.get('period') || 'day') as 'hour' | 'day' | 'week'

    const now = new Date()
    const startTime = new Date(now)

    if (period === 'hour') {
      startTime.setHours(startTime.getHours() - 1)
    } else if (period === 'week') {
      startTime.setDate(startTime.getDate() - 7)
    } else {
      startTime.setDate(startTime.getDate() - 1)
    }

    const { data: metrics, error: queryError } = await supabase
      .from('pdf_load_metrics')
      .select('load_time_ms, first_page_time_ms, file_size_bytes, cache_hit')
      .eq('user_id', user.id)
      .gte('created_at', startTime.toISOString())
      .lte('created_at', now.toISOString())

    const emptyMetrics = {
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
    }

    if (queryError) {
      const isTableMissing = queryError.message.includes('relation') && queryError.message.includes('does not exist')
      if (isTableMissing) {
        return NextResponse.json(emptyMetrics)
      }
      console.error('[PDF Metrics API] Query error:', queryError)
      return NextResponse.json({ error: 'Failed to fetch metrics' }, { status: 500 })
    }

    const samples = (metrics as MetricRow[]) || []
    const totalLoads = samples.length
    const cacheHits = samples.filter(s => s.cache_hit).length
    const cacheMisses = totalLoads - cacheHits

    const loadTimes = samples.map(s => s.load_time_ms).sort((a, b) => a - b)
    const avgLoadTimeMs = loadTimes.length > 0
      ? Math.round(loadTimes.reduce((a, b) => a + b, 0) / loadTimes.length)
      : 0

    const firstPageTimes = samples
      .map(s => s.first_page_time_ms)
      .filter((t): t is number => t !== null)
      .sort((a, b) => a - b)
    const avgFirstPageTimeMs = firstPageTimes.length > 0
      ? Math.round(firstPageTimes.reduce((a, b) => a + b, 0) / firstPageTimes.length)
      : 0

    const getPercentile = (arr: number[], p: number): number => {
      if (arr.length === 0) return 0
      const idx = Math.ceil((arr.length * p) / 100) - 1
      return arr[Math.max(0, idx)]
    }

    const fileSizes = samples
      .map(s => s.file_size_bytes)
      .filter((s): s is number => s !== null)
    const totalBytesLoaded = fileSizes.reduce((a, b) => a + b, 0)
    const avgFileSizeBytes = fileSizes.length > 0
      ? Math.round(totalBytesLoaded / fileSizes.length)
      : 0

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
