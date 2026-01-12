/**
 * GET /api/admin/metrics - Get sticker generation metrics
 * 
 * Protected admin endpoint for monitoring sticker cache and worker performance.
 * Requires ADMIN_SECRET header for authentication.
 */

import { NextRequest } from 'next/server'
import { successResponse, errors } from '@/lib/api-response'
import {
  getStickerMetrics,
  getWorkerHealth,
  getCacheEfficiencyReport,
} from '@/lib/metrics/sticker-metrics'

/**
 * Verify admin authentication
 */
function verifyAdminAuth(request: NextRequest): boolean {
  const adminSecret = process.env.ADMIN_SECRET
  
  if (!adminSecret) {
    console.warn('ADMIN_SECRET not configured')
    return false
  }

  const authHeader = request.headers.get('x-admin-secret')
  return authHeader === adminSecret
}

/**
 * GET /api/admin/metrics
 * 
 * Query parameters:
 * - period: 'hour' | 'day' | 'week' (default: 'day')
 * - include: comma-separated list of sections to include
 *   - 'metrics' (default)
 *   - 'health'
 *   - 'cache'
 *   - 'all'
 */
export async function GET(request: NextRequest) {
  // Verify admin authentication
  if (!verifyAdminAuth(request)) {
    return errors.custom('ADMIN_UNAUTHORIZED', 'Invalid or missing admin credentials', 401)
  }

  try {
    const searchParams = request.nextUrl.searchParams
    const period = (searchParams.get('period') || 'day') as 'hour' | 'day' | 'week'
    const includeParam = searchParams.get('include') || 'all'
    const sections = includeParam.split(',').map(s => s.trim())

    const includeAll = sections.includes('all')
    const includeMetrics = includeAll || sections.includes('metrics')
    const includeHealth = includeAll || sections.includes('health')
    const includeCache = includeAll || sections.includes('cache')

    const result: Record<string, unknown> = {}

    // Fetch requested sections in parallel
    const promises: Promise<void>[] = []

    if (includeMetrics) {
      promises.push(
        getStickerMetrics(period).then(metrics => {
          result.metrics = metrics
        })
      )
    }

    if (includeHealth) {
      promises.push(
        getWorkerHealth().then(health => {
          result.workerHealth = health
        })
      )
    }

    if (includeCache) {
      promises.push(
        getCacheEfficiencyReport().then(cache => {
          result.cacheEfficiency = cache
        })
      )
    }

    await Promise.all(promises)

    return successResponse(result)

  } catch (error) {
    console.error('Admin metrics error:', error)
    return errors.internalError()
  }
}
