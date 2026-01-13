/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  type ReaderMode,
  getStoredReaderMode,
  setStoredReaderMode,
  getInitialModeFromURL,
  syncModeToURL,
  getInitialReaderMode,
  calculateCurrentPageFromScroll,
  PAGE_GAP_PX,
  DEFAULT_PAGE_ASPECT_RATIO,
  STANDARD_PDF_WIDTH_PT,
  STANDARD_PDF_HEIGHT_PT,
} from '../types'

describe('Reader Mode Types and Utilities', () => {
  describe('Constants', () => {
    it('should have correct default page aspect ratio', () => {
      expect(DEFAULT_PAGE_ASPECT_RATIO).toBe(STANDARD_PDF_HEIGHT_PT / STANDARD_PDF_WIDTH_PT)
      expect(DEFAULT_PAGE_ASPECT_RATIO).toBeCloseTo(1.294, 3)
    })

    it('should have page gap constant', () => {
      expect(PAGE_GAP_PX).toBeGreaterThanOrEqual(0)
    })
  })

  describe('localStorage utilities', () => {
    beforeEach(() => {
      localStorage.clear()
      vi.clearAllMocks()
    })

    afterEach(() => {
      localStorage.clear()
    })

    describe('getStoredReaderMode', () => {
      it('should return "page" as default when no stored value', () => {
        expect(getStoredReaderMode()).toBe('page')
      })

      it('should return stored "scroll" mode', () => {
        localStorage.setItem('pdf-reader-mode', 'scroll')
        expect(getStoredReaderMode()).toBe('scroll')
      })

      it('should return stored "page" mode', () => {
        localStorage.setItem('pdf-reader-mode', 'page')
        expect(getStoredReaderMode()).toBe('page')
      })

      it('should handle invalid stored value and return default', () => {
        localStorage.setItem('pdf-reader-mode', 'invalid')
        expect(getStoredReaderMode()).toBe('page')
      })

      it('should handle JSON format (backward compatibility)', () => {
        localStorage.setItem('pdf-reader-mode', JSON.stringify({ mode: 'scroll', lastUpdated: Date.now() }))
        expect(getStoredReaderMode()).toBe('scroll')
      })

      it('should handle localStorage errors gracefully', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementationOnce(() => {
          throw new Error('localStorage disabled')
        })
        expect(getStoredReaderMode()).toBe('page')
      })
    })

    describe('setStoredReaderMode', () => {
      it('should store "scroll" mode', () => {
        setStoredReaderMode('scroll')
        expect(localStorage.getItem('pdf-reader-mode')).toBe('scroll')
      })

      it('should store "page" mode', () => {
        setStoredReaderMode('page')
        expect(localStorage.getItem('pdf-reader-mode')).toBe('page')
      })

      it('should handle localStorage errors gracefully', () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
          throw new Error('localStorage disabled')
        })
        expect(() => setStoredReaderMode('scroll')).not.toThrow()
      })
    })
  })

  describe('URL state utilities', () => {
    beforeEach(() => {
      // Set up a proper location href for happy-dom
      Object.defineProperty(window, 'location', {
        value: {
          href: 'http://localhost:3000/',
          search: '',
        },
        writable: true,
        configurable: true,
      })
    })

    describe('getInitialModeFromURL', () => {
      it('should return null when no mode parameter', () => {
        window.location.search = ''
        expect(getInitialModeFromURL()).toBeNull()
      })

      it('should return "scroll" from valid URL parameter', () => {
        window.location.search = '?mode=scroll'
        expect(getInitialModeFromURL()).toBe('scroll')
      })

      it('should return "page" from valid URL parameter', () => {
        window.location.search = '?mode=page'
        expect(getInitialModeFromURL()).toBe('page')
      })

      it('should return null for invalid mode parameter', () => {
        window.location.search = '?mode=invalid'
        expect(getInitialModeFromURL()).toBeNull()
      })

      it('should work with multiple query parameters', () => {
        window.location.search = '?foo=bar&mode=scroll&baz=qux'
        expect(getInitialModeFromURL()).toBe('scroll')
      })
    })

    describe('syncModeToURL', () => {
      it('should add mode parameter to URL', () => {
        const replaceStateSpy = vi.spyOn(window.history, 'replaceState')
        window.location.search = ''

        syncModeToURL('scroll')

        expect(replaceStateSpy).toHaveBeenCalledWith(
          {},
          '',
          expect.stringContaining('mode=scroll')
        )
      })

      it('should update existing mode parameter', () => {
        const replaceStateSpy = vi.spyOn(window.history, 'replaceState')
        window.location.search = '?mode=page'

        syncModeToURL('scroll')

        expect(replaceStateSpy).toHaveBeenCalledWith(
          {},
          '',
          expect.stringContaining('mode=scroll')
        )
      })

      it('should handle errors gracefully', () => {
        vi.spyOn(window.history, 'replaceState').mockImplementationOnce(() => {
          throw new Error('replaceState failed')
        })
        expect(() => syncModeToURL('scroll')).not.toThrow()
      })
    })

    describe('getInitialReaderMode', () => {
      it('should prioritize URL parameter over localStorage', () => {
        localStorage.setItem('pdf-reader-mode', 'page')
        window.location.search = '?mode=scroll'
        expect(getInitialReaderMode()).toBe('scroll')
      })

      it('should use localStorage when no URL parameter', () => {
        localStorage.setItem('pdf-reader-mode', 'scroll')
        window.location.search = ''
        expect(getInitialReaderMode()).toBe('scroll')
      })

      it('should default to "page" when neither URL nor localStorage', () => {
        window.location.search = ''
        localStorage.clear()
        expect(getInitialReaderMode()).toBe('page')
      })
    })
  })

  describe('calculateCurrentPageFromScroll', () => {
    it('should return page 1 when no pages', () => {
      expect(calculateCurrentPageFromScroll(0, 800, [], 12)).toBe(1)
    })

    it('should return page 1 when at top', () => {
      const pageHeights = [600, 600, 600]
      expect(calculateCurrentPageFromScroll(0, 800, pageHeights, 12)).toBe(1)
    })

    it('should return correct page when scrolled', () => {
      const pageHeights = [600, 600, 600] // Each page 600px + 12px gap
      const scrollTop = 650 // Past first page + gap
      expect(calculateCurrentPageFromScroll(scrollTop, 800, pageHeights, 12)).toBe(2)
    })

    it('should return page with highest visible area', () => {
      const pageHeights = [600, 600, 600]
      const scrollTop = 300 // Middle of page 1
      const viewportHeight = 800
      // Page 1: 300px visible (bottom half)
      // Page 2: 500px visible (top portion)
      // Page 2 should win
      expect(calculateCurrentPageFromScroll(scrollTop, viewportHeight, pageHeights, 12)).toBe(2)
    })

    it('should return last page when scrolled to bottom', () => {
      const pageHeights = [600, 600, 600]
      const scrollTop = 1800 // Past all pages
      expect(calculateCurrentPageFromScroll(scrollTop, 800, pageHeights, 12)).toBe(3)
    })

    it('should handle pages with gaps correctly', () => {
      const pageHeights = [600, 600, 600]
      const gap = 12
      // Page 1: 0-600, gap: 600-612
      // Page 2: 612-1212, gap: 1212-1224
      // Page 3: 1224-1824
      const scrollTop = 620 // Just into page 2
      expect(calculateCurrentPageFromScroll(scrollTop, 800, pageHeights, gap)).toBe(2)
    })

    it('should handle varying page heights', () => {
      const pageHeights = [400, 800, 600] // Different heights
      const gap = 12
      // Page 1: 0-400
      // Page 2: 412-1212
      // Page 3: 1224-1824
      const scrollTop = 500 // In page 2
      expect(calculateCurrentPageFromScroll(scrollTop, 800, pageHeights, gap)).toBe(2)
    })
  })
})
