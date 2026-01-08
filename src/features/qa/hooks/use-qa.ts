'use client'

import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import * as qaApi from '../api'

interface UseQAReturn {
  askQuestion: (question: string) => Promise<void>
  isLoading: boolean
  streamingContent: string
  error: string | null
  reset: () => void
}

interface UseQAParams {
  courseId: string
  fileId: string
  pdfType: qaApi.PdfType
}

/**
 * Hook for asking questions about a PDF with streaming support
 */
export function useQA({ courseId, fileId, pdfType }: UseQAParams): UseQAReturn {
  const queryClient = useQueryClient()
  const [isLoading, setIsLoading] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [error, setError] = useState<string | null>(null)

  const askQuestion = useCallback(
    async (question: string) => {
      setIsLoading(true)
      setStreamingContent('')
      setError(null)

      try {
        await qaApi.askQuestion(
          {
            courseId,
            fileId,
            question,
            pdfType,
          },
          // On each chunk
          (chunk) => {
            setStreamingContent((prev) => prev + chunk)
          },
          // On complete
          () => {
            // Refresh Q&A history
            queryClient.invalidateQueries({
              queryKey: ['qa-history', fileId],
            })

            // Update quotas
            queryClient.invalidateQueries({ queryKey: ['quotas'] })
          }
        )
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to get answer')
      } finally {
        setIsLoading(false)
      }
    },
    [courseId, fileId, pdfType, queryClient]
  )

  const reset = useCallback(() => {
    setIsLoading(false)
    setStreamingContent('')
    setError(null)
  }, [])

  return {
    askQuestion,
    isLoading,
    streamingContent,
    error,
    reset,
  }
}
