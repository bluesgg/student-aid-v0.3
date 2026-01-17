/**
 * Progressive PDF Loader
 *
 * Enables progressive loading of PDF documents with:
 * - Streaming mode for faster first page visibility
 * - Progress tracking with byte-level and page-level information
 * - Priority loading for viewport pages in scroll mode
 */

import { pdfjs } from 'react-pdf'
import type { PDFDocumentLoadingTask } from 'pdfjs-dist'

/**
 * Loading progress state for PDF document
 */
export interface ProgressiveLoadingProgress {
  /** Bytes loaded so far */
  loaded: number
  /** Total bytes (0 if unknown) */
  total: number
  /** Percentage complete (0-100), or -1 if total unknown */
  percent: number
  /** Whether the first page is ready for rendering */
  firstPageReady: boolean
  /** Number of pages available (after metadata loads) */
  totalPages: number
  /** Whether the document is fully loaded */
  fullyLoaded: boolean
}

/**
 * Options for creating a progressive PDF source
 */
export interface ProgressivePdfSourceOptions {
  /** URL to load the PDF from */
  url: string
  /** Callback for progress updates */
  onProgress?: (progress: ProgressiveLoadingProgress) => void
  /** Callback when first page is ready */
  onFirstPageReady?: (numPages: number) => void
  /** Callback when document is fully loaded */
  onDocumentLoaded?: (numPages: number) => void
  /** Callback on error */
  onError?: (error: Error) => void
  /** Cached PDF data (ArrayBuffer) - if provided, loads from cache instead of URL */
  cachedData?: ArrayBuffer
}

/**
 * Result of creating a progressive PDF source
 */
export interface ProgressivePdfSource {
  /** PDF loading task from pdfjs-dist */
  loadingTask: PDFDocumentLoadingTask
  /** Cleanup function to abort loading */
  cleanup: () => void
}

/**
 * Create a progressive PDF loading source.
 *
 * This configures pdfjs-dist for optimal progressive loading:
 * - Range requests enabled for streaming
 * - Progress tracking
 * - Early first page availability
 *
 * @example
 * ```typescript
 * const { loadingTask, cleanup } = createProgressivePdfSource({
 *   url: signedUrl,
 *   onProgress: (progress) => {
 *     console.log(`Loading: ${progress.percent}%`)
 *   },
 *   onFirstPageReady: (numPages) => {
 *     console.log(`First page ready! Total: ${numPages} pages`)
 *   },
 * })
 *
 * // Use with react-pdf Document component
 * // Or directly: const pdf = await loadingTask.promise
 *
 * // Cleanup on unmount
 * cleanup()
 * ```
 */
export function createProgressivePdfSource(
  options: ProgressivePdfSourceOptions
): ProgressivePdfSource {
  const { url, cachedData, onProgress, onFirstPageReady, onDocumentLoaded, onError } = options

  let progress: ProgressiveLoadingProgress = {
    loaded: 0,
    total: 0,
    percent: -1,
    firstPageReady: false,
    totalPages: 0,
    fullyLoaded: false,
  }

  // Configure pdfjs for progressive loading
  const loadingTask = pdfjs.getDocument({
    // Use cached data if available, otherwise load from URL
    ...(cachedData ? { data: cachedData } : { url }),
    // Enable range requests for streaming (only when loading from URL)
    rangeChunkSize: cachedData ? undefined : 65536, // 64KB chunks
    disableAutoFetch: false,
    disableStream: false,
  })

  // Track byte-level progress
  loadingTask.onProgress = ({ loaded, total }: { loaded: number; total: number }) => {
    const percent = total > 0 ? Math.round((loaded / total) * 100) : -1
    progress = {
      ...progress,
      loaded,
      total,
      percent,
      fullyLoaded: total > 0 && loaded >= total,
    }
    onProgress?.(progress)
  }

  // Handle document ready (metadata loaded)
  loadingTask.promise
    .then((pdf) => {
      // Document metadata is loaded, first page can now be rendered
      progress = {
        ...progress,
        firstPageReady: true,
        totalPages: pdf.numPages,
        fullyLoaded: true,
      }
      onProgress?.(progress)
      onFirstPageReady?.(pdf.numPages)
      onDocumentLoaded?.(pdf.numPages)
    })
    .catch((error: Error) => {
      if (error.name !== 'AbortException') {
        onError?.(error)
      }
    })

  // Cleanup function to abort loading if needed
  const cleanup = () => {
    loadingTask.destroy().catch(() => {
      // Ignore errors during cleanup
    })
  }

  return {
    loadingTask,
    cleanup,
  }
}

/**
 * Priority queue for page loading in scroll mode.
 * Returns page numbers in order of priority:
 * 1. Visible pages (highest priority)
 * 2. Buffer pages (pages adjacent to visible area)
 * 3. Remaining pages (lowest priority)
 */
export interface PageLoadingPriority {
  /** Visible pages (should be loaded immediately) */
  visiblePages: number[]
  /** Buffer pages (preload ±3 pages from visible) */
  bufferPages: number[]
  /** Remaining pages (background load) */
  remainingPages: number[]
}

/**
 * Calculate page loading priority based on current viewport position.
 *
 * @param visiblePageStart First visible page number (1-indexed)
 * @param visiblePageEnd Last visible page number (1-indexed)
 * @param totalPages Total number of pages in document
 * @param bufferSize Number of pages to buffer around visible area (default: 3)
 * @returns Page loading priority queue
 */
export function calculatePageLoadingPriority(
  visiblePageStart: number,
  visiblePageEnd: number,
  totalPages: number,
  bufferSize: number = 3
): PageLoadingPriority {
  // Ensure valid ranges
  const start = Math.max(1, visiblePageStart)
  const end = Math.min(totalPages, visiblePageEnd)

  // Visible pages
  const visiblePages: number[] = []
  for (let i = start; i <= end; i++) {
    visiblePages.push(i)
  }

  // Buffer pages (before and after visible area)
  const bufferPages: number[] = []
  const bufferStart = Math.max(1, start - bufferSize)
  const bufferEnd = Math.min(totalPages, end + bufferSize)

  for (let i = bufferStart; i < start; i++) {
    bufferPages.push(i)
  }
  for (let i = end + 1; i <= bufferEnd; i++) {
    bufferPages.push(i)
  }

  // Remaining pages
  const visibleAndBufferSet = new Set([...visiblePages, ...bufferPages])
  const remainingPages: number[] = []
  for (let i = 1; i <= totalPages; i++) {
    if (!visibleAndBufferSet.has(i)) {
      remainingPages.push(i)
    }
  }

  return {
    visiblePages,
    bufferPages,
    remainingPages,
  }
}

/**
 * Check if browser supports progressive PDF features.
 */
export function supportsProgressiveLoading(): boolean {
  // Check for fetch API with streaming support
  if (typeof fetch === 'undefined') return false
  if (typeof ReadableStream === 'undefined') return false

  return true
}