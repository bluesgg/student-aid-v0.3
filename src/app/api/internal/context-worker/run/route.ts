/**
 * POST /api/internal/context-worker/run - Cron endpoint for context extraction worker
 *
 * This endpoint is triggered by Vercel Cron or an external scheduler every 1 minute.
 * It processes pending context extraction jobs from PDFs.
 *
 * Authentication: Requires WORKER_SECRET environment variable
 */

import { NextRequest, NextResponse } from 'next/server'
import { runContextWorker, ContextWorkerRunResult } from '@/lib/context/extraction-worker'

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
 * POST /api/internal/context-worker/run
 * Trigger the context extraction worker
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
    const result: ContextWorkerRunResult = await runContextWorker()

    // Log results for monitoring
    console.log('[Context Worker] Run completed:', {
      jobsProcessed: result.jobsProcessed,
      jobsSucceeded: result.jobsSucceeded,
      jobsFailed: result.jobsFailed,
      entriesCreated: result.entriesCreated,
      durationMs: result.durationMs,
      errors: result.errors.length > 0 ? result.errors : undefined,
    })

    return NextResponse.json({
      success: true,
      result: {
        jobsProcessed: result.jobsProcessed,
        jobsSucceeded: result.jobsSucceeded,
        jobsFailed: result.jobsFailed,
        entriesCreated: result.entriesCreated,
        durationMs: result.durationMs,
      },
      // Only include errors in response if there are any
      ...(result.errors.length > 0 && { errors: result.errors }),
    })
  } catch (error) {
    console.error('[Context Worker] Run failed:', error)

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        code: 'WORKER_ERROR',
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/internal/context-worker/run
 * Health check endpoint
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  // Skip auth in development for testing
  const isDev = process.env.NODE_ENV === 'development'

  if (!isDev && !verifyWorkerAuth(request)) {
    return NextResponse.json(
      { error: 'Unauthorized', code: 'UNAUTHORIZED' },
      { status: 401 }
    )
  }

  return NextResponse.json({
    status: 'ok',
    worker: 'context-extraction',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  })
}
