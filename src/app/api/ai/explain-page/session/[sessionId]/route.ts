import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { successResponse, errors } from '@/lib/api-response'
import {
  getSessionState,
  updateSessionWindow,
  cancelSession,
  isJump,
} from '@/lib/auto-explain'
import { z } from 'zod'

/**
 * Request schema for PATCH (update window)
 */
const updateSchema = z.object({
  currentPage: z.number().int().positive(),
  action: z.enum(['extend', 'jump', 'cancel']),
})

/**
 * GET /api/ai/explain-page/session/[sessionId]
 * Get session status and progress
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    const supabase = createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return errors.unauthorized()
    }

    const session = await getSessionState(params.sessionId)

    if (!session) {
      return errors.notFound('Session')
    }

    // Verify ownership
    if (session.userId !== user.id) {
      return errors.notFound('Session')
    }

    // Calculate progress
    const totalPages = session.windowEnd - session.windowStart + 1
    const completedCount = session.pagesCompleted.length
    const inProgressCount = session.pagesInProgress.length
    const failedCount = session.pagesFailed.length
    const pendingCount = totalPages - completedCount - inProgressCount - failedCount

    return successResponse({
      sessionId: session.sessionId,
      state: session.state,
      windowRange: {
        start: session.windowStart,
        end: session.windowEnd,
      },
      currentPage: session.currentPage,
      progress: {
        total: totalPages,
        completed: completedCount,
        inProgress: inProgressCount,
        failed: failedCount,
        pending: pendingCount,
        percentage: Math.round((completedCount / totalPages) * 100),
      },
      pagesCompleted: session.pagesCompleted,
      pagesInProgress: session.pagesInProgress,
      pagesFailed: session.pagesFailed,
    })
  } catch (error) {
    console.error('Error getting session:', error)
    return errors.internalError()
  }
}

/**
 * PATCH /api/ai/explain-page/session/[sessionId]
 * Update window on page navigation
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    const supabase = createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return errors.unauthorized()
    }

    // Get current session to verify ownership
    const currentSession = await getSessionState(params.sessionId)

    if (!currentSession) {
      return errors.notFound('Session')
    }

    if (currentSession.userId !== user.id) {
      return errors.notFound('Session')
    }

    if (currentSession.state !== 'active') {
      return errors.custom(
        'SESSION_NOT_ACTIVE',
        `Session is ${currentSession.state}`,
        400
      )
    }

    // Parse request body
    const body = await request.json()
    const parseResult = updateSchema.safeParse(body)

    if (!parseResult.success) {
      return errors.invalidInput(parseResult.error.errors[0].message)
    }

    const { currentPage, action } = parseResult.data

    // Determine action if not explicitly 'cancel'
    let effectiveAction = action
    if (action !== 'cancel') {
      // Auto-detect jump
      if (isJump(currentSession.currentPage, currentPage)) {
        effectiveAction = 'jump'
      }
    }

    // Update session
    const result = await updateSessionWindow(
      params.sessionId,
      currentPage,
      effectiveAction
    )

    if (!result.success) {
      return errors.custom('UPDATE_FAILED', result.error, 400)
    }

    return successResponse({
      ok: true,
      windowRange: {
        start: result.windowStart,
        end: result.windowEnd,
      },
      canceledPages: result.canceledPages,
      newPages: result.newPages,
      action: effectiveAction,
    })
  } catch (error) {
    console.error('Error updating session:', error)
    return errors.internalError()
  }
}

/**
 * DELETE /api/ai/explain-page/session/[sessionId]
 * Cancel session
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    const supabase = createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return errors.unauthorized()
    }

    // Get current session to verify ownership
    const currentSession = await getSessionState(params.sessionId)

    if (!currentSession) {
      return errors.notFound('Session')
    }

    if (currentSession.userId !== user.id) {
      return errors.notFound('Session')
    }

    // Cancel session
    const success = await cancelSession(params.sessionId)

    if (!success) {
      return errors.internalError()
    }

    return successResponse({
      ok: true,
      message: 'Session canceled',
    })
  } catch (error) {
    console.error('Error canceling session:', error)
    return errors.internalError()
  }
}
