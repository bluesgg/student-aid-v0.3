/**
 * Sticker Metrics Collection Module
 * 
 * Collects and aggregates metrics for:
 * - Cache hit/miss rates
 * - Generation latencies
 * - Worker performance
 * - Error rates
 */

import { createAdminClient } from '@/lib/supabase/server'

// ==================== Types ====================

export interface StickerMetricsSnapshot {
  period: 'hour' | 'day' | 'week'
  startTime: string
  endTime: string
  
  // Cache performance
  cacheHits: number
  cacheMisses: number
  cacheHitRate: number
  
  // Generation stats
  totalGenerations: number
  successfulGenerations: number
  failedGenerations: number
  successRate: number
  
  // Latency stats
  avgLatencyMs: number
  p50LatencyMs: number
  p95LatencyMs: number
  p99LatencyMs: number
  
  // Worker stats
  totalJobsProcessed: number
  avgRetries: number
  zombieJobsCleaned: number
  
  // Content stats
  uniquePdfHashes: number
  sharedCacheEntries: number
  totalStickersGenerated: number
}

export interface WorkerHealthStatus {
  isHealthy: boolean
  lastRunAt: string | null
  pendingJobs: number
  stuckJobs: number
  avgJobDuration: number
}

export interface CacheEfficiencyReport {
  totalCanonicalDocs: number
  totalSharedStickers: number
  avgReferencesPerDoc: number
  estimatedCostSavings: number  // Estimated $ saved by caching
  topSharedDocs: Array<{
    pdfHash: string
    referenceCount: number
    totalStickers: number
  }>
}

// ==================== Metrics Collection ====================

/**
 * Get aggregated sticker metrics for a time period
 */
export async function getStickerMetrics(
  period: 'hour' | 'day' | 'week' = 'day'
): Promise<StickerMetricsSnapshot> {
  const supabase = createAdminClient()
  
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

  // Get latency samples for the period
  const { data: latencySamples } = await supabase
    .from('sticker_latency_samples')
    .select('latency_ms, cache_hit')
    .gte('sampled_at', startTime.toISOString())
    .lte('sampled_at', now.toISOString())

  // Get generation stats from shared_auto_stickers
  const { data: generations } = await supabase
    .from('shared_auto_stickers')
    .select('status, attempts, generation_time_ms')
    .gte('created_at', startTime.toISOString())
    .lte('created_at', now.toISOString())

  // Get unique PDF hashes
  const { count: uniquePdfCount } = await supabase
    .from('canonical_documents')
    .select('*', { count: 'exact', head: true })
    .gte('first_seen_at', startTime.toISOString())

  // Get shared sticker count
  const { count: sharedStickerCount } = await supabase
    .from('shared_auto_stickers')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'ready')

  // Calculate metrics
  const samples = latencySamples || []
  const gens = generations || []
  
  const cacheHits = samples.filter(s => s.cache_hit).length
  const cacheMisses = samples.filter(s => !s.cache_hit).length
  const totalSamples = samples.length
  
  const successfulGens = gens.filter(g => g.status === 'ready').length
  const failedGens = gens.filter(g => g.status === 'failed').length
  
  // Calculate latency percentiles
  const latencies = samples.map(s => s.latency_ms).filter(l => l !== null).sort((a, b) => a - b)
  const avgLatency = latencies.length > 0 
    ? latencies.reduce((a, b) => a + b, 0) / latencies.length 
    : 0
  
  const getPercentile = (arr: number[], p: number) => {
    if (arr.length === 0) return 0
    const idx = Math.ceil(arr.length * p / 100) - 1
    return arr[Math.max(0, idx)]
  }

  // Calculate average retries
  const avgRetries = gens.length > 0
    ? gens.reduce((sum, g) => sum + (g.attempts || 0), 0) / gens.length
    : 0

  return {
    period,
    startTime: startTime.toISOString(),
    endTime: now.toISOString(),
    
    cacheHits,
    cacheMisses,
    cacheHitRate: totalSamples > 0 ? cacheHits / totalSamples : 0,
    
    totalGenerations: gens.length,
    successfulGenerations: successfulGens,
    failedGenerations: failedGens,
    successRate: gens.length > 0 ? successfulGens / gens.length : 0,
    
    avgLatencyMs: Math.round(avgLatency),
    p50LatencyMs: getPercentile(latencies, 50),
    p95LatencyMs: getPercentile(latencies, 95),
    p99LatencyMs: getPercentile(latencies, 99),
    
    totalJobsProcessed: successfulGens + failedGens,
    avgRetries: Math.round(avgRetries * 100) / 100,
    zombieJobsCleaned: 0, // Would need separate tracking
    
    uniquePdfHashes: uniquePdfCount || 0,
    sharedCacheEntries: sharedStickerCount || 0,
    totalStickersGenerated: successfulGens,
  }
}

