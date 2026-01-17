/**
 * @vitest-environment jsdom
 *
 * Unit tests for useWindowTracker hook.
 * Tests page tracking, debouncing, and jump detection.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWindowTracker } from '../use-window-tracker'

describe('useWindowTracker', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('initial state', () => {
    it('should track initial page', () => {
      const onPageChange = vi.fn()
      const { result } = renderHook(() =>
        useWindowTracker({
          currentPage: 10,
          onPageChange,
          enabled: true,
        })
      )

      expect(result.current.lastTrackedPage).toBe(10)
    })
  })

  describe('page tracking', () => {
    it('should debounce page changes', async () => {
      const onPageChange = vi.fn()
      const { result } = renderHook(() =>
        useWindowTracker({
          currentPage: 10,
          onPageChange,
          enabled: true,
        })
      )

      // Track multiple pages quickly
      act(() => {
        result.current.trackPage(11)
      })
      act(() => {
        result.current.trackPage(12)
      })
      act(() => {
        result.current.trackPage(13)
      })

      // Callback should not be called yet
      expect(onPageChange).not.toHaveBeenCalled()

      // Advance timer past debounce (300ms)
      await act(async () => {
        vi.advanceTimersByTime(300)
      })

      // Only the last page should be reported
      expect(onPageChange).toHaveBeenCalledTimes(1)
      expect(onPageChange).toHaveBeenCalledWith(13, false)
    })

    it('should detect normal navigation (not a jump)', async () => {
      const onPageChange = vi.fn()
      const { result } = renderHook(() =>
        useWindowTracker({
          currentPage: 10,
          onPageChange,
          enabled: true,
        })
      )

      act(() => {
        result.current.trackPage(11)
      })

      await act(async () => {
        vi.advanceTimersByTime(300)
      })

      expect(onPageChange).toHaveBeenCalledWith(11, false)
    })

    it('should detect jump (>10 pages)', async () => {
      const onPageChange = vi.fn()
      const { result } = renderHook(() =>
        useWindowTracker({
          currentPage: 10,
          onPageChange,
          enabled: true,
        })
      )

      act(() => {
        result.current.trackPage(25)
      })

      await act(async () => {
        vi.advanceTimersByTime(300)
      })

      expect(onPageChange).toHaveBeenCalledWith(25, true) // isJump = true
    })

    it('should detect backward jump', async () => {
      const onPageChange = vi.fn()
      const { result } = renderHook(() =>
        useWindowTracker({
          currentPage: 30,
          onPageChange,
          enabled: true,
        })
      )

      act(() => {
        result.current.trackPage(15)
      })

      await act(async () => {
        vi.advanceTimersByTime(300)
      })

      expect(onPageChange).toHaveBeenCalledWith(15, true) // isJump = true (15 pages backward)
    })

    it('should not detect jump at exactly 10 pages', async () => {
      const onPageChange = vi.fn()
      const { result } = renderHook(() =>
        useWindowTracker({
          currentPage: 10,
          onPageChange,
          enabled: true,
        })
      )

      act(() => {
        result.current.trackPage(20)
      })

      await act(async () => {
        vi.advanceTimersByTime(300)
      })

      expect(onPageChange).toHaveBeenCalledWith(20, false) // exactly 10 is not a jump
    })
  })

  describe('enabled prop', () => {
    it('should not track when disabled', async () => {
      const onPageChange = vi.fn()
      const { result } = renderHook(() =>
        useWindowTracker({
          currentPage: 10,
          onPageChange,
          enabled: false,
        })
      )

      act(() => {
        result.current.trackPage(15)
      })

      await act(async () => {
        vi.advanceTimersByTime(300)
      })

      expect(onPageChange).not.toHaveBeenCalled()
    })

    it('should resume tracking when enabled', async () => {
      const onPageChange = vi.fn()
      const { result, rerender } = renderHook(
        ({ enabled }) =>
          useWindowTracker({
            currentPage: 10,
            onPageChange,
            enabled,
          }),
        { initialProps: { enabled: false } }
      )

      act(() => {
        result.current.trackPage(15)
      })

      await act(async () => {
        vi.advanceTimersByTime(300)
      })

      expect(onPageChange).not.toHaveBeenCalled()

      // Re-enable tracking
      rerender({ enabled: true })

      act(() => {
        result.current.trackPage(16)
      })

      await act(async () => {
        vi.advanceTimersByTime(300)
      })

      expect(onPageChange).toHaveBeenCalledWith(16, false)
    })
  })

  describe('currentPage prop changes', () => {
    it('should track when currentPage prop changes', async () => {
      const onPageChange = vi.fn()
      const { rerender } = renderHook(
        ({ currentPage }) =>
          useWindowTracker({
            currentPage,
            onPageChange,
            enabled: true,
          }),
        { initialProps: { currentPage: 10 } }
      )

      // Change the currentPage prop
      rerender({ currentPage: 15 })

      await act(async () => {
        vi.advanceTimersByTime(300)
      })

      expect(onPageChange).toHaveBeenCalledWith(15, false)
    })

    it('should not trigger callback when page is the same', async () => {
      const onPageChange = vi.fn()
      const { rerender } = renderHook(
        ({ currentPage }) =>
          useWindowTracker({
            currentPage,
            onPageChange,
            enabled: true,
          }),
        { initialProps: { currentPage: 10 } }
      )

      // Re-render with same page
      rerender({ currentPage: 10 })

      await act(async () => {
        vi.advanceTimersByTime(300)
      })

      expect(onPageChange).not.toHaveBeenCalled()
    })
  })

  describe('cleanup', () => {
    it('should clear timeout on unmount', async () => {
      const onPageChange = vi.fn()
      const { result, unmount } = renderHook(() =>
        useWindowTracker({
          currentPage: 10,
          onPageChange,
          enabled: true,
        })
      )

      // Start tracking a page
      act(() => {
        result.current.trackPage(15)
      })

      // Unmount before debounce completes
      unmount()

      // Advance timer
      await act(async () => {
        vi.advanceTimersByTime(300)
      })

      // Callback should not be called
      expect(onPageChange).not.toHaveBeenCalled()
    })
  })

  
})
