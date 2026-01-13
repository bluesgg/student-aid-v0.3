/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  isIntersectionObserverSupported,
  calculateCurrentPageFromScroll,
  PAGE_GAP_PX,
} from '../types'

describe('IntersectionObserver Fallback', () => {
  describe('isIntersectionObserverSupported', () => {
    it('should return true when IntersectionObserver is available', () => {
      expect(isIntersectionObserverSupported()).toBe(true)
    })

    it('should return false when IntersectionObserver is not available', () => {
      const original = window.IntersectionObserver
      // @ts-expect-error - Intentionally removing IntersectionObserver for test
      delete window.IntersectionObserver

      expect(isIntersectionObserverSupported()).toBe(false)

      // Restore
      window.IntersectionObserver = original
    })

    it('should return false when window is undefined', () => {
      // This test simulates SSR environment
      const originalWindow = global.window
      // @ts-expect-error - Intentionally removing window for test
      delete global.window

      expect(isIntersectionObserverSupported()).toBe(false)

      // Restore
      global.window = originalWindow
    })
  })

  describe('calculateCurrentPageFromScroll - Edge Cases', () => {
    it('should handle zero viewport height', () => {
      const pageHeights = [600, 600, 600]
      const result = calculateCurrentPageFromScroll(0, 0, pageHeights, PAGE_GAP_PX)
      expect(result).toBe(1)
    })

    it('should handle negative scroll position', () => {
      const pageHeights = [600, 600, 600]
      const result = calculateCurrentPageFromScroll(-100, 800, pageHeights, PAGE_GAP_PX)
      expect(result).toBe(1)
    })

    it('should handle very large scroll position', () => {
      const pageHeights = [600, 600, 600]
      const result = calculateCurrentPageFromScroll(999999, 800, pageHeights, PAGE_GAP_PX)
      // When scroll is beyond all pages, no pages are visible, returns 1 (default)
      expect(result).toBe(1)
    })

    it('should handle single page document', () => {
      const pageHeights = [600]
      expect(calculateCurrentPageFromScroll(0, 800, pageHeights, PAGE_GAP_PX)).toBe(1)
      expect(calculateCurrentPageFromScroll(300, 800, pageHeights, PAGE_GAP_PX)).toBe(1)
      expect(calculateCurrentPageFromScroll(900, 800, pageHeights, PAGE_GAP_PX)).toBe(1)
    })

    it('should handle pages with zero height', () => {
      const pageHeights = [0, 600, 0]
      const result = calculateCurrentPageFromScroll(10, 800, pageHeights, PAGE_GAP_PX)
      // Should skip zero-height pages and find valid one
      expect(result).toBeGreaterThanOrEqual(1)
      expect(result).toBeLessThanOrEqual(3)
    })

    it('should handle all pages with zero height', () => {
      const pageHeights = [0, 0, 0]
      const result = calculateCurrentPageFromScroll(100, 800, pageHeights, PAGE_GAP_PX)
      expect(result).toBe(1) // Should default to page 1
    })

    it('should handle very small pages (smaller than viewport)', () => {
      const pageHeights = [100, 100, 100] // Pages smaller than viewport
      const viewportHeight = 800

      // At scrollTop=0: Page 1 (0-100) has 100px visible, Page 2 (112-212) has 100px, Page 3 (224-324) has 100px
      // First one with max visible area wins
      expect(calculateCurrentPageFromScroll(0, viewportHeight, pageHeights, PAGE_GAP_PX)).toBe(1)

      // At scrollTop=50: Page 1 has 50px visible (50-100), Page 2 has 100px (112-212), Page 3 has 100px
      // Page 2 has more visible area than Page 1 (Page 2 comes first when tied with Page 3)
      expect(calculateCurrentPageFromScroll(50, viewportHeight, pageHeights, PAGE_GAP_PX)).toBe(2)

      // At scrollTop=120, viewport 120-920: Page 1 has 0px, Page 2 has 92px (120-212), Page 3 has 100px (224-324)
      // Page 3 has most visible area
      expect(calculateCurrentPageFromScroll(120, viewportHeight, pageHeights, PAGE_GAP_PX)).toBe(3)
    })

    it('should handle very large pages (much larger than viewport)', () => {
      const pageHeights = [3000, 3000, 3000] // Pages much larger than viewport
      const viewportHeight = 800

      // Top of page 1 - viewport 0-800, page 1 fully visible (800px)
      expect(calculateCurrentPageFromScroll(0, viewportHeight, pageHeights, PAGE_GAP_PX)).toBe(1)

      // Middle of page 1 - viewport 1500-2300, page 1 fully visible (800px)
      expect(calculateCurrentPageFromScroll(1500, viewportHeight, pageHeights, PAGE_GAP_PX)).toBe(1)

      // Near end of page 1 - viewport 2900-3700
      // Page 1: 100px visible (2900-3000), Page 2: 688px visible (3012-3700)
      // Page 2 has more visible area
      expect(calculateCurrentPageFromScroll(2900, viewportHeight, pageHeights, PAGE_GAP_PX)).toBe(2)

      // Start of page 2 (3000 + 12 gap) - viewport 3012-3812, page 2 has 800px visible
      expect(calculateCurrentPageFromScroll(3012, viewportHeight, pageHeights, PAGE_GAP_PX)).toBe(2)
    })

    it('should handle mixed page heights', () => {
      const pageHeights = [300, 1200, 600, 900, 450]
      const viewportHeight = 800
      const gap = PAGE_GAP_PX

      // Page 1: 0-300, Page 2: 312-1512
      // At scrollTop=0, viewport 0-800: Page 1 has 300px, Page 2 has 488px (312-800)
      expect(calculateCurrentPageFromScroll(0, viewportHeight, pageHeights, gap)).toBe(2)

      // At scrollTop=150, viewport 150-950: Page 1 has 150px, Page 2 has 638px (312-950)
      expect(calculateCurrentPageFromScroll(150, viewportHeight, pageHeights, gap)).toBe(2)

      // Page 2: 312-1512 (300 + 12 gap)
      expect(calculateCurrentPageFromScroll(500, viewportHeight, pageHeights, gap)).toBe(2)
      expect(calculateCurrentPageFromScroll(1000, viewportHeight, pageHeights, gap)).toBe(2)

      // Page 3: 1524-2124
      expect(calculateCurrentPageFromScroll(1600, viewportHeight, pageHeights, gap)).toBe(3)

      // Page 4: 2136-3036
      expect(calculateCurrentPageFromScroll(2500, viewportHeight, pageHeights, gap)).toBe(4)

      // Page 5: 3048-3498
      expect(calculateCurrentPageFromScroll(3200, viewportHeight, pageHeights, gap)).toBe(5)
    })

    it('should handle boundary between pages correctly', () => {
      const pageHeights = [600, 600, 600]
      const viewportHeight = 800
      const gap = PAGE_GAP_PX

      // Page 1: 0-600
      // Gap: 600-612
      // Page 2: 612-1212

      // Just before gap - viewport 599-1399
      // Page 1: 1px visible (599-600), Page 2: 600px visible (612-1212)
      expect(calculateCurrentPageFromScroll(599, viewportHeight, pageHeights, gap)).toBe(2)

      // In gap - viewport 605-1405
      // Page 1: 0px, Page 2: 600px visible (612-1212)
      expect(calculateCurrentPageFromScroll(605, viewportHeight, pageHeights, gap)).toBe(2)

      // Just into page 2
      expect(calculateCurrentPageFromScroll(613, viewportHeight, pageHeights, gap)).toBe(2)
    })

    it('should calculate visible area correctly when page straddles viewport', () => {
      const pageHeights = [600, 600, 600]
      const viewportHeight = 800
      const gap = PAGE_GAP_PX

      // Scroll to show half of page 1 and start of page 2
      const scrollTop = 300
      // Page 1 visible area: 300px (bottom half)
      // Page 2 visible area: 500px (top portion from 612 to 1112)
      // Page 2 should win
      expect(calculateCurrentPageFromScroll(scrollTop, viewportHeight, pageHeights, gap)).toBe(2)
    })

    it('should handle viewport exactly matching page height', () => {
      const pageHeights = [800, 800, 800]
      const viewportHeight = 800

      // Viewport exactly covers page 1
      expect(calculateCurrentPageFromScroll(0, viewportHeight, pageHeights, PAGE_GAP_PX)).toBe(1)

      // Viewport exactly covers page 2
      expect(calculateCurrentPageFromScroll(812, viewportHeight, pageHeights, PAGE_GAP_PX)).toBe(2)
    })

    it('should handle zero gap between pages', () => {
      const pageHeights = [600, 600, 600]
      const viewportHeight = 800
      const zeroGap = 0

      // Page 1: 0-600
      // Page 2: 600-1200 (no gap)
      // Page 3: 1200-1800

      expect(calculateCurrentPageFromScroll(0, viewportHeight, pageHeights, zeroGap)).toBe(1)
      expect(calculateCurrentPageFromScroll(600, viewportHeight, pageHeights, zeroGap)).toBe(2)
      expect(calculateCurrentPageFromScroll(1200, viewportHeight, pageHeights, zeroGap)).toBe(3)
    })

    it('should handle large gap between pages', () => {
      const pageHeights = [600, 600, 600]
      const viewportHeight = 800
      const largeGap = 100

      // Page 1: 0-600
      // Gap: 600-700
      // Page 2: 700-1300

      expect(calculateCurrentPageFromScroll(0, viewportHeight, pageHeights, largeGap)).toBe(1)
      expect(calculateCurrentPageFromScroll(650, viewportHeight, pageHeights, largeGap)).toBe(2)
      expect(calculateCurrentPageFromScroll(800, viewportHeight, pageHeights, largeGap)).toBe(2)
    })

    it('should handle very large document (100+ pages)', () => {
      const pageHeights = new Array(150).fill(600)
      const viewportHeight = 800

      // First page - viewport 0-800: page 1 has 600px, page 2 has 188px (612-800)
      expect(calculateCurrentPageFromScroll(0, viewportHeight, pageHeights, PAGE_GAP_PX)).toBe(1)

      // Middle pages (page 75 at position ~75 * 612)
      const page75Position = 75 * (600 + PAGE_GAP_PX)
      expect(calculateCurrentPageFromScroll(page75Position, viewportHeight, pageHeights, PAGE_GAP_PX)).toBe(76)

      // Last page position
      const lastPagePosition = 149 * (600 + PAGE_GAP_PX)
      expect(calculateCurrentPageFromScroll(lastPagePosition, viewportHeight, pageHeights, PAGE_GAP_PX)).toBe(150)

      // Beyond last page - no pages visible, returns default (1)
      expect(calculateCurrentPageFromScroll(999999, viewportHeight, pageHeights, PAGE_GAP_PX)).toBe(1)
    })

    it('should handle fractional scroll positions', () => {
      const pageHeights = [600, 600, 600]
      const viewportHeight = 800

      // At 299.5: Page 1 has 300.5px, Page 2 has 487.5px (612-1099.5)
      expect(calculateCurrentPageFromScroll(299.5, viewportHeight, pageHeights, PAGE_GAP_PX)).toBe(2)
      expect(calculateCurrentPageFromScroll(612.7, viewportHeight, pageHeights, PAGE_GAP_PX)).toBe(2)
    })

    it('should handle fractional page heights', () => {
      const pageHeights = [599.5, 600.3, 599.9]
      const viewportHeight = 800

      expect(calculateCurrentPageFromScroll(0, viewportHeight, pageHeights, PAGE_GAP_PX)).toBe(1)
      expect(calculateCurrentPageFromScroll(612, viewportHeight, pageHeights, PAGE_GAP_PX)).toBe(2)
    })
  })

  describe('Fallback Integration Scenarios', () => {
    it('should work without IntersectionObserver in virtual list', () => {
      // Simulate virtual list scroll behavior
      const pageHeights = [600, 600, 600, 600, 600]
      const viewportHeight = 800

      // User scrolls through document
      const scrollPositions = [0, 400, 800, 1200, 1600, 2000, 2400, 2800]
      // Expected pages based on which page has highest visible area in viewport
      const expectedPages = [1, 2, 2, 3, 4, 4, 5, 5]

      scrollPositions.forEach((scrollTop, index) => {
        const currentPage = calculateCurrentPageFromScroll(
          scrollTop,
          viewportHeight,
          pageHeights,
          PAGE_GAP_PX
        )
        expect(currentPage).toBe(expectedPages[index])
      })
    })

    it('should handle rapid scroll changes', () => {
      const pageHeights = new Array(50).fill(600)
      const viewportHeight = 800

      // Simulate rapid scrolling
      for (let i = 0; i < 100; i++) {
        const randomScroll = Math.random() * 30000
        const page = calculateCurrentPageFromScroll(
          randomScroll,
          viewportHeight,
          pageHeights,
          PAGE_GAP_PX
        )
        expect(page).toBeGreaterThanOrEqual(1)
        expect(page).toBeLessThanOrEqual(50)
      }
    })

    it('should provide consistent results for same position', () => {
      const pageHeights = [600, 600, 600]
      const viewportHeight = 800
      const scrollTop = 700

      // Call multiple times with same position
      const result1 = calculateCurrentPageFromScroll(scrollTop, viewportHeight, pageHeights, PAGE_GAP_PX)
      const result2 = calculateCurrentPageFromScroll(scrollTop, viewportHeight, pageHeights, PAGE_GAP_PX)
      const result3 = calculateCurrentPageFromScroll(scrollTop, viewportHeight, pageHeights, PAGE_GAP_PX)

      expect(result1).toBe(result2)
      expect(result2).toBe(result3)
    })

    it('should handle PPT aspect ratio pages (16:9)', () => {
      // PPT 16:9 pages are typically wider and shorter
      const pptPageHeights = [450, 450, 450] // ~16:9 ratio
      const viewportHeight = 800

      expect(calculateCurrentPageFromScroll(0, viewportHeight, pptPageHeights, PAGE_GAP_PX)).toBe(1)
      expect(calculateCurrentPageFromScroll(500, viewportHeight, pptPageHeights, PAGE_GAP_PX)).toBe(2)
    })

    it('should handle Letter size pages', () => {
      // Letter size: 792/612 ≈ 1.294 aspect ratio
      const letterPageHeights = [777, 777, 777] // Typical Letter page at 600px width
      const viewportHeight = 800

      expect(calculateCurrentPageFromScroll(0, viewportHeight, letterPageHeights, PAGE_GAP_PX)).toBe(1)
      expect(calculateCurrentPageFromScroll(800, viewportHeight, letterPageHeights, PAGE_GAP_PX)).toBe(2)
    })

    it('should handle A4 size pages', () => {
      // A4: sqrt(2) ≈ 1.414 aspect ratio
      const a4PageHeights = [848, 848, 848] // Typical A4 page at 600px width
      const viewportHeight = 800

      expect(calculateCurrentPageFromScroll(0, viewportHeight, a4PageHeights, PAGE_GAP_PX)).toBe(1)
      expect(calculateCurrentPageFromScroll(900, viewportHeight, a4PageHeights, PAGE_GAP_PX)).toBe(2)
    })
  })
})
