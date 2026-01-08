'use client'

import { useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as qaApi from '../api'

interface UseSummarizeReturn {
  generateDocumentSummary: () => Promise<void>
  generateSectionSummary: (startPage: number, endPage: number) => Promise<void>
  isLoading: boolean
  streamingContent: string
  error: string | null
  reset: () => void
}

interface UseSummarizeParams {
  courseId: string
  fileId: string
  pdfType: qaApi.PdfType
}

/**
 * Hook for generating document and section summaries
 */
export function useSummarize({ courseId, fileId, pdfType }: UseSummarizeParams): UseSummarizeReturn {
  const queryClient = useQueryClient()
  const [isLoading, setIsLoading] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [error, setError] = useState<string | null>(null)

  const generateDocumentSummary = useCallback(async () => {
    setIsLoading(true)
    setStreamingContent('')
    setError(null)

    try {
      const result = await qaApi.getDocumentSummary(
        {
          courseId,
          fileId,
          pdfType,
        },
        // On each chunk (if streaming)
        (chunk) => {
          setStreamingContent((prev) => prev + chunk)
        },
        // On complete
        (summary) => {
          setStreamingContent(summary.content)
          // Refresh summaries
          queryClient.invalidateQueries({
            queryKey: ['summaries', fileId],
          })
          // Update quotas
          queryClient.invalidateQueries({ queryKey: ['quotas'] })
        }
      )

      // If cached result was returned directly
      if (result) {
        setStreamingContent(result.content)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate summary')
    } finally {
      setIsLoading(false)
    }
  }, [courseId, fileId, pdfType, queryClient])

  const generateSectionSummary = useCallback(
    async (startPage: number, endPage: number) => {
      setIsLoading(true)
      setStreamingContent('')
      setError(null)

      try {
        const result = await qaApi.getSectionSummary(
          {
            courseId,
            fileId,
            pdfType,
            startPage,
            endPage,
          },
          // On each chunk
          (chunk) => {
            setStreamingContent((prev) => prev + chunk)
          },
          // On complete
          (summary) => {
            setStreamingContent(summary.content)
            // Refresh summaries
            queryClient.invalidateQueries({
              queryKey: ['summaries', fileId],
            })
            // Update quotas
            queryClient.invalidateQueries({ queryKey: ['quotas'] })
          }
        )

        // If cached result was returned directly
        if (result) {
          setStreamingContent(result.content)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to generate section summary')
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
    generateDocumentSummary,
    generateSectionSummary,
    isLoading,
    streamingContent,
    error,
    reset,
  }
}

/**
 * Hook for fetching existing summaries
 */
export function useSummaries(fileId: string, type?: 'document' | 'section') {
  return useQuery({
    queryKey: ['summaries', fileId, type],
    queryFn: () => qaApi.getSummaries(fileId, type),
    enabled: !!fileId,
    staleTime: 60 * 1000, // 1 minute
  })
}
