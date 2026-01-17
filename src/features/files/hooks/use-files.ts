'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as filesApi from '../api'
import { isApiError, ApiClientError } from '@/lib/api-client'

/**
 * Hook for fetching all files in a course
 */
export function useFiles(courseId: string) {
  return useQuery({
    queryKey: ['files', courseId],
    queryFn: async () => {
      const result = await filesApi.getFiles(courseId)
      if (isApiError(result)) {
        throw new ApiClientError(result.error)
      }
      return result.data
    },
    enabled: !!courseId,
  })
}

/**
 * Hook for fetching a single file.
 * Includes caching configuration:
 * - staleTime: 30 minutes (signed URL is valid for 1 hour, so 30 min is safe)
 * - This prevents redundant API calls when navigating back to the same file
 */
export function useFile(courseId: string, fileId: string) {
  return useQuery({
    queryKey: ['files', courseId, fileId],
    queryFn: async () => {
      const result = await filesApi.getFile(courseId, fileId)
      if (isApiError(result)) {
        throw new ApiClientError(result.error)
      }
      return result.data
    },
    enabled: !!courseId && !!fileId,
    staleTime: 30 * 60 * 1000, // 30 minutes - safe for 1-hour signed URL
    gcTime: 60 * 60 * 1000, // 1 hour - keep in cache
  })
}

/**
 * Hook for uploading a file
 */
export function useUploadFile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      courseId,
      file,
      name,
      type,
    }: {
      courseId: string
      file: File
      name: string
      type: filesApi.FileType
    }) => {
      const result = await filesApi.uploadFile(courseId, file, name, type)
      if (isApiError(result)) {
        throw new ApiClientError(result.error)
      }
      return result.data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['files', variables.courseId] })
      queryClient.invalidateQueries({ queryKey: ['courses'] })
    },
  })
}

/**
 * Hook for updating a file
 */
export function useUpdateFile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      courseId,
      fileId,
      data,
    }: {
      courseId: string
      fileId: string
      data: { lastReadPage?: number }
    }) => {
      const result = await filesApi.updateFile(courseId, fileId, data)
      if (isApiError(result)) {
        throw new ApiClientError(result.error)
      }
      return result.data
    },
    onSuccess: (data, variables) => {
      queryClient.setQueryData(
        ['files', variables.courseId, variables.fileId],
        data
      )
    },
  })
}

/**
 * Hook for deleting a file
 */
export function useDeleteFile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      courseId,
      fileId,
    }: {
      courseId: string
      fileId: string
    }) => {
      const result = await filesApi.deleteFile(courseId, fileId)
      if (isApiError(result)) {
        throw new ApiClientError(result.error)
      }
      return result.data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['files', variables.courseId] })
      queryClient.invalidateQueries({ queryKey: ['courses'] })
    },
  })
}
