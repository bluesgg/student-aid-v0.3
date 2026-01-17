/**
 * Unit tests for Sticker anchor type changes.
 * Tests the isFullPage field and type validation.
 */
import { describe, it, expect } from 'vitest'
import type { Sticker } from '../api'

describe('Sticker Anchor Types', () => {
  describe('Sticker Interface', () => {
    it('should support basic anchor without rect or isFullPage', () => {
      const sticker: Sticker = {
        id: 'sticker-1',
        type: 'auto',
        page: 1,
        anchor: {
          textSnippet: 'This is a text snippet',
        },
        parentId: null,
        contentMarkdown: 'Explanation content',
        folded: false,
        depth: 0,
        createdAt: '2024-01-01T00:00:00Z',
      }

      expect(sticker.anchor.textSnippet).toBe('This is a text snippet')
      expect(sticker.anchor.rect).toBeUndefined()
      expect(sticker.anchor.isFullPage).toBeUndefined()
    })

    it('should support anchor with rect coordinates', () => {
      const sticker: Sticker = {
        id: 'sticker-2',
        type: 'auto',
        page: 5,
        anchor: {
          textSnippet: 'Paragraph anchor',
          rect: {
            x: 0.1,
            y: 0.2,
            width: 0.8,
            height: 0.15,
          },
        },
        parentId: null,
        contentMarkdown: 'Text-type sticker explanation',
        folded: false,
        depth: 0,
        createdAt: '2024-01-01T00:00:00Z',
      }

      expect(sticker.anchor.rect).toBeDefined()
      expect(sticker.anchor.rect!.x).toBe(0.1)
      expect(sticker.anchor.rect!.y).toBe(0.2)
      expect(sticker.anchor.rect!.width).toBe(0.8)
      expect(sticker.anchor.rect!.height).toBe(0.15)
      expect(sticker.anchor.isFullPage).toBeUndefined()
    })

    it('should support PPT-type anchor with isFullPage flag', () => {
      const pptSticker: Sticker = {
        id: 'sticker-3',
        type: 'auto',
        page: 1,
        anchor: {
          textSnippet: 'Slide title',
          rect: {
            x: 0,
            y: 0,
            width: 1,
            height: 1,
          },
          isFullPage: true,
        },
        parentId: null,
        contentMarkdown: 'Full slide explanation',
        folded: false,
        depth: 0,
        createdAt: '2024-01-01T00:00:00Z',
      }

      expect(pptSticker.anchor.isFullPage).toBe(true)
      expect(pptSticker.anchor.rect).toBeDefined()
      expect(pptSticker.anchor.rect!.x).toBe(0)
      expect(pptSticker.anchor.rect!.y).toBe(0)
      expect(pptSticker.anchor.rect!.width).toBe(1)
      expect(pptSticker.anchor.rect!.height).toBe(1)
    })

    it('should support text-type anchor with isFullPage=false', () => {
      const textSticker: Sticker = {
        id: 'sticker-4',
        type: 'auto',
        page: 3,
        anchor: {
          textSnippet: 'Paragraph text',
          rect: {
            x: 0.05,
            y: 0.3,
            width: 0.9,
            height: 0.12,
          },
          isFullPage: false,
        },
        parentId: null,
        contentMarkdown: 'Text explanation',
        folded: false,
        depth: 0,
        createdAt: '2024-01-01T00:00:00Z',
      }

      expect(textSticker.anchor.isFullPage).toBe(false)
      expect(textSticker.anchor.rect).toBeDefined()
    })

    it('should support anchor with null rect', () => {
      const sticker: Sticker = {
        id: 'sticker-5',
        type: 'manual',
        page: 2,
        anchor: {
          textSnippet: 'User selected text',
          rect: null,
        },
        parentId: null,
        contentMarkdown: 'Manual explanation',
        folded: false,
        depth: 0,
        createdAt: '2024-01-01T00:00:00Z',
      }

      expect(sticker.anchor.rect).toBeNull()
    })
  })

  describe('Full Page Anchor Detection', () => {
    it('should identify full-page stickers by isFullPage flag', () => {
      const stickers: Sticker[] = [
        {
          id: 'ppt-1',
          type: 'auto',
          page: 1,
          anchor: {
            textSnippet: 'Slide 1',
            rect: { x: 0, y: 0, width: 1, height: 1 },
            isFullPage: true,
          },
          parentId: null,
          contentMarkdown: 'Content',
          folded: false,
          depth: 0,
          createdAt: '2024-01-01T00:00:00Z',
        },
        {
          id: 'text-1',
          type: 'auto',
          page: 2,
          anchor: {
            textSnippet: 'Paragraph',
            rect: { x: 0.1, y: 0.2, width: 0.8, height: 0.1 },
            isFullPage: false,
          },
          parentId: null,
          contentMarkdown: 'Content',
          folded: false,
          depth: 0,
          createdAt: '2024-01-01T00:00:00Z',
        },
        {
          id: 'text-2',
          type: 'auto',
          page: 3,
          anchor: {
            textSnippet: 'Another paragraph',
            rect: { x: 0.1, y: 0.5, width: 0.8, height: 0.15 },
            // isFullPage not set - should be treated as not full page
          },
          parentId: null,
          contentMarkdown: 'Content',
          folded: false,
          depth: 0,
          createdAt: '2024-01-01T00:00:00Z',
        },
      ]

      const fullPageStickers = stickers.filter(s => s.anchor.isFullPage === true)
      const paragraphStickers = stickers.filter(s => s.anchor.isFullPage !== true)

      expect(fullPageStickers).toHaveLength(1)
      expect(fullPageStickers[0].id).toBe('ppt-1')
      expect(paragraphStickers).toHaveLength(2)
    })

    it('should skip hover highlighting for full-page stickers', () => {
      const shouldShowHighlight = (sticker: Sticker): boolean => {
        // Full-page stickers don't need hover highlighting as they cover the entire page
        if (sticker.anchor.isFullPage) return false
        // Need a rect to show highlight
        if (!sticker.anchor.rect) return false
        return true
      }

      const pptSticker: Sticker = {
        id: 'ppt-1',
        type: 'auto',
        page: 1,
        anchor: {
          textSnippet: 'Slide',
          rect: { x: 0, y: 0, width: 1, height: 1 },
          isFullPage: true,
        },
        parentId: null,
        contentMarkdown: 'Content',
        folded: false,
        depth: 0,
        createdAt: '2024-01-01T00:00:00Z',
      }

      const textSticker: Sticker = {
        id: 'text-1',
        type: 'auto',
        page: 2,
        anchor: {
          textSnippet: 'Paragraph',
          rect: { x: 0.1, y: 0.2, width: 0.8, height: 0.1 },
          isFullPage: false,
        },
        parentId: null,
        contentMarkdown: 'Content',
        folded: false,
        depth: 0,
        createdAt: '2024-01-01T00:00:00Z',
      }

      const noRectSticker: Sticker = {
        id: 'no-rect',
        type: 'manual',
        page: 3,
        anchor: {
          textSnippet: 'Manual',
        },
        parentId: null,
        contentMarkdown: 'Content',
        folded: false,
        depth: 0,
        createdAt: '2024-01-01T00:00:00Z',
      }

      expect(shouldShowHighlight(pptSticker)).toBe(false)
      expect(shouldShowHighlight(textSticker)).toBe(true)
      expect(shouldShowHighlight(noRectSticker)).toBe(false)
    })
  })

  describe('Rect Coordinate Validation', () => {
    it('should validate normalized coordinates (0-1 range)', () => {
      const isValidNormalizedRect = (rect: { x: number; y: number; width: number; height: number }): boolean => {
        return (
          rect.x >= 0 && rect.x <= 1 &&
          rect.y >= 0 && rect.y <= 1 &&
          rect.width > 0 && rect.width <= 1 &&
          rect.height > 0 && rect.height <= 1 &&
          rect.x + rect.width <= 1 &&
          rect.y + rect.height <= 1
        )
      }

      // Valid full-page rect
      expect(isValidNormalizedRect({ x: 0, y: 0, width: 1, height: 1 })).toBe(true)

      // Valid paragraph rect
      expect(isValidNormalizedRect({ x: 0.1, y: 0.2, width: 0.8, height: 0.15 })).toBe(true)

      // Invalid: out of bounds
      expect(isValidNormalizedRect({ x: 0.5, y: 0.5, width: 0.6, height: 0.6 })).toBe(false)

      // Invalid: negative values
      expect(isValidNormalizedRect({ x: -0.1, y: 0, width: 0.5, height: 0.5 })).toBe(false)

      // Invalid: zero dimensions
      expect(isValidNormalizedRect({ x: 0, y: 0, width: 0, height: 0.5 })).toBe(false)
    })
  })
})
