/**
 * @vitest-environment jsdom
 *
 * Unit tests for HoverHighlightContext.
 * Tests bidirectional hover highlighting state management.
 */
import React, { ReactNode } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  HoverHighlightProvider,
  useHoverHighlight,
  useStickerHighlighted,
} from '../hover-highlight-context'

// Wrapper component for testing hooks
const wrapper = ({ children }: { children: ReactNode }) => (
  <HoverHighlightProvider>{children}</HoverHighlightProvider>
)

describe('HoverHighlightContext', () => {
  describe('useHoverHighlight', () => {
    it('should throw error when used outside provider', () => {
      // Suppress console.error for this test
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      expect(() => {
        renderHook(() => useHoverHighlight())
      }).toThrow('useHoverHighlight must be used within a HoverHighlightProvider')

      consoleSpy.mockRestore()
    })

    it('should provide initial null values', () => {
      const { result } = renderHook(() => useHoverHighlight(), { wrapper })

      expect(result.current.hoveredStickerId).toBeNull()
      expect(result.current.hoveredPdfRegion).toBeNull()
      expect(result.current.hoveredStickerRect).toBeNull()
      expect(result.current.hoveredStickerPage).toBeNull()
      expect(result.current.matchingStickers).toEqual([])
    })

    it('should update hoveredStickerId', () => {
      const { result } = renderHook(() => useHoverHighlight(), { wrapper })

      act(() => {
        result.current.setHoveredStickerId('sticker-123')
      })

      expect(result.current.hoveredStickerId).toBe('sticker-123')

      act(() => {
        result.current.setHoveredStickerId(null)
      })

      expect(result.current.hoveredStickerId).toBeNull()
    })

    it('should update hoveredPdfRegion', () => {
      const { result } = renderHook(() => useHoverHighlight(), { wrapper })

      const region = {
        page: 5,
        rect: { x: 0.1, y: 0.2, width: 0.8, height: 0.15 },
      }

      act(() => {
        result.current.setHoveredPdfRegion(region)
      })

      expect(result.current.hoveredPdfRegion).toEqual(region)
      expect(result.current.hoveredPdfRegion?.page).toBe(5)

      act(() => {
        result.current.setHoveredPdfRegion(null)
      })

      expect(result.current.hoveredPdfRegion).toBeNull()
    })

    it('should update hoveredStickerAnchor (rect and page together)', () => {
      const { result } = renderHook(() => useHoverHighlight(), { wrapper })

      const rect = { x: 0.1, y: 0.2, width: 0.8, height: 0.15 }

      act(() => {
        result.current.setHoveredStickerAnchor(3, rect)
      })

      expect(result.current.hoveredStickerPage).toBe(3)
      expect(result.current.hoveredStickerRect).toEqual(rect)

      act(() => {
        result.current.setHoveredStickerAnchor(null, null)
      })

      expect(result.current.hoveredStickerPage).toBeNull()
      expect(result.current.hoveredStickerRect).toBeNull()
    })

    it('should update matchingStickers', () => {
      const { result } = renderHook(() => useHoverHighlight(), { wrapper })

      act(() => {
        result.current.setMatchingStickers(['sticker-1', 'sticker-2'])
      })

      expect(result.current.matchingStickers).toEqual(['sticker-1', 'sticker-2'])

      act(() => {
        result.current.setMatchingStickers([])
      })

      expect(result.current.matchingStickers).toEqual([])
    })
  })

  describe('useStickerHighlighted', () => {
    it('should return false when used outside provider', () => {
      const { result } = renderHook(() => useStickerHighlighted('sticker-1'))

      expect(result.current).toBe(false)
    })

    it('should return true when sticker is in matchingStickers', () => {
      // Test both hooks in the same render to share context
      const { result } = renderHook(
        () => {
          const context = useHoverHighlight()
          const highlighted1 = useStickerHighlighted('sticker-1')
          const highlighted2 = useStickerHighlighted('sticker-2')
          const highlighted99 = useStickerHighlighted('sticker-99')
          return { context, highlighted1, highlighted2, highlighted99 }
        },
        { wrapper }
      )

      // Initially no stickers are highlighted
      expect(result.current.highlighted1).toBe(false)
      expect(result.current.highlighted2).toBe(false)

      // Set matching stickers
      act(() => {
        result.current.context.setMatchingStickers(['sticker-1', 'sticker-2', 'sticker-3'])
      })

      // Now sticker-1 and sticker-2 should be highlighted
      expect(result.current.highlighted1).toBe(true)
      expect(result.current.highlighted2).toBe(true)
      expect(result.current.highlighted99).toBe(false)
    })

    it('should return false when sticker is not in matchingStickers', () => {
      // Test in the same render to share context
      const { result } = renderHook(
        () => {
          const context = useHoverHighlight()
          const highlighted99 = useStickerHighlighted('sticker-99')
          return { context, highlighted99 }
        },
        { wrapper }
      )

      act(() => {
        result.current.context.setMatchingStickers(['sticker-1', 'sticker-2'])
      })

      // sticker-99 is not in matchingStickers
      expect(result.current.highlighted99).toBe(false)
    })

    it('should return false when matchingStickers is empty', () => {
      const { result } = renderHook(
        () => useStickerHighlighted('sticker-1'),
        { wrapper }
      )

      expect(result.current).toBe(false)
    })
  })

  describe('Bidirectional Hover Flow', () => {
    it('should support sticker → PDF highlighting flow', () => {
      const { result } = renderHook(() => useHoverHighlight(), { wrapper })

      // Simulate: User hovers sticker card
      act(() => {
        result.current.setHoveredStickerId('sticker-123')
        result.current.setHoveredStickerAnchor(
          5,
          { x: 0.1, y: 0.2, width: 0.8, height: 0.15 }
        )
      })

      // Verify: Context has sticker anchor info for PDF viewer
      expect(result.current.hoveredStickerId).toBe('sticker-123')
      expect(result.current.hoveredStickerPage).toBe(5)
      expect(result.current.hoveredStickerRect).toEqual({
        x: 0.1, y: 0.2, width: 0.8, height: 0.15
      })

      // Simulate: User stops hovering
      act(() => {
        result.current.setHoveredStickerId(null)
        result.current.setHoveredStickerAnchor(null, null)
      })

      expect(result.current.hoveredStickerId).toBeNull()
      expect(result.current.hoveredStickerPage).toBeNull()
      expect(result.current.hoveredStickerRect).toBeNull()
    })

    it('should support PDF region → sticker highlighting flow', () => {
      const { result } = renderHook(() => useHoverHighlight(), { wrapper })

      // Simulate: User hovers PDF region
      act(() => {
        result.current.setHoveredPdfRegion({
          page: 3,
          rect: { x: 0.1, y: 0.3, width: 0.8, height: 0.2 },
        })
        result.current.setMatchingStickers(['sticker-1', 'sticker-2'])
      })

      // Verify: Context has matching stickers for sticker panel
      expect(result.current.hoveredPdfRegion?.page).toBe(3)
      expect(result.current.matchingStickers).toContain('sticker-1')
      expect(result.current.matchingStickers).toContain('sticker-2')

      // Simulate: User stops hovering
      act(() => {
        result.current.setHoveredPdfRegion(null)
        result.current.setMatchingStickers([])
      })

      expect(result.current.hoveredPdfRegion).toBeNull()
      expect(result.current.matchingStickers).toEqual([])
    })

    it('should handle full-page sticker anchor (PPT type)', () => {
      const { result } = renderHook(() => useHoverHighlight(), { wrapper })

      // Simulate: User hovers PPT-type full-page sticker
      const fullPageRect = { x: 0, y: 0, width: 1, height: 1 }

      act(() => {
        result.current.setHoveredStickerId('ppt-sticker-1')
        result.current.setHoveredStickerAnchor(1, fullPageRect)
      })

      // Verify: Full-page rect is set
      expect(result.current.hoveredStickerRect).toEqual(fullPageRect)
      expect(result.current.hoveredStickerRect?.width).toBe(1)
      expect(result.current.hoveredStickerRect?.height).toBe(1)

      // In actual implementation, the PDF viewer would skip highlighting
      // for full-page stickers based on isFullPage flag (not in context)
    })
  })

  describe('State Independence', () => {
    it('should maintain separate sticker hover and PDF region hover states', () => {
      const { result } = renderHook(() => useHoverHighlight(), { wrapper })

      // Set both states independently
      act(() => {
        result.current.setHoveredStickerId('sticker-1')
        result.current.setHoveredStickerAnchor(1, { x: 0.1, y: 0.1, width: 0.5, height: 0.1 })
        result.current.setHoveredPdfRegion({
          page: 2,
          rect: { x: 0.2, y: 0.2, width: 0.6, height: 0.2 },
        })
        result.current.setMatchingStickers(['sticker-2', 'sticker-3'])
      })

      // Verify: Both states are independent
      expect(result.current.hoveredStickerId).toBe('sticker-1')
      expect(result.current.hoveredStickerPage).toBe(1)
      expect(result.current.hoveredPdfRegion?.page).toBe(2)
      expect(result.current.matchingStickers).toEqual(['sticker-2', 'sticker-3'])

      // Clear one state
      act(() => {
        result.current.setHoveredStickerId(null)
        result.current.setHoveredStickerAnchor(null, null)
      })

      // Verify: Other state is unchanged
      expect(result.current.hoveredStickerId).toBeNull()
      expect(result.current.hoveredPdfRegion?.page).toBe(2)
      expect(result.current.matchingStickers).toEqual(['sticker-2', 'sticker-3'])
    })
  })
})
