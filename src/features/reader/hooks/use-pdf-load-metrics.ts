'use client'

import { useRef, useEffect, useCallback } from 'react'
import { PdfLoadTracker, createPdfLoadTracker } from '@/lib/pdf/performance-metrics'
import { debugLog } from '@/lib/debug'

interface UsePdfLoadMetricsOptions {
  fileId: string
  /** Whether the PDF was loaded from cache */
  isCached: boolean
  /** Whether loading is complete (document ready) */
  isDocumentReady: boolean
  /** Number of pages in the document (available after load) */
  numPages: number | null
  /** File size in bytes (if known) */
  fileSizeBytes?: number | null
}

interface UsePdfLoadMetricsReturn {
  /** Mark when the first page becomes visible */
  markFirstPageReady: () => void
}

/**
 * Hook for tracking PDF load performance metrics.
 *
 * Automatically starts tracking when mounted and completes when the document is ready.
 * Call `markFirstPageReady` when the first page canvas is rendered.
 *
 * @example
 * ```tsx
 * const { markFirstPageReady } = usePdfLoadMetrics({
 *   fileId,
 *   isCached,
 *   isDocumentReady: !isLoading && numPages > 0,
 *   numPages,
 * })
 *
 * // In PdfPage when first page renders:
 * const handleCanvasReady = (page, canvas) => {
 *   if (page === 1) markFirstPageReady()
 * }
 * ```
 */
export function usePdfLoadMetrics({
  fileId,
  isCached,
  isDocumentReady,
  numPages,
  fileSizeBytes,
}: UsePdfLoadMetricsOptions): UsePdfLoadMetricsReturn {
  // Keep a stable reference to the tracker across renders
  const trackerRef = useRef<PdfLoadTracker | null>(null)
  const hasCompletedRef = useRef(false)
  const prevFileIdRef = useRef<string | null>(null)

  // Create new tracker when fileId changes
  useEffect(() => {
    // Reset if fileId changed
    if (prevFileIdRef.current !== fileId) {
      trackerRef.current = createPdfLoadTracker(fileId)
      trackerRef.current.start()
      hasCompletedRef.current = false
      prevFileIdRef.current = fileId
      debugLog('[usePdfLoadMetrics] Started tracking for:', fileId)
    }

    // Cleanup: abort tracking if component unmounts before completion
    return () => {
      if (trackerRef.current && !hasCompletedRef.current) {
        trackerRef.current.abort()
        debugLog('[usePdfLoadMetrics] Aborted tracking on unmount')
      }
    }
  }, [fileId])

  // Complete tracking when document is ready
  useEffect(() => {
    if (isDocumentReady && !hasCompletedRef.current && trackerRef.current) {
      hasCompletedRef.current = true
      trackerRef.current.complete({
        totalPages: numPages,
        fileSizeBytes: fileSizeBytes ?? null,
        cacheHit: isCached,
      })
      debugLog('[usePdfLoadMetrics] Completed tracking for:', fileId)
    }
  }, [isDocumentReady, numPages, fileSizeBytes, isCached, fileId])

  // Mark first page ready
  const markFirstPageReady = useCallback(() => {
    if (trackerRef.current) {
      trackerRef.current.markFirstPage()
    }
  }, [])

  return { markFirstPageReady }
}
