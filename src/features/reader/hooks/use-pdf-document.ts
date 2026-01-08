'use client'

import { useState, useCallback } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'

interface UsePdfDocumentReturn {
  numPages: number
  isLoading: boolean
  error: string | null
  onDocumentLoadSuccess: (pdf: { numPages: number }) => void
  onDocumentLoadError: (error: Error) => void
}

export function usePdfDocument(): UsePdfDocumentReturn {
  const [numPages, setNumPages] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const onDocumentLoadSuccess = useCallback(
    (pdf: { numPages: number } | PDFDocumentProxy) => {
      setNumPages(pdf.numPages)
      setIsLoading(false)
      setError(null)
    },
    []
  )

  const onDocumentLoadError = useCallback((err: Error) => {
    console.error('PDF load error:', err)
    setError(err.message || 'Failed to load PDF')
    setIsLoading(false)
  }, [])

  return {
    numPages,
    isLoading,
    error,
    onDocumentLoadSuccess,
    onDocumentLoadError,
  }
}
