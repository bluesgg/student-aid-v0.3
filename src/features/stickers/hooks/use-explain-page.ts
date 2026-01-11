'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import * as stickersApi from '../api'
import { isApiError, ApiClientError } from '@/lib/api-client'

interface ExplainPageParams {
  courseId: string
  fileId: string
  page: number
  pdfType: stickersApi.PdfType
}

/**
 * Hook for explaining a page (generating auto-stickers)
 */
export function useExplainPage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: ExplainPageParams) => {
      const result = await stickersApi.explainPage(params)
      if (isApiError(result)) {
        throw new ApiClientError(result.error)
      }
      return { ...result.data, fileId: params.fileId }
    },
    onSuccess: (data, variables) => {
      // Update stickers cache - use undefined as third param to match useStickers(fileId) call
      queryClient.setQueryData(
        ['stickers', variables.fileId, undefined],
        (old: { items: stickersApi.Sticker[] } | undefined) => {
          if (!old) {
            return { items: data.stickers }
          }

          // Add new stickers, avoiding duplicates
          const existingIds = new Set(old.items.map((s) => s.id))
          const newStickers = data.stickers.filter((s) => !existingIds.has(s.id))

          return {
            ...old,
            items: [...old.items, ...newStickers],
          }
        }
      )

      // Also invalidate to ensure fresh data from server
      queryClient.invalidateQueries({ queryKey: ['stickers', variables.fileId] })

      // Update quotas cache
      queryClient.setQueryData(['quotas'], (old: Record<string, unknown> | undefined) => {
        if (!old) return old
        return {
          ...old,
          autoExplain: data.quota.autoExplain,
        }
      })
    },
  })
}
