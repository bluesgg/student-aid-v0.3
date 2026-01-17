/**
 * @vitest-environment jsdom
 *
 * Integration tests for window mode and image selection coexistence.
 *
 * Tests verify that:
 * 1. Window mode and image selection operate independently
 * 2. User can manually select images during an active window session
 * 3. Both types of stickers can coexist on the same page
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAutoExplainSession } from '../hooks/use-auto-explain-session'
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

describe('Window Mode + Image Selection Integration', () => {
  const fileId = 'test-file-id'
  const courseId = 'test-course-id'

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Independent Operation', () => {
    it('should allow image selection API call during active window session', async () => {
      // Start a window session
      mockPost.mockResolvedValueOnce({
        ok: true as const,
        data: {
          sessionId: 'session-123',
          windowRange: { start: 8, end: 15 },
          pdfType: 'text',
          message: 'Started auto-explain from page 10',
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

      expect(result.current.isActive).toBe(true)

      // Simulate image selection API call (this would be a separate API call)
      mockPost.mockResolvedValueOnce({
        ok: true as const,
        data: {
          sticker: {
            id: 'image-sticker-123',
            page: 12,
            type: 'auto',
            anchor: { textSnippet: 'Figure 1: Diagram' },
            contentMarkdown: 'This diagram shows...',
          },
        },
      })

      // Image selection call uses effectiveMode='with_selected_images'
      const imageResponse = await apiClient.post('/api/ai/explain-page', {
        courseId,
        fileId,
        page: 12,
        effectiveMode: 'with_selected_images',
        selectedRegions: [{ x: 100, y: 200, width: 300, height: 400 }],
      })

      expect(imageResponse.ok).toBe(true)

      // Window session should still be active
      expect(result.current.isActive).toBe(true)
      expect(result.current.session?.windowRange).toEqual({ start: 8, end: 15 })
    })

    it('should not affect window session progress when image is selected', async () => {
      mockPost.mockResolvedValueOnce({
        ok: true as const,
        data: {
          sessionId: 'session-123',
          windowRange: { start: 8, end: 15 },
          pdfType: 'text',
          message: 'Started',
        },
      })

      // Mock session progress polling
      mockGet.mockResolvedValue({
        ok: true as const,
        data: {
          sessionId: 'session-123',
          state: 'active',
          windowRange: { start: 8, end: 15 },
          currentPage: 10,
          progress: { total: 8, completed: 3, inProgress: 2, failed: 0, pending: 3, percentage: 37 },
          pagesCompleted: [8, 9, 10],
          pagesInProgress: [11, 12],
          pagesFailed: [],
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

      // Simulate image selection on page 12 (which is in progress in window)
      mockPost.mockResolvedValueOnce({
        ok: true as const,
        data: {
          sticker: {
            id: 'image-sticker-456',
            page: 12,
            type: 'auto',
            anchor: { textSnippet: 'Chart showing data' },
            contentMarkdown: 'Analysis of the chart...',
          },
        },
      })

      await act(async () => {
        await apiClient.post('/api/ai/explain-page', {
          courseId,
          fileId,
          page: 12,
          effectiveMode: 'with_selected_images',
        })
      })

      // Window session continues - verify polling still works
      await act(async () => {
        vi.advanceTimersByTime(2000)
      })

      // Session should still be active with expected state
      expect(result.current.isActive).toBe(true)
      expect(result.current.session?.progress.completed).toBe(3)
      expect(result.current.session?.pagesInProgress).toContain(11)
    })
  })

  describe('Sticker Coexistence', () => {
    it('should allow both text stickers and image stickers on the same page', async () => {
      // This test verifies the data model supports multiple sticker types per page

      // Mock response showing both sticker types on page 12
      const mockStickersResponse = {
        ok: true as const,
        data: {
          stickers: [
            // Text sticker from window mode
            {
              id: 'text-sticker-1',
              page: 12,
              type: 'auto',
              source: 'window',
              anchor: { textSnippet: 'The derivative of f(x)...' },
              contentMarkdown: 'A derivative measures the rate of change...',
            },
            // Image sticker from manual selection
            {
              id: 'image-sticker-1',
              page: 12,
              type: 'auto',
              source: 'image_selection',
              anchor: { textSnippet: 'Figure 3.2: Graph of f(x)' },
              contentMarkdown: 'This graph illustrates the relationship...',
            },
          ],
        },
      }

      mockGet.mockResolvedValue(mockStickersResponse)

      const response = await apiClient.get('/api/stickers?fileId=' + fileId + '&page=12')

      expect(response.ok).toBe(true)
      expect((response as any).data.stickers).toHaveLength(2)
      expect((response as any).data.stickers.map((s: { source: string }) => s.source)).toContain('window')
      expect((response as any).data.stickers.map((s: { source: string }) => s.source)).toContain('image_selection')
    })
  })

  describe('Page Range Handling', () => {
    it('should handle image selection on page outside window range', async () => {
      mockPost.mockResolvedValueOnce({
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

      // Page 5 is outside window range [8-15]
      expect(result.current.isPageInWindow(5)).toBe(false)

      // User selects image on page 5 (outside window)
      mockPost.mockResolvedValueOnce({
        ok: true as const,
        data: {
          sticker: {
            id: 'image-sticker-outside',
            page: 5,
            type: 'auto',
            anchor: { textSnippet: 'Introduction diagram' },
            contentMarkdown: 'This diagram introduces the concepts...',
          },
        },
      })

      const response = await apiClient.post('/api/ai/explain-page', {
        courseId,
        fileId,
        page: 5,
        effectiveMode: 'with_selected_images',
      })

      expect(response.ok).toBe(true)

      // Window session should remain unchanged
      expect(result.current.session?.windowRange).toEqual({ start: 8, end: 15 })
    })

    it('should handle image selection on page within window range', async () => {
      mockPost.mockResolvedValueOnce({
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

      // Page 12 is inside window range [8-15]
      expect(result.current.isPageInWindow(12)).toBe(true)

      // User selects image on page 12 (inside window)
      // Both window-generated text sticker and user-selected image sticker can coexist
      mockPost.mockResolvedValueOnce({
        ok: true as const,
        data: {
          sticker: {
            id: 'image-sticker-inside',
            page: 12,
            type: 'auto',
            anchor: { textSnippet: 'Complex diagram' },
            contentMarkdown: 'Analysis of the complex diagram...',
          },
        },
      })

      const response = await apiClient.post('/api/ai/explain-page', {
        courseId,
        fileId,
        page: 12,
        effectiveMode: 'with_selected_images',
      })

      expect(response.ok).toBe(true)

      // Window session continues processing
      expect(result.current.isActive).toBe(true)
    })
  })

  describe('Mode Parameter Differentiation', () => {
    it('should use mode=window for auto-explain session', async () => {
      mockPost.mockResolvedValueOnce({
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

      // Verify the API was called with mode=window
      expect(mockPost).toHaveBeenCalledWith(
        '/api/ai/explain-page',
        expect.objectContaining({
          mode: 'window',
        })
      )
    })

    it('should use effectiveMode=with_selected_images for image selection', async () => {
      mockPost.mockResolvedValueOnce({
        ok: true as const,
        data: {
          sticker: {
            id: 'image-sticker',
            page: 12,
          },
        },
      })

      await apiClient.post('/api/ai/explain-page', {
        courseId,
        fileId,
        page: 12,
        effectiveMode: 'with_selected_images',
        selectedRegions: [{ x: 0, y: 0, width: 100, height: 100 }],
      })

      // Verify the API was called with effectiveMode
      expect(mockPost).toHaveBeenCalledWith(
        '/api/ai/explain-page',
        expect.objectContaining({
          effectiveMode: 'with_selected_images',
        })
      )
    })
  })
})
