'use client'

import { useEffect, useRef, useCallback } from 'react'

const JUMP_THRESHOLD = 10 // Pages
const DEBOUNCE_MS = 300

/**
 * Hook for tracking page navigation and triggering window updates
 * Uses IntersectionObserver to detect current visible page
 */
export function useWindowTracker(options: {
  currentPage: number
  onPageChange: (page: number, isJump: boolean) => void
  enabled?: boolean
}) {
  const { currentPage, onPageChange, enabled = true } = options

  const lastPageRef = useRef(currentPage)
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  /**
   * Handle page change with debouncing
   */
  const handlePageChange = useCallback(
    (newPage: number) => {
      if (!enabled) return

      // Clear existing debounce
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current)
      }

      // Debounce the change
      debounceTimeoutRef.current = setTimeout(() => {
        const oldPage = lastPageRef.current
        const distance = Math.abs(newPage - oldPage)
        const isJump = distance > JUMP_THRESHOLD

        lastPageRef.current = newPage
        onPageChange(newPage, isJump)
      }, DEBOUNCE_MS)
    },
    [enabled, onPageChange]
  )

  // Update when current page changes externally
  useEffect(() => {
    if (currentPage !== lastPageRef.current) {
      handlePageChange(currentPage)
    }
  }, [currentPage, handlePageChange])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current)
      }
    }
  }, [])

  return {
    trackPage: handlePageChange,
    lastTrackedPage: lastPageRef.current,
  }
}

/**
 * Hook for detecting visible pages in a scrollable container
 * Uses IntersectionObserver to track which pages are visible
 */
export function useVisiblePageDetector(options: {
  containerRef: React.RefObject<HTMLElement>
  pageCount: number
  onVisiblePageChange: (page: number) => void
  enabled?: boolean
}) {
  const { containerRef, pageCount, onVisiblePageChange, enabled = true } = options
  const observerRef = useRef<IntersectionObserver | null>(null)
  const visiblePagesRef = useRef<Set<number>>(new Set())

  useEffect(() => {
    if (!enabled || !containerRef.current) return

    // Create intersection observer
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const pageNum = parseInt(entry.target.getAttribute('data-page') || '0', 10)
          if (pageNum === 0) return

          if (entry.isIntersecting) {
            visiblePagesRef.current.add(pageNum)
          } else {
            visiblePagesRef.current.delete(pageNum)
          }
        })

        // Determine primary visible page (smallest visible page number)
        const visiblePages = Array.from(visiblePagesRef.current).sort((a, b) => a - b)
        if (visiblePages.length > 0) {
          onVisiblePageChange(visiblePages[0])
        }
      },
      {
        root: containerRef.current,
        rootMargin: '0px',
        threshold: 0.5, // Page is visible when 50% in view
      }
    )

    // Observe all page elements
    const pageElements = containerRef.current.querySelectorAll('[data-page]')
    pageElements.forEach((el) => {
      observerRef.current?.observe(el)
    })

    return () => {
      observerRef.current?.disconnect()
    }
  }, [containerRef, pageCount, enabled, onVisiblePageChange])

  return {
    visiblePages: visiblePagesRef.current,
  }
}