/**
 * Get worker health status
 */
export async function getWorkerHealth(): Promise<WorkerHealthStatus> {
  const supabase = createAdminClient()
  
  const now = new Date()
  const lockTimeout = new Date(now.getTime() - 15 * 60 * 1000) // 15 minutes

  // Get pending jobs count
  const { count: pendingCount } = await supabase
    .from('shared_auto_stickers')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'generating')
    .lte('run_after', now.toISOString())

  // Get stuck jobs (locked for more than 15 minutes)
  const { count: stuckCount } = await supabase
    .from('shared_auto_stickers')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'generating')
    .lt('locked_at', lockTimeout.toISOString())

  // Get last completed job
  const { data: lastCompleted } = await supabase
    .from('shared_auto_stickers')
    .select('completed_at, generation_time_ms')
    .eq('status', 'ready')
    .order('completed_at', { ascending: false })
    .limit(10)

  const lastRunAt = lastCompleted?.[0]?.completed_at || null
  const avgDuration = lastCompleted && lastCompleted.length > 0
    ? lastCompleted.reduce((sum, j) => sum + (j.generation_time_ms || 0), 0) / lastCompleted.length
    : 0

  // Worker is healthy if:
  // 1. Last run was within 10 minutes OR no pending jobs
  // 2. No stuck jobs
  const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000)
  const isHealthy = (
    (lastRunAt && new Date(lastRunAt) > tenMinutesAgo) || 
    (pendingCount || 0) === 0
  ) && (stuckCount || 0) === 0

  return {
    isHealthy,
    lastRunAt,
    pendingJobs: pendingCount || 0,
    stuckJobs: stuckCount || 0,
    avgJobDuration: Math.round(avgDuration),
  }
}

/**
 * Get cache efficiency report
 */
export async function getCacheEfficiencyReport(): Promise<CacheEfficiencyReport> {
  const supabase = createAdminClient()

  // Get total canonical docs
  const { count: totalDocs } = await supabase
    .from('canonical_documents')
    .select('*', { count: 'exact', head: true })

  // Get total shared stickers
  const { count: totalStickers } = await supabase
    .from('shared_auto_stickers')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'ready')

  // Get docs with references
  const { data: docsWithRefs } = await supabase
    .from('canonical_documents')
    .select('pdf_hash, reference_count')
    .gt('reference_count', 0)
    .order('reference_count', { ascending: false })
    .limit(10)

  // Calculate average references per doc
  const avgRefs = docsWithRefs && docsWithRefs.length > 0
    ? docsWithRefs.reduce((sum, d) => sum + d.reference_count, 0) / docsWithRefs.length
    : 0

  // Get top shared docs with sticker counts
  const topSharedDocs: CacheEfficiencyReport['topSharedDocs'] = []
  
  if (docsWithRefs) {
    for (const doc of docsWithRefs.slice(0, 5)) {
      const { count } = await supabase
        .from('shared_auto_stickers')
        .select('*', { count: 'exact', head: true })
        .eq('pdf_hash', doc.pdf_hash)
        .eq('status', 'ready')

      topSharedDocs.push({
        pdfHash: doc.pdf_hash,
        referenceCount: doc.reference_count,
        totalStickers: count || 0,
      })
    }
  }

  // Estimate cost savings
  // Assume $0.01 per generation (rough GPT-4 cost)
  // Savings = (total references - unique docs) * cost per generation
  const totalReferences = docsWithRefs?.reduce((sum, d) => sum + d.reference_count, 0) || 0
  const uniqueDocs = docsWithRefs?.length || 0
  const savedGenerations = Math.max(0, totalReferences - uniqueDocs)
  const estimatedSavings = savedGenerations * 0.01

  return {
    totalCanonicalDocs: totalDocs || 0,
    totalSharedStickers: totalStickers || 0,
    avgReferencesPerDoc: Math.round(avgRefs * 100) / 100,
    estimatedCostSavings: Math.round(estimatedSavings * 100) / 100,
    topSharedDocs,
  }
}

/**
 * Record a metric event (for real-time tracking)
 */
export async function recordMetricEvent(
  eventType: 'cache_hit' | 'cache_miss' | 'generation_start' | 'generation_complete' | 'generation_fail',
  metadata?: Record<string, unknown>
): Promise<void> {
  const supabase = createAdminClient()

  try {
    await supabase
      .from('sticker_metrics')
      .insert({
        event_type: eventType,
        metadata,
        recorded_at: new Date().toISOString(),
      })
  } catch (error) {
    // Non-fatal - just log
    console.error('Failed to record metric event:', error)
  }
}
