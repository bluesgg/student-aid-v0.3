'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { post, get, patch, del } from '@/lib/api-client'

/**
 * Session progress info
 */
export interface SessionProgress {
  total: number
  completed: number
  inProgress: number
  failed: number
  pending: number
  percentage: number
}

/**
 * Session state
 */
export interface AutoExplainSession {
  sessionId: string
  state: 'active' | 'paused' | 'completed' | 'canceled'
  windowRange: {
    start: number
    end: number
  }
  currentPage: number
  progress: SessionProgress
  pagesCompleted: number[]
  pagesInProgress: number[]
  pagesFailed: number[]
}

/**
 * Window mode explain request
 */
interface StartWindowExplainParams {
  courseId: string
  fileId: string
  page: number
  pdfType: 'Lecture' | 'Homework' | 'Exam' | 'Other'
  locale?: 'en' | 'zh' | 'zh-Hans'
  mode: 'window'
}

/**
 * Hook for managing auto-explain sessions with sliding window
 */
export function useAutoExplainSession(fileId: string) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<AutoExplainSession | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const hasInvalidatedRef = useRef(false)
  // Track previously completed pages to detect newly completed ones
  const prevCompletedPagesRef = useRef<Set<number>>(new Set())

  /**
   * Stop polling
   */
  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
  }, [])

  /**
   * Poll session status
   */
  const pollSession = useCallback(async (sessionId: string) => {
    try {
      const response = await get<AutoExplainSession>(
        `/api/ai/explain-page/session/${sessionId}`
      )

      if (!response.ok) {
        // Session not found or error - stop polling
        stopPolling()
        setSession(null)
        return
      }

      setSession(response.data)

      // Check for newly completed pages and refresh stickers progressively
      const currentCompleted = new Set(response.data.pagesCompleted)
      const prevCompleted = prevCompletedPagesRef.current
      const newlyCompleted: number[] = []

      currentCompleted.forEach((page) => {
        if (!prevCompleted.has(page)) {
          newlyCompleted.push(page)
        }
      })

      // If there are newly completed pages, invalidate stickers cache to show them
      if (newlyCompleted.length > 0) {
        prevCompletedPagesRef.current = currentCompleted
        queryClient.invalidateQueries({ queryKey: ['stickers', fileId] })
        console.log('Auto-explain: pages completed, refreshing stickers:', newlyCompleted)
      }

      // Stop polling if session is no longer active
      if (response.data.state !== 'active') {
        stopPolling()

        // Final refresh when session completes (catch any missed stickers)
        if (response.data.state === 'completed' && !hasInvalidatedRef.current) {
          hasInvalidatedRef.current = true
          queryClient.invalidateQueries({ queryKey: ['stickers', fileId] })
          console.log('Auto-explain session completed, final stickers refresh')
        }
      }
    } catch {
      // Ignore poll errors
    }
  }, [stopPolling, queryClient, fileId])

  /**
   * Start polling for session updates
   */
  const startPolling = useCallback(
    (sessionId: string) => {
      // Clear any existing poll
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
      }

      // Poll every 2 seconds
      pollIntervalRef.current = setInterval(() => {
        pollSession(sessionId)
      }, 2000)
    },
    [pollSession]
  )

  /**
   * Start auto-explain session from current page
   */
  const startSession = useCallback(
    async (params: Omit<StartWindowExplainParams, 'mode'>) => {
      // Prevent duplicate session start (re-entry guard)
      if (isStarting) {
        console.warn('Session is already starting')
        return null
      }

      if (session?.state === 'active') {
        console.warn('Session is already active')
        return null
      }

      setIsStarting(true)
      setError(null)
      hasInvalidatedRef.current = false // Reset invalidation flag for new session
      prevCompletedPagesRef.current = new Set() // Reset completed pages tracking

      try {
        const response = await post<{
          ok: boolean
          sessionId: string
          windowRange: { start: number; end: number }
          pdfType: 'ppt' | 'text'
          message: string
        }>('/api/ai/explain-page', {
          ...params,
          mode: 'window',
        })

        if (!response.ok) {
          setError(response.error?.message || 'Failed to start session')
          return null
        }

        const newSession: AutoExplainSession = {
          sessionId: response.data.sessionId,
          state: 'active',
          windowRange: response.data.windowRange,
          currentPage: params.page,
          progress: {
            total: response.data.windowRange.end - response.data.windowRange.start + 1,
            completed: 0,
            inProgress: 0,
            failed: 0,
            pending: response.data.windowRange.end - response.data.windowRange.start + 1,
            percentage: 0,
          },
          pagesCompleted: [],
          pagesInProgress: [],
          pagesFailed: [],
        }

        setSession(newSession)
        startPolling(response.data.sessionId)

        return newSession
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to start session'
        setError(message)
        return null
      } finally {
        setIsStarting(false)
      }
    },
    [startPolling, isStarting, session]
  )

  /**
   * Update window on page navigation
   */
  const updateWindow = useCallback(
    async (currentPage: number, action: 'extend' | 'jump' = 'extend') => {
      if (!session) return null

      try {
        const response = await patch<{
          ok: boolean
          windowRange: { start: number; end: number }
          canceledPages: number[]
          newPages: number[]
          action: string
        }>(`/api/ai/explain-page/session/${session.sessionId}`, {
          currentPage,
          action,
        })

        if (!response.ok) {
          return null
        }

        // Update local session state
        setSession((prev) =>
          prev
            ? {
                ...prev,
                windowRange: response.data.windowRange,
                currentPage,
              }
            : null
        )

        return response.data
      } catch {
        return null
      }
    },
    [session]
  )

  /**
   * Cancel the current session
   */
  const cancelSession = useCallback(async () => {
    if (!session) return false

    try {
      const response = await del<{ ok: boolean }>(
        `/api/ai/explain-page/session/${session.sessionId}`
      )

      if (response.ok) {
        stopPolling()
        setSession((prev) => (prev ? { ...prev, state: 'canceled' } : null))
        return true
      }
      return false
    } catch {
      return false
    }
  }, [session, stopPolling])

  /**
   * Check if page is being processed
   */
  const isPageProcessing = useCallback(
    (page: number) => {
      return session?.pagesInProgress.includes(page) ?? false
    },
    [session]
  )

  /**
   * Check if page has completed
   */
  const isPageCompleted = useCallback(
    (page: number) => {
      return session?.pagesCompleted.includes(page) ?? false
    },
    [session]
  )

  /**
   * Check if page is in window
   */
  const isPageInWindow = useCallback(
    (page: number) => {
      if (!session) return false
      return page >= session.windowRange.start && page <= session.windowRange.end
    },
    [session]
  )

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPolling()
    }
  }, [stopPolling])

  return {
    session,
    isActive: session?.state === 'active',
    isStarting,
    error,
    startSession,
    updateWindow,
    cancelSession,
    isPageProcessing,
    isPageCompleted,
    isPageInWindow,
  }
}
