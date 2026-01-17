/**
 * Unit tests for Session API endpoints.
 * Tests GET, PATCH, and DELETE /api/ai/explain-page/session/[sessionId]
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock dependencies
const mockSupabaseUser = { id: 'user-123' }

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() =>
        Promise.resolve({
          data: { user: mockSupabaseUser },
          error: null,
        })
      ),
    },
  })),
}))

vi.mock('@/lib/api-response', () => ({
  successResponse: vi.fn((data) => ({
    ok: true,
    ...data,
    json: () => Promise.resolve({ ok: true, ...data }),
  })),
  errors: {
    unauthorized: vi.fn(() => ({ status: 401, error: 'Unauthorized' })),
    notFound: vi.fn((entity) => ({ status: 404, error: `${entity} not found` })),
    custom: vi.fn((code, message, status) => ({ status, error: { code, message } })),
    internalError: vi.fn(() => ({ status: 500, error: 'Internal error' })),
    invalidInput: vi.fn((msg) => ({ status: 400, error: msg })),
  },
}))

vi.mock('@/lib/auto-explain', () => ({
  getSessionState: vi.fn(),
  updateSessionWindow: vi.fn(),
  cancelSession: vi.fn(),
  isJump: vi.fn((from, to) => Math.abs(to - from) > 10),
}))

import { GET, PATCH, DELETE } from '../session/[sessionId]/route'
import {
  getSessionState,
  updateSessionWindow,
  cancelSession,
  isJump,
} from '@/lib/auto-explain'

describe('Session API', () => {
  const mockGetSessionState = vi.mocked(getSessionState)
  const mockUpdateSessionWindow = vi.mocked(updateSessionWindow)
  const mockCancelSession = vi.mocked(cancelSession)

  const mockSession = {
    sessionId: 'session-123',
    userId: 'user-123',
    fileId: 'file-456',
    windowStart: 8,
    windowEnd: 15,
    currentPage: 10,
    state: 'active' as const,
    pagesCompleted: [8, 9],
    pagesInProgress: [10],
    pagesFailed: [],
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('GET /api/ai/explain-page/session/[sessionId]', () => {
    it('should return session status and progress', async () => {
      mockGetSessionState.mockResolvedValueOnce(mockSession)

      const request = new NextRequest('http://localhost/api/ai/explain-page/session/session-123')
      const result = await GET(request, { params: { sessionId: 'session-123' } })

      expect(mockGetSessionState).toHaveBeenCalledWith('session-123')
      expect(result).toMatchObject({
        ok: true,
        sessionId: 'session-123',
        state: 'active',
      })
    })

    it('should return 404 when session not found', async () => {
      mockGetSessionState.mockResolvedValueOnce(null)

      const request = new NextRequest('http://localhost/api/ai/explain-page/session/invalid')
      const result = await GET(request, { params: { sessionId: 'invalid' } })

      expect(result.status).toBe(404)
    })

    it('should return 404 when user does not own session', async () => {
      mockGetSessionState.mockResolvedValueOnce({
        ...mockSession,
        userId: 'other-user',
      })

      const request = new NextRequest('http://localhost/api/ai/explain-page/session/session-123')
      const result = await GET(request, { params: { sessionId: 'session-123' } })

      expect(result.status).toBe(404)
    })

    it('should calculate progress correctly', async () => {
      mockGetSessionState.mockResolvedValueOnce({
        ...mockSession,
        pagesCompleted: [8, 9, 10, 11],
        pagesInProgress: [12],
        pagesFailed: [13],
      })

      const request = new NextRequest('http://localhost/api/ai/explain-page/session/session-123')
      const result = await GET(request, { params: { sessionId: 'session-123' } })

      // Window is 8-15, so 8 total pages
      // Completed: 4, In Progress: 1, Failed: 1, Pending: 2
      expect(result).toMatchObject({
        ok: true,
        progress: {
          total: 8,
          completed: 4,
          inProgress: 1,
          failed: 1,
          pending: 2,
          percentage: 50, // 4/8 = 50%
        },
      })
    })
  })

  describe('PATCH /api/ai/explain-page/session/[sessionId]', () => {
    it('should update window on normal scroll', async () => {
      mockGetSessionState.mockResolvedValueOnce(mockSession)
      mockUpdateSessionWindow.mockResolvedValueOnce({
        success: true,
        windowStart: 9,
        windowEnd: 16,
        canceledPages: [],
        newPages: [16],
      })

      const request = new NextRequest('http://localhost/api/ai/explain-page/session/session-123', {
        method: 'PATCH',
        body: JSON.stringify({ currentPage: 11, action: 'extend' }),
      })
      const result = await PATCH(request, { params: { sessionId: 'session-123' } })

      expect(mockUpdateSessionWindow).toHaveBeenCalledWith('session-123', 11, 'extend')
      expect(result).toMatchObject({
        ok: true,
        windowRange: { start: 9, end: 16 },
        newPages: [16],
      })
    })

    it('should detect jump navigation automatically', async () => {
      mockGetSessionState.mockResolvedValueOnce(mockSession)
      mockUpdateSessionWindow.mockResolvedValueOnce({
        success: true,
        windowStart: 48,
        windowEnd: 55,
        canceledPages: [8, 9, 10],
        newPages: [48, 49, 50, 51, 52, 53, 54, 55],
      })

      // Extend action, but currentPage is >10 pages away
      const request = new NextRequest('http://localhost/api/ai/explain-page/session/session-123', {
        method: 'PATCH',
        body: JSON.stringify({ currentPage: 50, action: 'extend' }),
      })
      const result = await PATCH(request, { params: { sessionId: 'session-123' } })

      // Should auto-detect as jump
      expect(mockUpdateSessionWindow).toHaveBeenCalledWith('session-123', 50, 'jump')
      expect(result).toMatchObject({
        ok: true,
        action: 'jump',
        canceledPages: [8, 9, 10],
      })
    })

    it('should return error for inactive session', async () => {
      mockGetSessionState.mockResolvedValueOnce({
        ...mockSession,
        state: 'completed',
      })

      const request = new NextRequest('http://localhost/api/ai/explain-page/session/session-123', {
        method: 'PATCH',
        body: JSON.stringify({ currentPage: 11, action: 'extend' }),
      })
      const result = await PATCH(request, { params: { sessionId: 'session-123' } })

      expect(result.status).toBe(400)
      expect((result as any).error?.code).toBe('SESSION_NOT_ACTIVE')
    })

    it('should handle cancel action', async () => {
      mockGetSessionState.mockResolvedValueOnce(mockSession)
      mockUpdateSessionWindow.mockResolvedValueOnce({
        success: true,
        windowStart: mockSession.windowStart,
        windowEnd: mockSession.windowEnd,
        canceledPages: [10, 11, 12, 13, 14, 15],
        newPages: [],
      })

      const request = new NextRequest('http://localhost/api/ai/explain-page/session/session-123', {
        method: 'PATCH',
        body: JSON.stringify({ currentPage: 10, action: 'cancel' }),
      })
      const result = await PATCH(request, { params: { sessionId: 'session-123' } })

      expect(mockUpdateSessionWindow).toHaveBeenCalledWith('session-123', 10, 'cancel')
      expect(result).toMatchObject({
        ok: true,
        action: 'cancel',
      })
    })

    it('should reject invalid input', async () => {
      mockGetSessionState.mockResolvedValueOnce(mockSession)

      const request = new NextRequest('http://localhost/api/ai/explain-page/session/session-123', {
        method: 'PATCH',
        body: JSON.stringify({ currentPage: 'invalid', action: 'extend' }),
      })
      const result = await PATCH(request, { params: { sessionId: 'session-123' } })

      expect(result.status).toBe(400)
    })
  })

  describe('DELETE /api/ai/explain-page/session/[sessionId]', () => {
    it('should cancel session', async () => {
      mockGetSessionState.mockResolvedValueOnce(mockSession)
      mockCancelSession.mockResolvedValueOnce(true)

      const request = new NextRequest('http://localhost/api/ai/explain-page/session/session-123', {
        method: 'DELETE',
      })
      const result = await DELETE(request, { params: { sessionId: 'session-123' } })

      expect(mockCancelSession).toHaveBeenCalledWith('session-123')
      expect(result).toMatchObject({
        ok: true,
        message: 'Session canceled',
      })
    })

    it('should return 404 for non-existent session', async () => {
      mockGetSessionState.mockResolvedValueOnce(null)

      const request = new NextRequest('http://localhost/api/ai/explain-page/session/invalid', {
        method: 'DELETE',
      })
      const result = await DELETE(request, { params: { sessionId: 'invalid' } })

      expect(result.status).toBe(404)
    })

    it('should return 500 when cancel fails', async () => {
      mockGetSessionState.mockResolvedValueOnce(mockSession)
      mockCancelSession.mockResolvedValueOnce(false)

      const request = new NextRequest('http://localhost/api/ai/explain-page/session/session-123', {
        method: 'DELETE',
      })
      const result = await DELETE(request, { params: { sessionId: 'session-123' } })

      expect(result.status).toBe(500)
    })
  })
})
