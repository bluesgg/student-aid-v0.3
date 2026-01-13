/**
 * POST /api/internal/context-worker/cleanup - Cron endpoint for cleaning up old jobs
 *
 * This endpoint should be triggered by Vercel Cron or an external scheduler daily.
 * It deletes completed extraction jobs older than 7 days and failure logs older than 30 days.
 *
 * Authentication: Requires WORKER_SECRET environment variable
 */

import { NextRequest, NextResponse } from 'next/server'
import { cleanupOldJobs, type CleanupResult } from '@/lib/context/extraction-worker'

/**
 * Verify worker authentication using WORKER_SECRET
 */
function verifyWorkerAuth(request: NextRequest): boolean {
  // Check Authorization header
  const authHeader = request.headers.get('authorization')
  if (authHeader) {
    const token = authHeader.replace('Bearer ', '')
    if (token === process.env.WORKER_SECRET) {
      return true
    }
  }

  // Check x-worker-secret header (alternative)
  const secretHeader = request.headers.get('x-worker-secret')
  if (secretHeader === process.env.WORKER_SECRET) {
    return true
  }

  // Check Vercel Cron authorization header
  const cronSecret = request.headers.get('authorization')
  if (cronSecret === `Bearer ${process.env.CRON_SECRET}`) {
    return true
  }

  return false
}

/**
 * POST /api/internal/context-worker/cleanup
 * Clean up old completed extraction jobs and failure logs
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Skip auth in development for testing
  const isDev = process.env.NODE_ENV === 'development'

  if (!isDev && !verifyWorkerAuth(request)) {
    return NextResponse.json(
      { error: 'Unauthorized', code: 'UNAUTHORIZED' },
      { status: 401 }
    )
  }

  try {
    // Parse optional daysOld parameter
    let daysOld = 7
    try {
      const body = await request.json()
      if (body.daysOld && typeof body.daysOld === 'number' && body.daysOld > 0) {
        daysOld = body.daysOld
      }
    } catch {
      // Use default if no body or invalid JSON
    }

    const result: CleanupResult = await cleanupOldJobs(daysOld)

    // Log results for monitoring
    console.log('[Context Cleanup] Cleanup completed:', {
      deletedJobs: result.deletedJobs,
      deletedFailures: result.deletedFailures,
      error: result.error,
    })

    return NextResponse.json({
      success: !result.error,
      result: {
        deletedJobs: result.deletedJobs,
        deletedFailures: result.deletedFailures,
      },
      ...(result.error && { error: result.error }),
    })
  } catch (error) {
    console.error('[Context Cleanup] Cleanup failed:', error)

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        code: 'CLEANUP_ERROR',
      },
      { status: 500 }
    )
  }
}
