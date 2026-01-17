/**
 * @vitest-environment jsdom
 *
 * Unit tests for useAutoExplainSession hook.
 * Tests session management, polling, and window updates.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useAutoExplainSession } from '../use-auto-explain-session'
import * as apiClient from '@/lib/api-client'

// Mock the API client
vi.mock('@/lib/api-client', () => ({
  post: vi.fn(),
  get: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
}))

const mockPost = vi.mocked(apiClient.post)
const mockGet = vi.mocked(apiClient.get)
const mockPatch = vi.mocked(apiClient.patch)
const mockDel = vi.mocked(apiClient.del)

describe('useAutoExplainSession', () => {
  const fileId = 'test-file-id'
  const courseId = 'test-course-id'

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('initial state', () => {
    it('should return null session initially', () => {
      const { result } = renderHook(() => useAutoExplainSession(fileId))

      expect(result.current.session).toBeNull()
      expect(result.current.isActive).toBe(false)
      expect(result.current.isStarting).toBe(false)
      expect(result.current.error).toBeNull()
    })
  })

  describe('startSession', () => {
    it('should start a session and begin polling', async () => {
      const sessionResponse = {
        ok: true as const,
        data: {
          sessionId: 'session-123',
          windowRange: { start: 8, end: 15 },
          pdfType: 'text' as const,
          message: 'Started auto-explain from page 10',
        },
      }
      mockPost.mockResolvedValue(sessionResponse)

      const { result } = renderHook(() => useAutoExplainSession(fileId))

      await act(async () => {
        await result.current.startSession({
          courseId,
          fileId,
          page: 10,
          pdfType: 'Lecture',
        })
      })

      expect(mockPost).toHaveBeenCalledWith('/api/ai/explain-page', {
        courseId,
        fileId,
        page: 10,
        pdfType: 'Lecture',
        mode: 'window',
      })

      expect(result.current.session).not.toBeNull()
      expect(result.current.session?.sessionId).toBe('session-123')
      expect(result.current.session?.windowRange).toEqual({ start: 8, end: 15 })
      expect(result.current.session?.state).toBe('active')
      expect(result.current.isActive).toBe(true)
    })

    it('should set error when session creation fails', async () => {
      mockPost.mockResolvedValue({
        ok: false as const,
        error: { message: 'Session already exists', code: 'SESSION_EXISTS' },
      })

      const { result } = renderHook(() => useAutoExplainSession(fileId))

      await act(async () => {
        await result.current.startSession({
          courseId,
          fileId,
          page: 10,
          pdfType: 'Lecture',
        })
      })

      expect(result.current.session).toBeNull()
      expect(result.current.error).toBe('Session already exists')
      expect(result.current.isActive).toBe(false)
    })

    it('should handle network errors', async () => {
      mockPost.mockRejectedValue(new Error('Network error'))

      const { result } = renderHook(() => useAutoExplainSession(fileId))

      await act(async () => {
        await result.current.startSession({
          courseId,
          fileId,
          page: 10,
          pdfType: 'Lecture',
        })
      })

      expect(result.current.session).toBeNull()
      expect(result.current.error).toBe('Network error')
    })

    it('should set isStarting during request', async () => {
      let resolvePost: ((value: unknown) => void) | undefined
      mockPost.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolvePost = resolve as (value: unknown) => void
          })
      )

      const { result } = renderHook(() => useAutoExplainSession(fileId))

      let startPromise: Promise<unknown>
      act(() => {
        startPromise = result.current.startSession({
          courseId,
          fileId,
          page: 10,
          pdfType: 'Lecture',
        })
      })

      expect(result.current.isStarting).toBe(true)

      await act(async () => {
        resolvePost!({
          ok: true as const,
          data: {
            sessionId: 'session-123',
            windowRange: { start: 8, end: 15 },
            pdfType: 'text',
            message: 'Started',
          },
        })
        await startPromise
      })

      expect(result.current.isStarting).toBe(false)
    })
  })

  describe('updateWindow', () => {
    it('should update window range on page change', async () => {
      // Start a session first
      mockPost.mockResolvedValue({
        ok: true as const,
        data: {
          sessionId: 'session-123',
          windowRange: { start: 8, end: 15 },
          pdfType: 'text',
          message: 'Started',
        },
      })

      mockPatch.mockResolvedValue({
        ok: true as const,
        data: {
          windowRange: { start: 10, end: 17 },
          canceledPages: [8, 9],
          newPages: [16, 17],
          action: 'extend',
        },
      })

      const { result } = renderHook(() => useAutoExplainSession(fileId))

      await act(async () => {
        await result.current.startSession({
          courseId,
          fileId,
          page: 10,
          pdfType: 'Lecture',
        })
      })

      await act(async () => {
        await result.current.updateWindow(12, 'extend')
      })

      expect(mockPatch).toHaveBeenCalledWith('/api/ai/explain-page/session/session-123', {
        currentPage: 12,
        action: 'extend',
      })

      expect(result.current.session?.windowRange).toEqual({ start: 10, end: 17 })
      expect(result.current.session?.currentPage).toBe(12)
    })

    it('should return null when no session exists', async () => {
      const { result } = renderHook(() => useAutoExplainSession(fileId))

      let updateResult: unknown
      await act(async () => {
        updateResult = await result.current.updateWindow(12, 'extend')
      })

      expect(updateResult).toBeNull()
      expect(mockPatch).not.toHaveBeenCalled()
    })
  })

  describe('cancelSession', () => {
    it('should cancel the session and stop polling', async () => {
      mockPost.mockResolvedValue({
        ok: true as const,
        data: {
          sessionId: 'session-123',
          windowRange: { start: 8, end: 15 },
          pdfType: 'text',
          message: 'Started',
        },
      })

      mockDel.mockResolvedValue({ ok: true as const, data: { ok: true } })

      const { result } = renderHook(() => useAutoExplainSession(fileId))

      await act(async () => {
        await result.current.startSession({
          courseId,
          fileId,
          page: 10,
          pdfType: 'Lecture',
        })
      })

      await act(async () => {
        const success = await result.current.cancelSession()
        expect(success).toBe(true)
      })

      expect(mockDel).toHaveBeenCalledWith('/api/ai/explain-page/session/session-123')
      expect(result.current.session?.state).toBe('canceled')
    })

    it('should return false when no session exists', async () => {
      const { result } = renderHook(() => useAutoExplainSession(fileId))

      let cancelResult: boolean
      await act(async () => {
        cancelResult = await result.current.cancelSession()
      })

      expect(cancelResult!).toBe(false)
      expect(mockDel).not.toHaveBeenCalled()
    })
  })

  describe('page status helpers', () => {
    it('should correctly identify pages in window', async () => {
      mockPost.mockResolvedValue({
        ok: true as const,
        data: {
          sessionId: 'session-123',
          windowRange: { start: 8, end: 15 },
          pdfType: 'text',
          message: 'Started',
        },
      })

      const { result } = renderHook(() => useAutoExplainSession(fileId))

      await act(async () => {
        await result.current.startSession({
          courseId,
          fileId,
          page: 10,
          pdfType: 'Lecture',
        })
      })

      expect(result.current.isPageInWindow(8)).toBe(true)
      expect(result.current.isPageInWindow(15)).toBe(true)
      expect(result.current.isPageInWindow(7)).toBe(false)
      expect(result.current.isPageInWindow(16)).toBe(false)
    })

    it('should return false for page checks when no session', () => {
      const { result } = renderHook(() => useAutoExplainSession(fileId))

      expect(result.current.isPageProcessing(10)).toBe(false)
      expect(result.current.isPageCompleted(10)).toBe(false)
      expect(result.current.isPageInWindow(10)).toBe(false)
    })
  })

  

  describe('cleanup', () => {
    it('should stop polling on unmount', async () => {
      mockPost.mockResolvedValue({
        ok: true as const,
        data: {
          sessionId: 'session-123',
          windowRange: { start: 8, end: 15 },
          pdfType: 'text',
          message: 'Started',
        },
      })

      mockGet.mockResolvedValue({
        ok: true as const,
        data: {
          sessionId: 'session-123',
          state: 'active',
          windowRange: { start: 8, end: 15 },
          currentPage: 10,
          progress: { total: 8, completed: 4, inProgress: 1, failed: 0, pending: 3, percentage: 50 },
          pagesCompleted: [8, 9, 10, 11],
          pagesInProgress: [12],
          pagesFailed: [],
        },
      })

      const { result, unmount } = renderHook(() => useAutoExplainSession(fileId))

      await act(async () => {
        await result.current.startSession({
          courseId,
          fileId,
          page: 10,
          pdfType: 'Lecture',
        })
      })

      // Unmount the hook
      unmount()

      // Verify no polling happens after unmount
      const callCount = mockGet.mock.calls.length
      await act(async () => {
        vi.advanceTimersByTime(4000)
      })
      expect(mockGet.mock.calls.length).toBe(callCount)
    })
  })
})
