'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as stickersApi from '../api'
import { isApiError, ApiClientError } from '@/lib/api-client'

/**
 * Hook for fetching stickers for a file
 */
export function useStickers(fileId: string, page?: number) {
  return useQuery({
    queryKey: ['stickers', fileId, page],
    queryFn: async () => {
      const result = await stickersApi.getStickers(fileId, page)
      if (isApiError(result)) {
        throw new ApiClientError(result.error)
      }
      return result.data
    },
    enabled: !!fileId,
  })
}

/**
 * Hook for toggling sticker folded state
 */
export function useToggleSticker() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      stickerId,
      folded,
      fileId,
    }: {
      stickerId: string
      folded: boolean
      fileId: string
    }) => {
      const result = await stickersApi.toggleSticker(stickerId, folded)
      if (isApiError(result)) {
        throw new ApiClientError(result.error)
      }
      return { ...result.data, fileId }
    },
    onMutate: async ({ stickerId, folded, fileId }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['stickers', fileId] })

      // Snapshot the previous value
      const previousStickers = queryClient.getQueryData(['stickers', fileId])

      // Optimistically update
      queryClient.setQueryData(
        ['stickers', fileId],
        (old: { items: stickersApi.Sticker[] } | undefined) => {
          if (!old) return old
          return {
            ...old,
            items: old.items.map((s) =>
              s.id === stickerId ? { ...s, folded } : s
            ),
          }
        }
      )

      return { previousStickers }
    },
    onError: (_err, variables, context) => {
      // Rollback on error
      if (context?.previousStickers) {
        queryClient.setQueryData(
          ['stickers', variables.fileId],
          context.previousStickers
        )
      }
    },
  })
}

/**
 * Hook for deleting a sticker
 */
export function useDeleteSticker() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      stickerId,
      fileId,
    }: {
      stickerId: string
      fileId: string
    }) => {
      const result = await stickersApi.deleteSticker(stickerId)
      if (isApiError(result)) {
        throw new ApiClientError(result.error)
      }
      return { ...result.data, fileId }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['stickers', variables.fileId] })
    },
  })
}
