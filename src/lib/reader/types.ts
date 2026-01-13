/**
 * PDF Reader Mode Types and Utilities
 *
 * Supports two reading modes:
 * - 'page': Single page view with prev/next navigation (default)
 * - 'scroll': Continuous scroll with all pages rendered vertically
 */

// ==================== Types ====================

export type ReaderMode = 'page' | 'scroll'

export interface ReaderModePreference {
  mode: ReaderMode
  lastUpdated: number
}

// ==================== Layout Constants ====================

/** Gap between pages in scroll mode (pixels) */
export const PAGE_GAP_PX = 12

/** Padding when scrolling to page top (pixels) */
export const PAGE_PADDING_PX = 12

/** Debounce delay for current page updates during scroll (ms) */
export const CURRENT_PAGE_DEBOUNCE_MS = 300

/** Debounce delay for last read page API updates (ms) */
export const LAST_READ_PAGE_DEBOUNCE_MS = 300

/** Number of pages to render above/below viewport in virtual scroll */
export const OVERSCAN_COUNT = 2

/** Standard PDF page width in points (8.5 inches at 72 DPI) */
export const STANDARD_PDF_WIDTH_PT = 612

/** Standard PDF page height in points (11 inches at 72 DPI) */
export const STANDARD_PDF_HEIGHT_PT = 792

/** Default aspect ratio for height estimation (Letter size: 11/8.5) */
export const DEFAULT_PAGE_ASPECT_RATIO = STANDARD_PDF_HEIGHT_PT / STANDARD_PDF_WIDTH_PT // 792/612 ≈ 1.294

// ==================== LocalStorage Utilities ====================

const READER_MODE_STORAGE_KEY = 'pdf-reader-mode'

/**
 * Get stored reader mode from localStorage
 * Returns 'page' as fallback if storage unavailable or invalid
 */
export function getStoredReaderMode(): ReaderMode {
  try {
    const stored = localStorage.getItem(READER_MODE_STORAGE_KEY)
    if (stored === 'scroll' || stored === 'page') {
      return stored
    }
    // Try parsing as JSON for backward compatibility
    if (stored) {
      const parsed = JSON.parse(stored) as ReaderModePreference
      if (parsed.mode === 'scroll' || parsed.mode === 'page') {
        return parsed.mode
      }
    }
  } catch {
    // localStorage unavailable or parse error - fallback silently
    console.warn('Unable to read reader mode from localStorage, using default')
  }
  return 'page'
}

/**
 * Store reader mode to localStorage
 * Fails silently if storage unavailable
 */
export function setStoredReaderMode(mode: ReaderMode): void {
  try {
    localStorage.setItem(READER_MODE_STORAGE_KEY, mode)
  } catch {
    // localStorage unavailable - fail silently
    console.warn('Unable to save reader mode to localStorage')
  }
}

// ==================== URL State Utilities ====================

const URL_MODE_PARAM = 'mode'

/**
 * Valid reader modes for URL parameter validation
 */
const VALID_MODES: ReaderMode[] = ['page', 'scroll']

/**
 * Get initial reader mode from URL parameter
 * Returns null if no valid mode parameter found
 */
export function getInitialModeFromURL(): ReaderMode | null {
  if (typeof window === 'undefined') return null

  try {
    const params = new URLSearchParams(window.location.search)
    const modeParam = params.get(URL_MODE_PARAM)

    if (modeParam && VALID_MODES.includes(modeParam as ReaderMode)) {
      return modeParam as ReaderMode
    }
  } catch {
    // URL parsing error - return null
  }
  return null
}

/**
 * Sync reader mode to URL without adding to browser history
 * Uses replaceState to avoid polluting history
 */
export function syncModeToURL(mode: ReaderMode): void {
  if (typeof window === 'undefined') return

  try {
    const url = new URL(window.location.href)
    url.searchParams.set(URL_MODE_PARAM, mode)
    window.history.replaceState({}, '', url.toString())
  } catch {
    // URL manipulation error - fail silently
    console.warn('Unable to sync reader mode to URL')
  }
}

/**
 * Get initial reader mode with priority: URL > localStorage > default
 */
export function getInitialReaderMode(): ReaderMode {
  // Priority 1: URL parameter
  const urlMode = getInitialModeFromURL()
  if (urlMode) {
    return urlMode
  }

  // Priority 2: localStorage
  const storedMode = getStoredReaderMode()
  return storedMode
}

// ==================== IntersectionObserver Fallback ====================

/**
 * Check if IntersectionObserver is supported
 */
export function isIntersectionObserverSupported(): boolean {
  return typeof window !== 'undefined' && 'IntersectionObserver' in window
}

/**
 * Calculate current page from scroll position and page heights
 * Fallback when IntersectionObserver is unavailable
 * Returns the page with highest visible area in viewport
 */
export function calculateCurrentPageFromScroll(
  scrollTop: number,
  viewportHeight: number,
  pageHeights: number[],
  pageGap: number = PAGE_GAP_PX
): number {
  if (pageHeights.length === 0) return 1

  const viewportBottom = scrollTop + viewportHeight
  let cumulativeHeight = 0
  let maxVisibleArea = 0
  let currentPage = 1

  for (let i = 0; i < pageHeights.length; i++) {
    const pageTop = cumulativeHeight
    const pageHeight = pageHeights[i] || 0
    const pageBottom = pageTop + pageHeight

    // Calculate visible portion of this page
    const visibleTop = Math.max(pageTop, scrollTop)
    const visibleBottom = Math.min(pageBottom, viewportBottom)
    const visibleArea = Math.max(0, visibleBottom - visibleTop)

    if (visibleArea > maxVisibleArea) {
      maxVisibleArea = visibleArea
      currentPage = i + 1
    }

    // Move to next page position
    cumulativeHeight = pageBottom + pageGap

    // Early exit if we've passed the viewport
    if (pageTop > viewportBottom) break
  }

  return currentPage
}
