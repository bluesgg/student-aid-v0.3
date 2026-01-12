'use client'

/**
 * Hook for drawing rectangular selections on PDF pages.
 * Handles pointer events and converts coordinates to normalized format.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { type NormalizedRect, generateRegionId, clampRect } from '@/lib/stickers/selection-hash'

// ==================== Types ====================

export interface DrawingState {
  /** Whether user is currently drawing */
  isDrawing: boolean
  /** Start point of the drag (pixel coordinates) */
  startPoint: { x: number; y: number } | null
  /** Current mouse position during drag */
  currentPoint: { x: number; y: number } | null
  /** Page number being drawn on */
  page: number | null
}

export interface RectangleDrawingOptions {
  /** Whether drawing is enabled */
  enabled: boolean
  /** Minimum rectangle size in pixels */
  minSize?: number
  /** Callback when a rectangle is completed */
  onRectComplete: (page: number, rect: NormalizedRect, id: string) => void
  /** Callback when drawing is cancelled */
  onDrawCancel?: () => void
}

export interface RectangleDrawingResult {
  /** Current drawing state */
  drawing: DrawingState
  /** Current rect being drawn (normalized, for preview) */
  currentRect: NormalizedRect | null
  /** Current page dimensions reference */
  pageDimensionsRef: React.MutableRefObject<Map<number, { width: number; height: number }>>
  /** Pointer down handler - call this on the page container */
  handlePointerDown: (e: React.PointerEvent, page: number) => void
  /** Pointer move handler - call this on the page container */
  handlePointerMove: (e: React.PointerEvent) => void
  /** Pointer up handler - call this on the page container */
  handlePointerUp: (e: React.PointerEvent) => void
  /** Cancel current drawing */
  cancelDrawing: () => void
}

// ==================== Hook ====================

const DEFAULT_MIN_SIZE = 20 // Minimum 20px to be valid

/**
 * Hook for handling rectangle drawing on PDF pages.
 * 
 * Usage:
 * 1. Attach handlePointerDown to each page container
 * 2. Attach handlePointerMove and handlePointerUp to the main container
 * 3. Use currentRect to render a preview overlay while drawing
 * 4. Receive completed rectangles via onRectComplete callback
 * 
 * @example
 * ```tsx
 * const { drawing, currentRect, handlePointerDown, handlePointerMove, handlePointerUp } = 
 *   useRectangleDrawing({
 *     enabled: selectionMode,
 *     onRectComplete: (page, rect, id) => {
 *       addRegion({ page, rect, id })
 *     },
 *   })
 * ```
 */
