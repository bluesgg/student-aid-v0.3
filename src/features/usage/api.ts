/**
 * Usage/Quota API client functions.
 */

import { get, type ApiResult } from '@/lib/api-client'

export interface QuotaBucket {
  bucket: string
  used: number
  limit: number
  resetAt: string | null
}

export interface QuotaSummary {
  used: number
  limit: number
  remaining: number
  percentUsed: number
}

export interface QuotaResponse {
  buckets: QuotaBucket[]
  summary: QuotaSummary
}

/**
 * Get current user's quota usage
 */
export function getQuotas(): Promise<ApiResult<QuotaResponse>> {
  return get<QuotaResponse>('/api/quotas')
}
