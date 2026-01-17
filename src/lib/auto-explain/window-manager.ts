/**
 * Sliding Window Manager for Auto-Explain Sessions
 * Manages window state, request concurrency, and cancellation.
 */

import { createAdminClient } from '@/lib/supabase/server'

// Window configuration
const WINDOW_BEFORE = 2 // Pages before current
const WINDOW_AFTER = 5 // Pages after current
const MAX_CONCURRENT_REQUESTS = 3
const JUMP_THRESHOLD = 10 // Pages - triggers window reset

/**
 * Window state for a generation session
 */
export interface WindowState {
  sessionId: string
  userId: string
  fileId: string
  windowStart: number
  windowEnd: number
  currentPage: number
  pagesCompleted: number[]
  pagesInProgress: number[]
  pagesFailed: number[]
  state: 'active' | 'paused' | 'completed' | 'canceled'
}

/**
 * Page generation request
 */
export interface PageGenerationRequest {
  page: number
  abortController: AbortController
}

/**
 * Calculate window range for a given page
 * @param currentPage - Current page number (1-indexed)
 * @param totalPages - Total pages in PDF
 * @returns Window start and end (inclusive)
 */
export function calculateWindow(
  currentPage: number,
  totalPages: number
): { start: number; end: number } {
  const start = Math.max(1, currentPage - WINDOW_BEFORE)
  const end = Math.min(totalPages, currentPage + WINDOW_AFTER)
  return { start, end }
}

/**
 * Determine if navigation is a "jump" (large page change)
 * @param fromPage - Previous page
 * @param toPage - New page
 * @returns True if jump detected
 */
export function isJump(fromPage: number, toPage: number): boolean {
  return Math.abs(toPage - fromPage) > JUMP_THRESHOLD
}

/**
 * Get pages that need generation (not completed, not in progress)
 * Returns pages in priority order: current, +1, -1, +2, +3, -2, +4, +5
 */
export function getPagesToGenerate(
  windowStart: number,
  windowEnd: number,
  pagesCompleted: number[],
  pagesInProgress: number[],
  currentPage?: number
): number[] {
  const completedSet = new Set(pagesCompleted)
  const inProgressSet = new Set(pagesInProgress)

  // If no currentPage provided, use windowStart + WINDOW_BEFORE as estimate
  const center = currentPage ?? (windowStart + WINDOW_BEFORE)

  // Priority order relative to current page: 0, +1, -1, +2, +3, -2, +4, +5
  const priorityOffsets = [0, 1, -1, 2, 3, -2, 4, 5]

  const pages: number[] = []

  for (const offset of priorityOffsets) {
    const page = center + offset
    if (
      page >= windowStart &&
      page <= windowEnd &&
      !completedSet.has(page) &&
      !inProgressSet.has(page)
    ) {
      pages.push(page)
    }
  }

  return pages
}

/**
 * Get pages outside the new window that should be canceled
 */
export function getPagesToCancel(
  newWindowStart: number,
  newWindowEnd: number,
  pagesInProgress: number[]
): number[] {
  return pagesInProgress.filter(
    (page) => page < newWindowStart || page > newWindowEnd
  )
}

/**
 * Window Manager class for managing concurrent page generation
 */
export class WindowManager {
  private activeRequests: Map<number, AbortController> = new Map()
  private sessionId: string

  constructor(sessionId: string) {
    this.sessionId = sessionId
  }

  /**
   * Check if we can start a new request (within concurrency limit)
   */
  canStartRequest(): boolean {
    return this.activeRequests.size < MAX_CONCURRENT_REQUESTS
  }

  /**
   * Get number of active requests
   */
  getActiveRequestCount(): number {
    return this.activeRequests.size
  }

  /**
   * Start tracking a page generation request
   */
  startRequest(page: number): AbortController {
    const controller = new AbortController()
    this.activeRequests.set(page, controller)
    return controller
  }

  /**
   * Complete a page generation request
   */
  completeRequest(page: number): void {
    this.activeRequests.delete(page)
  }

  /**
   * Cancel a specific page request
   */
  cancelRequest(page: number): boolean {
    const controller = this.activeRequests.get(page)
    if (controller) {
      controller.abort()
      this.activeRequests.delete(page)
      return true
    }
    return false
  }

  /**
   * Cancel all requests outside the given window
   * Returns pages that were canceled
   */
  cancelOutsideWindow(start: number, end: number): number[] {
    const canceled: number[] = []

    Array.from(this.activeRequests.entries()).forEach(([page, controller]) => {
      if (page < start || page > end) {
        controller.abort()
        this.activeRequests.delete(page)
        canceled.push(page)
      }
    })

    return canceled
  }

  /**
   * Cancel all active requests
   */
  cancelAll(): number[] {
    const canceled = Array.from(this.activeRequests.keys())

    Array.from(this.activeRequests.values()).forEach((controller) => {
      controller.abort()
    })
    this.activeRequests.clear()

    return canceled
  }

  /**
   * Get list of pages with active requests
   */
  getActivePaes(): number[] {
    return Array.from(this.activeRequests.keys())
  }

  /**
   * Wait until we can start a new request
   * @param timeoutMs - Maximum wait time
   * @returns True if slot available, false if timed out
   */
  async waitForSlot(timeoutMs: number = 10000): Promise<boolean> {
    const startTime = Date.now()
    const pollInterval = 100

    while (Date.now() - startTime < timeoutMs) {
      if (this.canStartRequest()) {
        return true
      }
      await new Promise((resolve) => setTimeout(resolve, pollInterval))
    }

    return false
  }
}

