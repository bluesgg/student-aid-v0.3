'use client'

import { useState, useCallback } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'

/**
 * Loading progress state for PDF document
 */
export interface LoadingProgress {
  /** Bytes loaded so far */
  loaded: number
  /** Total bytes (if known) */
  total: number
  /** Percentage complete (0-100), or -1 if total unknown */
  percent: number
  /** Whether the first page is ready for rendering */
  firstPageReady?: boolean
  /** Total number of pages (after metadata loads) */
  totalPages?: number
}

interface UsePdfDocumentReturn {
  numPages: number
  isLoading: boolean
  /** Whether the first page is ready for rendering (enables early display) */
  isFirstPageReady: boolean
  error: string | null
  /** Loading progress for progress indicator */
  loadingProgress: LoadingProgress | null
  onDocumentLoadSuccess: (pdf: { numPages: number }) => void
  onDocumentLoadError: (error: Error) => void
  /** Handler for loading progress updates */
  onLoadProgress: (progressData: { loaded: number; total: number }) => void
  /** Mark first page as ready (called when first page canvas renders) */
  markFirstPageReady: () => void
}

export function usePdfDocument(): UsePdfDocumentReturn {
  const [numPages, setNumPages] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isFirstPageReady, setIsFirstPageReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadingProgress, setLoadingProgress] = useState<LoadingProgress | null>(null)

  const onLoadProgress = useCallback(
    (progressData: { loaded: number; total: number }) => {
      const { loaded, total } = progressData
      const percent = total > 0 ? Math.round((loaded / total) * 100) : -1
      setLoadingProgress((prev) => ({
        loaded,
        total,
        percent,
        firstPageReady: prev?.firstPageReady ?? false,
        totalPages: prev?.totalPages ?? 0,
      }))
    },
    []
  )

  const onDocumentLoadSuccess = useCallback(
    (pdf: { numPages: number } | PDFDocumentProxy) => {
      setNumPages(pdf.numPages)
      setIsLoading(false)
      setError(null)
      // Update progress with final page count, keep progress for display
      setLoadingProgress((prev) => prev ? {
        ...prev,
        totalPages: pdf.numPages,
        percent: 100,
      } : null)
    },
    []
  )

  const onDocumentLoadError = useCallback((err: Error) => {
    console.error('PDF load error:', err)
    setError(err.message || 'Failed to load PDF')
    setIsLoading(false)
    setLoadingProgress(null) // Clear progress on error
  }, [])

  const markFirstPageReady = useCallback(() => {
    setIsFirstPageReady(true)
    setLoadingProgress((prev) => prev ? {
      ...prev,
      firstPageReady: true,
    } : null)
  }, [])

  return {
    numPages,
    isLoading,
    isFirstPageReady,
    error,
    loadingProgress,
    onDocumentLoadSuccess,
    onDocumentLoadError,
    onLoadProgress,
    markFirstPageReady,
  }
}
