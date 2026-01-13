/**
 * Context library metrics tracking.
 * Records hourly aggregated metrics for monitoring extraction and retrieval health.
 */

import { createAdminClient } from '@/lib/supabase/server'

/**
 * Metric types that can be recorded
 */
export type MetricField =
  | 'extractions_started'
  | 'extractions_completed'
  | 'extractions_failed'
  | 'cache_hits'
  | 'total_entries_created'
  | 'retrieval_calls'
  | 'total_extraction_tokens'
  | 'total_keyword_tokens'

/**
 * Record an incremental metric.
 * Uses upsert to create or update the hourly metric record.
 */
export async function recordMetric(
  field: MetricField,
  increment: number = 1
): Promise<void> {
  if (increment === 0) return

  const supabase = createAdminClient()
  const now = new Date()
  const metricDate = now.toISOString().split('T')[0]
  const metricHour = now.getUTCHours()

  try {
    // Use raw SQL for atomic increment with upsert
    const { error } = await supabase.rpc('record_context_metric', {
      p_metric_date: metricDate,
      p_metric_hour: metricHour,
      p_field: field,
      p_increment: increment,
    })

    if (error) {
      // Fallback to manual upsert if RPC doesn't exist
      await fallbackRecordMetric(supabase, metricDate, metricHour, field, increment)
    }
  } catch {
    // Silently fail - metrics are non-critical
    console.warn(`[Context Metrics] Failed to record metric: ${field}`)
  }
}

/**
 * Fallback method using manual upsert when RPC is unavailable
 */
async function fallbackRecordMetric(
  supabase: ReturnType<typeof createAdminClient>,
  metricDate: string,
  metricHour: number,
  field: MetricField,
  increment: number
): Promise<void> {
  // First try to get existing record
  const { data: existing } = await supabase
    .from('context_metrics')
    .select('id, ' + field)
    .eq('metric_date', metricDate)
    .eq('metric_hour', metricHour)
    .single()

  if (existing && typeof existing === 'object' && 'id' in existing) {
    // Update existing record
    const record = existing as unknown as Record<string, unknown>
    const currentValue = typeof record[field] === 'number' ? record[field] : 0
    await supabase
      .from('context_metrics')
      .update({ [field]: (currentValue as number) + increment })
      .eq('id', record.id as string)
  } else {
    // Insert new record
    await supabase.from('context_metrics').insert({
      metric_date: metricDate,
      metric_hour: metricHour,
      [field]: increment,
    })
  }
}

/**
 * Record average quality score for the hour.
 * This is a weighted update to maintain the running average.
 */
export async function recordAverageQualityScore(
  avgScore: number,
  entryCount: number
): Promise<void> {
  if (entryCount === 0) return

  const supabase = createAdminClient()
  const now = new Date()
  const metricDate = now.toISOString().split('T')[0]
  const metricHour = now.getUTCHours()

  try {
    // Get existing record
    const { data: existing } = await supabase
      .from('context_metrics')
      .select('id, avg_quality_score, total_entries_created')
      .eq('metric_date', metricDate)
      .eq('metric_hour', metricHour)
      .single()

    if (existing) {
      // Calculate weighted average
      const existingCount = existing.total_entries_created || 0
      const existingAvg = existing.avg_quality_score || 0
      const totalCount = existingCount + entryCount
      const newAvg = totalCount > 0
        ? (existingAvg * existingCount + avgScore * entryCount) / totalCount
        : avgScore

      await supabase
        .from('context_metrics')
        .update({ avg_quality_score: newAvg })
        .eq('id', existing.id)
    } else {
      // Insert new record with initial average
      await supabase.from('context_metrics').insert({
        metric_date: metricDate,
        metric_hour: metricHour,
        avg_quality_score: avgScore,
        total_entries_created: entryCount,
      })
    }
  } catch {
    console.warn('[Context Metrics] Failed to record quality score')
  }
}

/**
 * Record average retrieval latency for the hour.
 */
