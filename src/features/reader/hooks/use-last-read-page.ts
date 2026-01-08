'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { updateLastReadPage } from '../api'

interface UseLastReadPageProps {
  courseId: string
  fileId: string
  initialPage: number
  totalPages: number
}

interface UseLastReadPageReturn {
  currentPage: number
  setPage: (page: number) => void
  isSaving: boolean
  lastSavedPage: number
}

const DEBOUNCE_MS = 1000 // Save after 1 second of no page changes

export function useLastReadPage({
  courseId,
  fileId,
  initialPage,
  totalPages,
}: UseLastReadPageProps): UseLastReadPageReturn {
  const [currentPage, setCurrentPage] = useState(initialPage)
  const [lastSavedPage, setLastSavedPage] = useState(initialPage)
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const pendingPageRef = useRef<number | null>(null)

  // Mutation for saving to backend
  const mutation = useMutation({
    mutationFn: (page: number) => updateLastReadPage(courseId, fileId, page),
    onSuccess: (_, page) => {
      setLastSavedPage(page)
    },
  })

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
      // Save pending page on unmount
      if (pendingPageRef.current !== null) {
        mutation.mutate(pendingPageRef.current)
      }
    }
  // Only run cleanup on unmount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Set page with debounced save
  const setPage = useCallback(
    (page: number) => {
      // Validate page number
      const validPage = Math.min(Math.max(1, page), totalPages)
      setCurrentPage(validPage)
      pendingPageRef.current = validPage

      // Clear existing timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }

      // Set new debounce timer
      debounceTimerRef.current = setTimeout(() => {
        if (pendingPageRef.current !== null && pendingPageRef.current !== lastSavedPage) {
          mutation.mutate(pendingPageRef.current)
          pendingPageRef.current = null
        }
      }, DEBOUNCE_MS)
    },
    [totalPages, lastSavedPage, mutation]
  )

  return {
    currentPage,
    setPage,
    isSaving: mutation.isPending,
    lastSavedPage,
  }
}
