'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as coursesApi from '../api'
import { isApiError, ApiClientError } from '@/lib/api-client'

/**
 * Hook for fetching all courses
 */
export function useCourses() {
  return useQuery({
    queryKey: ['courses'],
    queryFn: async () => {
      const result = await coursesApi.getCourses()
      if (isApiError(result)) {
        throw new ApiClientError(result.error)
      }
      return result.data.items
    },
  })
}

/**
 * Hook for fetching a single course
 */
export function useCourse(courseId: string) {
  return useQuery({
    queryKey: ['courses', courseId],
    queryFn: async () => {
      const result = await coursesApi.getCourse(courseId)
      if (isApiError(result)) {
        throw new ApiClientError(result.error)
      }
      return result.data
    },
    enabled: !!courseId,
  })
}

/**
 * Hook for creating a course
 */
export function useCreateCourse() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: coursesApi.CreateCourseInput) => {
      const result = await coursesApi.createCourse(input)
      if (isApiError(result)) {
        throw new ApiClientError(result.error)
      }
      return result.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['courses'] })
    },
  })
}

/**
 * Hook for updating a course
 */
export function useUpdateCourse() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      courseId,
      input,
    }: {
      courseId: string
      input: coursesApi.UpdateCourseInput
    }) => {
      const result = await coursesApi.updateCourse(courseId, input)
      if (isApiError(result)) {
        throw new ApiClientError(result.error)
      }
      return result.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['courses'] })
      queryClient.setQueryData(['courses', data.id], data)
    },
  })
}

/**
 * Hook for deleting a course
 */
export function useDeleteCourse() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (courseId: string) => {
      const result = await coursesApi.deleteCourse(courseId)
      if (isApiError(result)) {
        throw new ApiClientError(result.error)
      }
      return result.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['courses'] })
    },
  })
}
