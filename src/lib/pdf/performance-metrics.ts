/**
 * PDF Load Performance Metrics Module
 *
 * Tracks and records PDF loading performance metrics for analytics.
 * Follows the pattern from sticker-metrics.ts.
 */

import { debugLog } from '@/lib/debug'

// ==================== Types ====================

export interface PdfLoadMetrics {
  fileId: string
  loadTimeMs: number
  firstPageTimeMs: number | null
  totalPages: number | null
  fileSizeBytes: number | null
  cacheHit: boolean
}

export interface PdfLoadMetricsSnapshot {
  period: 'hour' | 'day' | 'week'
  startTime: string
  endTime: string

  // Load counts
  totalLoads: number
  cacheHits: number
  cacheMisses: number
  cacheHitRate: number

  // Timing stats
  avgLoadTimeMs: number
  avgFirstPageTimeMs: number
  p50LoadTimeMs: number
  p95LoadTimeMs: number

  // Size stats
  avgFileSizeBytes: number
  totalBytesLoaded: number
}

// ==================== Performance Tracker Class ====================

/**
 * Tracks the timing of a single PDF load operation.
 *
 * @example
 * ```tsx
 * const tracker = new PdfLoadTracker(fileId)
 *
 * // In component:
 * useEffect(() => {
 *   tracker.start()
 *   return () => tracker.abort()
 * }, [])
 *
 * // When first page renders:
 * tracker.markFirstPage()
 *
 * // When document fully loads:
 * tracker.complete({
 *   totalPages: numPages,
 *   fileSizeBytes: size,
 *   cacheHit: isCached
 * })
 * ```
 */
export class PdfLoadTracker {
  private fileId: string
  private startTime: number | null = null
  private firstPageTime: number | null = null
  private completed = false
  private aborted = false

  constructor(fileId: string) {
    this.fileId = fileId
  }

  /**
   * Start tracking the load operation
   */
  start(): void {
    if (this.startTime !== null) {
      debugLog('[PdfLoadTracker] Already started, ignoring duplicate start')
      return
    }
    this.startTime = performance.now()
    debugLog('[PdfLoadTracker] Started tracking for:', this.fileId)
  }

  /**
   * Mark when the first page becomes visible
   */
  markFirstPage(): void {
    if (this.firstPageTime !== null) {
      debugLog('[PdfLoadTracker] First page already marked, ignoring')
      return
    }
    if (this.startTime === null) {
      debugLog('[PdfLoadTracker] Not started, cannot mark first page')
      return
    }
    this.firstPageTime = performance.now()
    const elapsed = Math.round(this.firstPageTime - this.startTime)
    debugLog('[PdfLoadTracker] First page visible in:', elapsed, 'ms')
  }

  /**
   * Mark the load as aborted (e.g., component unmounted before load completed)
   */
  abort(): void {
    if (this.completed) return
    this.aborted = true
    debugLog('[PdfLoadTracker] Aborted for:', this.fileId)
  }

  /**
   * Complete the tracking and record metrics
   */
  async complete(options: {
    totalPages: number | null
    fileSizeBytes: number | null
    cacheHit: boolean
  }): Promise<void> {
    if (this.completed || this.aborted) {
      debugLog('[PdfLoadTracker] Already completed or aborted, ignoring')
      return
    }
    if (this.startTime === null) {
      debugLog('[PdfLoadTracker] Not started, cannot complete')
      return
    }

    this.completed = true
    const endTime = performance.now()

    const metrics: PdfLoadMetrics = {
      fileId: this.fileId,
      loadTimeMs: Math.round(endTime - this.startTime),
      firstPageTimeMs: this.firstPageTime
        ? Math.round(this.firstPageTime - this.startTime)
        : null,
      totalPages: options.totalPages,
      fileSizeBytes: options.fileSizeBytes,
      cacheHit: options.cacheHit,
    }

    debugLog('[PdfLoadTracker] Completed:', {
      fileId: this.fileId,
      loadTimeMs: metrics.loadTimeMs,
      firstPageTimeMs: metrics.firstPageTimeMs,
      cacheHit: metrics.cacheHit,
    })

    // Record to server (fire-and-forget)
    recordPdfLoadMetric(metrics).catch((err) => {
      console.warn('[PdfLoadTracker] Failed to record metrics:', err)
    })
  }

  /**
   * Get elapsed time since start (for debugging)
   */
  getElapsedMs(): number | null {
    if (this.startTime === null) return null
    return Math.round(performance.now() - this.startTime)
  }
}

// ==================== API Functions ====================

/**
 * Record a PDF load metric to the server
 *
 * This is a fire-and-forget operation - errors are logged but not thrown.
 */
export async function recordPdfLoadMetric(metric: PdfLoadMetrics): Promise<void> {
  try {
    const response = await fetch('/api/metrics/pdf-load', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileId: metric.fileId,
        loadTimeMs: metric.loadTimeMs,
        firstPageTimeMs: metric.firstPageTimeMs,
        totalPages: metric.totalPages,
        fileSizeBytes: metric.fileSizeBytes,
        cacheHit: metric.cacheHit,
      }),
    })

    if (!response.ok) {
      console.warn('[recordPdfLoadMetric] Server returned error:', response.status)
    }
  } catch (err) {
    // Non-fatal - just log
    console.warn('[recordPdfLoadMetric] Failed to record:', err)
  }
}

/**
 * Get aggregated PDF load metrics for a time period
 *
 * @param period - Time period to aggregate ('hour', 'day', 'week')
 * @returns Aggregated metrics snapshot
 */
export async function getPdfLoadMetrics(
  period: 'hour' | 'day' | 'week' = 'day'
): Promise<PdfLoadMetricsSnapshot | null> {
  try {
    const response = await fetch(`/api/metrics/pdf-load?period=${period}`)

    if (!response.ok) {
      console.warn('[getPdfLoadMetrics] Server returned error:', response.status)
      return null
    }

    return response.json()
  } catch (err) {
    console.error('[getPdfLoadMetrics] Failed to fetch:', err)
    return null
  }
}

// ==================== React Hook ====================

/**
 * Hook to create and manage a PDF load tracker.
 *
 * This hook should be used in the PDF viewer component to track loading performance.
 *
 * @example
 * ```tsx
 * const tracker = usePdfLoadTracker(fileId)
 *
 * useEffect(() => {
 *   tracker.start()
 *   return () => tracker.abort()
 * }, [])
 *
 * // When first page renders:
 * const handleFirstPageReady = () => {
 *   tracker.markFirstPage()
 * }
 *
 * // When document loads:
 * const handleDocumentLoad = (pdf) => {
 *   tracker.complete({
 *     totalPages: pdf.numPages,
 *     fileSizeBytes: null, // or actual size if available
 *     cacheHit: isCached
 *   })
 * }
 * ```
 */
export function createPdfLoadTracker(fileId: string): PdfLoadTracker {
  return new PdfLoadTracker(fileId)
}
