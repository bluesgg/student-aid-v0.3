'use client'

import { useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as outlineApi from '../api'

/**
 * Hook for fetching existing outline
 */
export function useOutline(courseId: string) {
  return useQuery({
    queryKey: ['outline', courseId],
    queryFn: () => outlineApi.getOutline(courseId),
    enabled: !!courseId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

/**
 * Hook for generating course outline
 */
export function useGenerateOutline(courseId: string) {
  const queryClient = useQueryClient()
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generate = useCallback(
    async (regenerate: boolean = false) => {
      setIsGenerating(true)
      setError(null)

      try {
        const result = await outlineApi.generateOutline(courseId, regenerate)

        // Update the cache with the new outline
        queryClient.setQueryData(['outline', courseId], {
          id: result.id,
          outline: result.outline,
          exists: true,
          createdAt: result.createdAt,
        })

        // Invalidate quotas
        queryClient.invalidateQueries({ queryKey: ['quotas'] })

        return result
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to generate outline'
        setError(message)
        throw err
      } finally {
        setIsGenerating(false)
      }
    },
    [courseId, queryClient]
  )

  const reset = useCallback(() => {
    setError(null)
  }, [])

  return {
    generate,
    isGenerating,
    error,
    reset,
  }
}
