/**
 * PDF Load Performance Metrics Module
 * Tracks and records PDF loading performance metrics for analytics.
 */

import { debugLog } from '@/lib/debug'

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

/**
 * Tracks the timing of a single PDF load operation.
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

  start(): void {
    if (this.startTime !== null) {
      debugLog('[PdfLoadTracker] Already started, ignoring duplicate start')
      return
    }
    this.startTime = performance.now()
    debugLog('[PdfLoadTracker] Started tracking for:', this.fileId)
  }

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

  abort(): void {
    if (this.completed) return
    this.aborted = true
    debugLog('[PdfLoadTracker] Aborted for:', this.fileId)
  }

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

  getElapsedMs(): number | null {
    if (this.startTime === null) return null
    return Math.round(performance.now() - this.startTime)
  }
}

/**
 * Record a PDF load metric to the server (fire-and-forget).
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
 * Get aggregated PDF load metrics for a time period.
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

export function createPdfLoadTracker(fileId: string): PdfLoadTracker {
  return new PdfLoadTracker(fileId)
}
