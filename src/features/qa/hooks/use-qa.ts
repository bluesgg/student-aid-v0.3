'use client'

import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import * as qaApi from '../api'

export interface ExplainParams {
  selectedText: string
  page: number
  parentContext?: string
  locale?: string
}

interface UseQAReturn {
  askQuestion: (question: string) => Promise<void>
  explainSelection: (params: ExplainParams) => Promise<void>
  isLoading: boolean
  streamingContent: string
  streamingType: 'question' | 'explain' | null
  streamingMeta: { selectedText: string; page: number } | null
  error: string | null
  reset: () => void
}

interface UseQAParams {
  courseId: string
  fileId: string
  pdfType: qaApi.PdfType
}

/**
 * Hook for asking questions and explaining selections about a PDF with streaming support
 */
export function useQA({ courseId, fileId, pdfType }: UseQAParams): UseQAReturn {
  const queryClient = useQueryClient()
  const [isLoading, setIsLoading] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [streamingType, setStreamingType] = useState<'question' | 'explain' | null>(null)
  const [streamingMeta, setStreamingMeta] = useState<{ selectedText: string; page: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const askQuestion = useCallback(
    async (question: string) => {
      setIsLoading(true)
      setStreamingContent('')
      setStreamingType('question')
      setStreamingMeta(null)
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

  const explainSelection = useCallback(
    async (params: ExplainParams) => {
      setIsLoading(true)
      setStreamingContent('')
      setStreamingType('explain')
      setStreamingMeta({ selectedText: params.selectedText, page: params.page })
      setError(null)

      try {
        await qaApi.explainSelection(
          {
            courseId,
            fileId,
            page: params.page,
            selectedText: params.selectedText,
            pdfType,
            locale: params.locale,
            parentContext: params.parentContext,
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
        setError(err instanceof Error ? err.message : 'Failed to explain selection')
      } finally {
        setIsLoading(false)
      }
    },
    [courseId, fileId, pdfType, queryClient]
  )

  const reset = useCallback(() => {
    setIsLoading(false)
    setStreamingContent('')
    setStreamingType(null)
    setStreamingMeta(null)
    setError(null)
  }, [])

  return {
    askQuestion,
    explainSelection,
    isLoading,
    streamingContent,
    streamingType,
    streamingMeta,
    error,
    reset,
  }
}
