'use client'

import { useCallback, useRef, useEffect } from 'react'
import { useHoverHighlight } from '@/features/stickers/context'
import type { Sticker } from '@/features/stickers/api'

interface UsePdfStickerHitTestOptions {
  /** Stickers for the current page */
  pageStickers: Sticker[]
  /** Current page number */
  currentPage: number
  /** Whether the feature is enabled */
  enabled?: boolean
  /** Throttle interval in ms */
  throttleMs?: number
}

/**
 * Normalized rect for PDF regions (0-1 coordinates)
 */
interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Check if a point is within a rect
 */
function isPointInRegion(point: { x: number; y: number }, rect: Rect): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  )
}

/**
 * Hook for detecting mouse hover over sticker anchor regions on PDF
 *
 * This enables the PDF → Sticker direction of bidirectional hover highlighting:
 * When user hovers over a region on the PDF that has a sticker anchor,
 * the corresponding sticker card gets highlighted.
 */
export function usePdfStickerHitTest({
  pageStickers,
  currentPage,
  enabled = true,
  throttleMs = 50,
}: UsePdfStickerHitTestOptions) {
  const { setMatchingStickers } = useHoverHighlight()
  const lastUpdateRef = useRef<number>(0)
  const pendingIdsRef = useRef<string[]>([])
  const rafIdRef = useRef<number | null>(null)

  // Handle mouse move on PDF page
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLElement>, pageElement: HTMLElement) => {
      if (!enabled) return

      // Throttle updates
      const now = Date.now()
      if (now - lastUpdateRef.current < throttleMs) {
        return
      }
      lastUpdateRef.current = now

      // Get page dimensions
      const pageRect = pageElement.getBoundingClientRect()

      // Calculate normalized coordinates (0-1)
      const normalizedX = (e.clientX - pageRect.left) / pageRect.width
      const normalizedY = (e.clientY - pageRect.top) / pageRect.height

      // Skip if outside page bounds
      if (normalizedX < 0 || normalizedX > 1 || normalizedY < 0 || normalizedY > 1) {
        if (pendingIdsRef.current.length > 0) {
          pendingIdsRef.current = []
          setMatchingStickers([])
        }
        return
      }

      // Find stickers whose anchors contain this point
      const matchingIds: string[] = []
      const point = { x: normalizedX, y: normalizedY }

      for (const sticker of pageStickers) {
        // Skip stickers on different pages
        if (sticker.page !== currentPage) continue

        // Skip full-page stickers (no need to highlight entire page)
        if (sticker.anchor.isFullPage) continue

        // Check if sticker has a rect anchor
        const rect = sticker.anchor.rect
        if (rect && isPointInRegion(point, rect)) {
          matchingIds.push(sticker.id)
        }
      }

      // Only update if changed (to avoid unnecessary re-renders)
      const prevIds = pendingIdsRef.current
      const changed =
        matchingIds.length !== prevIds.length ||
        matchingIds.some((id, i) => id !== prevIds[i])

      if (changed) {
        pendingIdsRef.current = matchingIds

        // Use RAF for smoother updates
        if (rafIdRef.current) {
          cancelAnimationFrame(rafIdRef.current)
        }
        rafIdRef.current = requestAnimationFrame(() => {
          setMatchingStickers(matchingIds)
          rafIdRef.current = null
        })
      }
    },
    [enabled, pageStickers, currentPage, throttleMs, setMatchingStickers]
  )

  // Handle mouse leave from PDF page
  const handleMouseLeave = useCallback(() => {
    if (pendingIdsRef.current.length > 0) {
      pendingIdsRef.current = []
      setMatchingStickers([])
    }
  }, [setMatchingStickers])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current)
      }
    }
  }, [])

  return {
    handleMouseMove,
    handleMouseLeave,
  }
}