export async function recordRetrievalLatency(latencyMs: number): Promise<void> {
  const supabase = createAdminClient()
  const now = new Date()
  const metricDate = now.toISOString().split('T')[0]
  const metricHour = now.getUTCHours()

  try {
    const { data: existing } = await supabase
      .from('context_metrics')
      .select('id, avg_retrieval_latency_ms, retrieval_calls')
      .eq('metric_date', metricDate)
      .eq('metric_hour', metricHour)
      .single()

    if (existing) {
      // Calculate running average
      const existingCalls = existing.retrieval_calls || 0
      const existingLatency = existing.avg_retrieval_latency_ms || 0
      const totalCalls = existingCalls + 1
      const newAvg = Math.round(
        (existingLatency * existingCalls + latencyMs) / totalCalls
      )

      await supabase
        .from('context_metrics')
        .update({
          avg_retrieval_latency_ms: newAvg,
          retrieval_calls: totalCalls,
        })
        .eq('id', existing.id)
    } else {
      await supabase.from('context_metrics').insert({
        metric_date: metricDate,
        metric_hour: metricHour,
        avg_retrieval_latency_ms: Math.round(latencyMs),
        retrieval_calls: 1,
      })
    }
  } catch {
    console.warn('[Context Metrics] Failed to record retrieval latency')
  }
}

/**
 * Get summary metrics for the last N hours
 */
export async function getMetricsSummary(hours: number = 24): Promise<{
  extractionsStarted: number
  extractionsCompleted: number
  extractionsFailed: number
  cacheHits: number
  entriesCreated: number
  avgQualityScore: number | null
  avgRetrievalLatencyMs: number | null
  successRate: number
}> {
  const supabase = createAdminClient()
  const cutoff = new Date()
  cutoff.setHours(cutoff.getHours() - hours)

  const { data: metrics } = await supabase
    .from('context_metrics')
    .select('*')
    .gte('created_at', cutoff.toISOString())

  if (!metrics || metrics.length === 0) {
    return {
      extractionsStarted: 0,
      extractionsCompleted: 0,
      extractionsFailed: 0,
      cacheHits: 0,
      entriesCreated: 0,
      avgQualityScore: null,
      avgRetrievalLatencyMs: null,
      successRate: 0,
    }
  }

  // Aggregate metrics
  const totals = metrics.reduce(
    (acc, m) => ({
      extractionsStarted: acc.extractionsStarted + (m.extractions_started || 0),
      extractionsCompleted: acc.extractionsCompleted + (m.extractions_completed || 0),
      extractionsFailed: acc.extractionsFailed + (m.extractions_failed || 0),
      cacheHits: acc.cacheHits + (m.cache_hits || 0),
      entriesCreated: acc.entriesCreated + (m.total_entries_created || 0),
      qualityScoreSum: acc.qualityScoreSum + (m.avg_quality_score || 0) * (m.total_entries_created || 0),
      qualityScoreCount: acc.qualityScoreCount + (m.total_entries_created || 0),
      latencySum: acc.latencySum + (m.avg_retrieval_latency_ms || 0) * (m.retrieval_calls || 0),
      latencyCount: acc.latencyCount + (m.retrieval_calls || 0),
    }),
    {
      extractionsStarted: 0,
      extractionsCompleted: 0,
      extractionsFailed: 0,
      cacheHits: 0,
      entriesCreated: 0,
      qualityScoreSum: 0,
      qualityScoreCount: 0,
      latencySum: 0,
      latencyCount: 0,
    }
  )

  const totalJobs = totals.extractionsCompleted + totals.extractionsFailed
  const successRate = totalJobs > 0 ? (totals.extractionsCompleted / totalJobs) * 100 : 0

  return {
    extractionsStarted: totals.extractionsStarted,
    extractionsCompleted: totals.extractionsCompleted,
    extractionsFailed: totals.extractionsFailed,
    cacheHits: totals.cacheHits,
    entriesCreated: totals.entriesCreated,
    avgQualityScore: totals.qualityScoreCount > 0
      ? totals.qualityScoreSum / totals.qualityScoreCount
      : null,
    avgRetrievalLatencyMs: totals.latencyCount > 0
      ? Math.round(totals.latencySum / totals.latencyCount)
      : null,
    successRate: Math.round(successRate * 100) / 100,
  }
}
