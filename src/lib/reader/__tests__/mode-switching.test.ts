/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getStoredReaderMode,
  setStoredReaderMode,
  getInitialModeFromURL,
  syncModeToURL,
  getInitialReaderMode,
  type ReaderMode,
} from '../types'

describe('Reader Mode Switching Logic', () => {
  beforeEach(() => {
    localStorage.clear()
    // Reset window.location
    Object.defineProperty(window, 'location', {
      value: {
        href: 'http://localhost:3000/',
        search: '',
      },
      writable: true,
      configurable: true,
    })
    vi.clearAllMocks()
  })

  describe('Mode Initialization', () => {
    it('should default to page mode when no preferences', () => {
      const mode = getInitialReaderMode()
      expect(mode).toBe('page')
    })

    it('should use URL parameter over localStorage', () => {
      localStorage.setItem('pdf-reader-mode', 'page')
      window.location.search = '?mode=scroll'

      const mode = getInitialReaderMode()
      expect(mode).toBe('scroll')
    })

    it('should use localStorage when no URL parameter', () => {
      localStorage.setItem('pdf-reader-mode', 'scroll')
      window.location.search = ''

      const mode = getInitialReaderMode()
      expect(mode).toBe('scroll')
    })

    it('should ignore invalid URL parameter and fallback to localStorage', () => {
      localStorage.setItem('pdf-reader-mode', 'scroll')
      window.location.search = '?mode=invalid'

      const mode = getInitialReaderMode()
      expect(mode).toBe('scroll')
    })

    it('should ignore invalid URL parameter and fallback to default', () => {
      window.location.search = '?mode=invalid'

      const mode = getInitialReaderMode()
      expect(mode).toBe('page')
    })
  })

  describe('Mode Persistence', () => {
    it('should persist mode change to localStorage', () => {
      setStoredReaderMode('scroll')
      expect(localStorage.getItem('pdf-reader-mode')).toBe('scroll')
    })

    it('should persist mode change to URL', () => {
      const replaceStateSpy = vi.spyOn(window.history, 'replaceState')

      syncModeToURL('scroll')

      expect(replaceStateSpy).toHaveBeenCalledWith(
        {},
        '',
        expect.stringContaining('mode=scroll')
      )
    })

    it('should update both localStorage and URL on mode change', () => {
      const replaceStateSpy = vi.spyOn(window.history, 'replaceState')

      // Simulate mode change
      const newMode: ReaderMode = 'scroll'
      setStoredReaderMode(newMode)
      syncModeToURL(newMode)

      expect(localStorage.getItem('pdf-reader-mode')).toBe('scroll')
      expect(replaceStateSpy).toHaveBeenCalledWith(
        {},
        '',
        expect.stringContaining('mode=scroll')
      )
    })
  })

  describe('Mode Switch Scenarios', () => {
    it('should switch from page to scroll mode', () => {
      setStoredReaderMode('page')
      const currentMode = getStoredReaderMode()
      expect(currentMode).toBe('page')

      setStoredReaderMode('scroll')
      const newMode = getStoredReaderMode()
      expect(newMode).toBe('scroll')
    })

    it('should switch from scroll to page mode', () => {
      setStoredReaderMode('scroll')
      const currentMode = getStoredReaderMode()
      expect(currentMode).toBe('scroll')

      setStoredReaderMode('page')
      const newMode = getStoredReaderMode()
      expect(newMode).toBe('page')
    })

    it('should maintain mode preference across page reloads (simulated)', () => {
      setStoredReaderMode('scroll')
      syncModeToURL('scroll')

      // Simulate new page load
      const mode = getInitialReaderMode()
      expect(mode).toBe('scroll')
    })
  })

  describe('URL Parameter Handling', () => {
    it('should extract mode from URL with other parameters', () => {
      window.location.search = '?foo=bar&mode=scroll&baz=qux'
      expect(getInitialModeFromURL()).toBe('scroll')
    })

    it('should handle mode parameter at different positions', () => {
      window.location.search = '?mode=scroll&foo=bar'
      expect(getInitialModeFromURL()).toBe('scroll')

      window.location.search = '?foo=bar&mode=page'
      expect(getInitialModeFromURL()).toBe('page')
    })

    it('should update mode parameter without affecting other parameters', () => {
      const replaceStateSpy = vi.spyOn(window.history, 'replaceState')
      Object.defineProperty(window, 'location', {
        value: {
          href: 'http://localhost:3000/?foo=bar&mode=page',
          search: '?foo=bar&mode=page',
        },
        writable: true,
        configurable: true,
      })

      syncModeToURL('scroll')

      const call = replaceStateSpy.mock.calls[0]
      const url = call[2] as string
      expect(url).toContain('mode=scroll')
      expect(url).toContain('foo=bar')
    })
  })

  describe('Error Handling', () => {
    it('should handle localStorage errors gracefully', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
        throw new Error('localStorage disabled')
      })

      expect(() => setStoredReaderMode('scroll')).not.toThrow()
    })

    it('should handle URL manipulation errors gracefully', () => {
      vi.spyOn(window.history, 'replaceState').mockImplementationOnce(() => {
        throw new Error('replaceState failed')
      })

      expect(() => syncModeToURL('scroll')).not.toThrow()
    })

    it('should fallback to default when both localStorage and URL fail', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementationOnce(() => {
        throw new Error('localStorage disabled')
      })
      window.location.search = '?mode=invalid'

      const mode = getInitialReaderMode()
      expect(mode).toBe('page')
    })
  })

  describe('State Consistency', () => {
    it('should maintain consistent mode across getters', () => {
      setStoredReaderMode('scroll')

      const fromStorage = getStoredReaderMode()
      const fromInit = getInitialReaderMode()

      expect(fromStorage).toBe('scroll')
      expect(fromInit).toBe('scroll')
    })

    it('should reflect immediate updates after mode change', () => {
      setStoredReaderMode('page')
      expect(getStoredReaderMode()).toBe('page')

      setStoredReaderMode('scroll')
      expect(getStoredReaderMode()).toBe('scroll')

      setStoredReaderMode('page')
      expect(getStoredReaderMode()).toBe('page')
    })
  })
})
