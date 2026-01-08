'use client'

import { useState, useCallback, useMemo } from 'react'

interface UsePageNavigationProps {
  totalPages: number
  initialPage?: number
  onPageChange?: (page: number) => void
}

interface UsePageNavigationReturn {
  currentPage: number
  setCurrentPage: (page: number) => void
  goToPage: (page: number) => void
  goToNextPage: () => void
  goToPreviousPage: () => void
  goToFirstPage: () => void
  goToLastPage: () => void
  canGoNext: boolean
  canGoPrevious: boolean
}

export function usePageNavigation({
  totalPages,
  initialPage = 1,
  onPageChange,
}: UsePageNavigationProps): UsePageNavigationReturn {
  const [currentPage, setCurrentPageState] = useState(
    Math.min(Math.max(1, initialPage), Math.max(1, totalPages))
  )

  // Update current page (with validation and callback)
  const setCurrentPage = useCallback(
    (page: number) => {
      const validPage = Math.min(Math.max(1, page), Math.max(1, totalPages))
      setCurrentPageState(validPage)
      onPageChange?.(validPage)
    },
    [totalPages, onPageChange]
  )

  // Navigate to specific page
  const goToPage = useCallback(
    (page: number) => {
      setCurrentPage(page)
    },
    [setCurrentPage]
  )

  // Navigate to next page
  const goToNextPage = useCallback(() => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1)
    }
  }, [currentPage, totalPages, setCurrentPage])

  // Navigate to previous page
  const goToPreviousPage = useCallback(() => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1)
    }
  }, [currentPage, setCurrentPage])

  // Navigate to first page
  const goToFirstPage = useCallback(() => {
    setCurrentPage(1)
  }, [setCurrentPage])

  // Navigate to last page
  const goToLastPage = useCallback(() => {
    setCurrentPage(totalPages)
  }, [totalPages, setCurrentPage])

  // Computed states
  const canGoNext = useMemo(() => currentPage < totalPages, [currentPage, totalPages])
  const canGoPrevious = useMemo(() => currentPage > 1, [currentPage])

  return {
    currentPage,
    setCurrentPage,
    goToPage,
    goToNextPage,
    goToPreviousPage,
    goToFirstPage,
    goToLastPage,
    canGoNext,
    canGoPrevious,
  }
}