/**
 * Start a new auto-explain session
 * @param userId - User ID
 * @param fileId - File ID
 * @param startPage - Initial page number
 * @param pdfType - Detected PDF type
 * @returns Session info or error
 */
export async function startSession(
  userId: string,
  fileId: string,
  startPage: number,
  pdfType: 'ppt' | 'text'
): Promise<
  | { success: true; session: WindowState }
  | { success: false; error: string }
> {
  const supabase = createAdminClient()

  // Use database function to start session
  const { data, error } = await supabase.rpc('start_auto_explain_session', {
    p_user_id: userId,
    p_file_id: fileId,
    p_start_page: startPage,
    p_pdf_type: pdfType,
  })

  if (error) {
    console.error('Error starting session:', error)
    return { success: false, error: 'DATABASE_ERROR' }
  }

  const result = data?.[0]
  if (result?.error_code) {
    return { success: false, error: result.error_code }
  }

  return {
    success: true,
    session: {
      sessionId: result.session_id,
      userId,
      fileId,
      windowStart: result.window_start,
      windowEnd: result.window_end,
      currentPage: startPage,
      pagesCompleted: [],
      pagesInProgress: [],
      pagesFailed: [],
      state: 'active',
    },
  }
}

/**
 * Update session window on page navigation
 */
export async function updateSessionWindow(
  sessionId: string,
  currentPage: number,
  action: 'extend' | 'jump' | 'cancel'
): Promise<
  | {
      success: true
      windowStart: number
      windowEnd: number
      canceledPages: number[]
      newPages: number[]
    }
  | { success: false; error: string }
> {
  const supabase = createAdminClient()

  const { data, error } = await supabase.rpc('update_session_window', {
    p_session_id: sessionId,
    p_current_page: currentPage,
    p_action: action,
  })

  if (error) {
    console.error('Error updating session:', error)
    return { success: false, error: 'DATABASE_ERROR' }
  }

  const result = data?.[0]
  if (result?.error_code) {
    return { success: false, error: result.error_code }
  }

  return {
    success: true,
    windowStart: result.window_start,
    windowEnd: result.window_end,
    canceledPages: result.canceled_pages || [],
    newPages: result.new_pages || [],
  }
}

/**
 * Get current session state
 */
export async function getSessionState(
  sessionId: string
): Promise<WindowState | null> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('auto_explain_sessions')
    .select('*')
    .eq('id', sessionId)
    .single()

  if (error || !data) {
    return null
  }

  return {
    sessionId: data.id,
    userId: data.user_id,
    fileId: data.file_id,
    windowStart: data.window_start,
    windowEnd: data.window_end,
    currentPage: data.current_page,
    pagesCompleted: data.pages_completed || [],
    pagesInProgress: data.pages_in_progress || [],
    pagesFailed: data.pages_failed || [],
    state: data.state,
  }
}

/**
 * Update session progress (pages completed/failed)
 */
export async function updateSessionProgress(
  sessionId: string,
  updates: {
    pageCompleted?: number
    pageFailed?: number
    pageStarted?: number
  }
): Promise<boolean> {
  const supabase = createAdminClient()

  // Get current state
  const { data: session } = await supabase
    .from('auto_explain_sessions')
    .select('pages_completed, pages_in_progress, pages_failed')
    .eq('id', sessionId)
    .single()

  if (!session) return false

  const completed = new Set(session.pages_completed || [])
  const inProgress = new Set(session.pages_in_progress || [])
  const failed = new Set(session.pages_failed || [])

  if (updates.pageStarted) {
    inProgress.add(updates.pageStarted)
  }

  if (updates.pageCompleted) {
    inProgress.delete(updates.pageCompleted)
    completed.add(updates.pageCompleted)
  }

  if (updates.pageFailed) {
    inProgress.delete(updates.pageFailed)
    failed.add(updates.pageFailed)
  }

  const { error } = await supabase
    .from('auto_explain_sessions')
    .update({
      pages_completed: Array.from(completed),
      pages_in_progress: Array.from(inProgress),
      pages_failed: Array.from(failed),
      last_activity_at: new Date().toISOString(),
    })
    .eq('id', sessionId)

  return !error
}

/**
 * Get active session for user-file combination
 */
export async function getActiveSession(
  userId: string,
  fileId: string
): Promise<WindowState | null> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('auto_explain_sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('file_id', fileId)
    .eq('state', 'active')
    .single()

  if (error || !data) {
    return null
  }

  return {
    sessionId: data.id,
    userId: data.user_id,
    fileId: data.file_id,
    windowStart: data.window_start,
    windowEnd: data.window_end,
    currentPage: data.current_page,
    pagesCompleted: data.pages_completed || [],
    pagesInProgress: data.pages_in_progress || [],
    pagesFailed: data.pages_failed || [],
    state: data.state,
  }
}

/**
 * Cancel a session
 */
export async function cancelSession(sessionId: string): Promise<boolean> {
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('auto_explain_sessions')
    .update({
      state: 'canceled',
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId)

  return !error
}

/**
 * Mark session as completed
 */
export async function completeSession(sessionId: string): Promise<boolean> {
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('auto_explain_sessions')
    .update({
      state: 'completed',
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId)

  return !error
}
