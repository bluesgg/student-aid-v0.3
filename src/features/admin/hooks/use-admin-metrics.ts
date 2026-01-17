import { useQuery } from '@tanstack/react-query'

export interface StickerMetrics {
  period: 'hour' | 'day' | 'week'
  startTime: string
  endTime: string
  cacheHits: number
  cacheMisses: number
  cacheHitRate: number
  totalGenerations: number
  successfulGenerations: number
  failedGenerations: number
  successRate: number
  avgLatencyMs: number
  p50LatencyMs: number
  p95LatencyMs: number
  p99LatencyMs: number
  totalJobsProcessed: number
  avgRetries: number
  zombieJobsCleaned: number
  uniquePdfHashes: number
  sharedCacheEntries: number
  totalStickersGenerated: number
}

export interface WorkerHealth {
  isHealthy: boolean
  lastRunAt: string | null
  pendingJobs: number
  stuckJobs: number
  avgJobDuration: number
}

export interface CacheEfficiency {
  totalCanonicalDocs: number
  totalSharedStickers: number
  avgReferencesPerDoc: number
  estimatedCostSavings: number
  topSharedDocs: Array<{
    pdfHash: string
    referenceCount: number
    totalStickers: number
  }>
}

export interface AdminMetricsResponse {
  metrics?: StickerMetrics
  workerHealth?: WorkerHealth
  cacheEfficiency?: CacheEfficiency
}

async function fetchAdminMetrics(
  period: 'hour' | 'day' | 'week',
  adminSecret: string
): Promise<AdminMetricsResponse> {
  const response = await fetch(`/api/admin/metrics?period=${period}&include=all`, {
    headers: {
      'x-admin-secret': adminSecret,
    },
  })

  if (!response.ok) {
    throw new Error('Failed to fetch admin metrics')
  }

  const result = await response.json()
  return result.data
}

export function useAdminMetrics(period: 'hour' | 'day' | 'week', adminSecret: string) {
  return useQuery({
    queryKey: ['admin-metrics', period],
    queryFn: () => fetchAdminMetrics(period, adminSecret),
    enabled: !!adminSecret,
    staleTime: 60 * 1000, // 1 minute
    retry: false,
  })
}