export function useRectangleDrawing(
  options: RectangleDrawingOptions
): RectangleDrawingResult {
  const { enabled, minSize = DEFAULT_MIN_SIZE, onRectComplete, onDrawCancel } = options

  // Drawing state
  const [drawing, setDrawing] = useState<DrawingState>({
    isDrawing: false,
    startPoint: null,
    currentPoint: null,
    page: null,
  })

  // Page dimensions map (set by parent via ref)
  const pageDimensionsRef = useRef<Map<number, { width: number; height: number }>>(new Map())

  // Computed current rect (normalized)
  const [currentRect, setCurrentRect] = useState<NormalizedRect | null>(null)

  // Calculate normalized rect from pixel points
  const calculateNormalizedRect = useCallback(
    (
      startPoint: { x: number; y: number },
      endPoint: { x: number; y: number },
      page: number
    ): NormalizedRect | null => {
      const dimensions = pageDimensionsRef.current.get(page)
      if (!dimensions) return null

      // Calculate pixel rect (handle negative widths/heights from reverse dragging)
      const x1 = Math.min(startPoint.x, endPoint.x)
      const y1 = Math.min(startPoint.y, endPoint.y)
      const x2 = Math.max(startPoint.x, endPoint.x)
      const y2 = Math.max(startPoint.y, endPoint.y)

      // Convert to normalized coordinates
      const normalizedRect: NormalizedRect = {
        x: x1 / dimensions.width,
        y: y1 / dimensions.height,
        width: (x2 - x1) / dimensions.width,
        height: (y2 - y1) / dimensions.height,
      }

      // Clamp to valid range
      return clampRect(normalizedRect)
    },
    []
  )

  // Handle pointer down - start drawing
  const handlePointerDown = useCallback(
    (e: React.PointerEvent, page: number) => {
      if (!enabled) return

      // Only handle left mouse button or touch
      if (e.button !== 0) return

      // Prevent text selection while drawing
      e.preventDefault()

      // Get position relative to the target element
      const rect = e.currentTarget.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top

      setDrawing({
        isDrawing: true,
        startPoint: { x, y },
        currentPoint: { x, y },
        page,
      })

      // Capture pointer to receive events even if mouse leaves element
      ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    },
    [enabled]
  )

  // Handle pointer move - update current position
  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!drawing.isDrawing || drawing.page === null) return

      // Get position relative to the page element
      // We need to find the page element to get correct coordinates
      const pageElement = document.querySelector(`[data-page-number="${drawing.page}"]`)
      if (!pageElement) return

      const rect = pageElement.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top

      setDrawing((prev) => ({
        ...prev,
        currentPoint: { x, y },
      }))
    },
    [drawing.isDrawing, drawing.page]
  )

  // Handle pointer up - complete or cancel drawing
  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!drawing.isDrawing || !drawing.startPoint || !drawing.page) {
        return
      }

      // Release pointer capture
      ;(e.target as HTMLElement).releasePointerCapture?.(e.pointerId)

      // Get final position
      const pageElement = document.querySelector(`[data-page-number="${drawing.page}"]`)
      if (!pageElement) {
        setDrawing({
          isDrawing: false,
          startPoint: null,
          currentPoint: null,
          page: null,
        })
        setCurrentRect(null)
        return
      }

      const rect = pageElement.getBoundingClientRect()
      const endX = e.clientX - rect.left
      const endY = e.clientY - rect.top

      // Calculate pixel dimensions
      const pixelWidth = Math.abs(endX - drawing.startPoint.x)
      const pixelHeight = Math.abs(endY - drawing.startPoint.y)

      // Check minimum size
      if (pixelWidth < minSize || pixelHeight < minSize) {
        // Too small - cancel
        onDrawCancel?.()
        setDrawing({
          isDrawing: false,
          startPoint: null,
          currentPoint: null,
          page: null,
        })
        setCurrentRect(null)
        return
      }

      // Calculate normalized rect
      const normalizedRect = calculateNormalizedRect(
        drawing.startPoint,
        { x: endX, y: endY },
        drawing.page
      )

      if (normalizedRect) {
        // Generate deterministic ID
        const regionId = generateRegionId(drawing.page, normalizedRect)
        // Call completion handler
        onRectComplete(drawing.page, normalizedRect, regionId)
      }

      // Reset drawing state
      setDrawing({
        isDrawing: false,
        startPoint: null,
        currentPoint: null,
        page: null,
      })
      setCurrentRect(null)
    },
    [drawing, minSize, calculateNormalizedRect, onRectComplete, onDrawCancel]
  )

  // Cancel drawing (e.g., on Escape key)
  const cancelDrawing = useCallback(() => {
    setDrawing({
      isDrawing: false,
      startPoint: null,
      currentPoint: null,
      page: null,
    })
    setCurrentRect(null)
    onDrawCancel?.()
  }, [onDrawCancel])

  // Update current rect preview during drawing
  useEffect(() => {
    if (drawing.isDrawing && drawing.startPoint && drawing.currentPoint && drawing.page) {
      const rect = calculateNormalizedRect(
        drawing.startPoint,
        drawing.currentPoint,
        drawing.page
      )
      setCurrentRect(rect)
    } else {
      setCurrentRect(null)
    }
  }, [drawing, calculateNormalizedRect])

  // Handle Escape key to cancel drawing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && drawing.isDrawing) {
        cancelDrawing()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [drawing.isDrawing, cancelDrawing])

  return {
    drawing,
    currentRect,
    pageDimensionsRef,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    cancelDrawing,
  }
}
