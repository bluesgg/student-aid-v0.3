'use client'

import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import * as stickersApi from '../api'

interface ExplainSelectionParams {
  courseId: string
  fileId: string
  page: number
  selectedText: string
  parentId?: string | null
  pdfType: stickersApi.PdfType
}

interface UseExplainSelectionReturn {
  explain: (params: ExplainSelectionParams) => Promise<void>
  isLoading: boolean
  streamingContent: string
  error: string | null
  reset: () => void
}

/**
 * Hook for explaining selected text with streaming support
 */
export function useExplainSelection(): UseExplainSelectionReturn {
  const queryClient = useQueryClient()
  const [isLoading, setIsLoading] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [error, setError] = useState<string | null>(null)

  const explain = useCallback(
    async (params: ExplainSelectionParams) => {
      setIsLoading(true)
      setStreamingContent('')
      setError(null)

      try {
        await stickersApi.explainSelection(
          params,
          // On each chunk
          (chunk) => {
            setStreamingContent((prev) => prev + chunk)
          },
          // On complete
          (stickerId) => {
            // Refresh stickers to get the final saved version
            queryClient.invalidateQueries({
              queryKey: ['stickers', params.fileId],
            })

            // Update quotas
            queryClient.invalidateQueries({ queryKey: ['quotas'] })
          }
        )
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to explain selection')
      } finally {
        setIsLoading(false)
      }
    },
    [queryClient]
  )

  const reset = useCallback(() => {
    setIsLoading(false)
    setStreamingContent('')
    setError(null)
  }, [])

  return {
    explain,
    isLoading,
    streamingContent,
    error,
    reset,
  }
}
