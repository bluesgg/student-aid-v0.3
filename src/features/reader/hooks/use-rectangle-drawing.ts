'use client'

/**
 * Hook for drawing rectangular selections on PDF pages.
 * Handles pointer events and converts coordinates to normalized format.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { type NormalizedRect, generateRegionId, clampRect } from '@/lib/stickers/selection-hash'
import { debugLog } from '@/lib/debug'

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

  // DEBUG: Track hook initialization
  useEffect(() => {
    debugLog('[useRectangleDrawing DEBUG] Hook initialized/options changed', {
      enabled,
      minSize,
    })
  }, [enabled, minSize])

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
      debugLog('[useRectangleDrawing DEBUG] handlePointerDown called', {
        enabled,
        button: e.button,
        page,
      })

      if (!enabled) return

      // Only handle left mouse button or touch
      if (e.button !== 0) return

      // Prevent text selection while drawing
      e.preventDefault()

      // Find the actual page element with data-page-number attribute
      // This ensures consistent coordinate system across all events
      const pageElement = (e.currentTarget as HTMLElement).querySelector(`[data-page-number="${page}"]`) || e.currentTarget
      const rect = pageElement.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top

      debugLog('[useRectangleDrawing DEBUG] Starting drawing', {
        page,
        startX: x,
        startY: y,
        pageWidth: rect.width,
        pageHeight: rect.height,
      })

      // Update page dimensions for accurate normalization
      pageDimensionsRef.current.set(page, { width: rect.width, height: rect.height })

      setDrawing({
        isDrawing: true,
        startPoint: { x, y },
        currentPoint: { x, y },
        page,
      })

        // Capture pointer to receive events even if mouse leaves element
        ; (e.target as HTMLElement).setPointerCapture?.(e.pointerId)
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

      // Note: Reduced logging to avoid console spam during mouse move
      // Uncomment for detailed tracking:
      // console.log('[useRectangleDrawing DEBUG] handlePointerMove', { x, y })

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
      debugLog('[useRectangleDrawing DEBUG] handlePointerUp called', {
        isDrawing: drawing.isDrawing,
        hasStartPoint: !!drawing.startPoint,
        page: drawing.page,
      })

      if (!drawing.isDrawing || !drawing.startPoint || !drawing.page) {
        return
      }

      // Release pointer capture
      ; (e.target as HTMLElement).releasePointerCapture?.(e.pointerId)

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
        debugLog('[useRectangleDrawing DEBUG] Rectangle too small, cancelling', {
          pixelWidth,
          pixelHeight,
          minSize,
        })
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

      debugLog('[useRectangleDrawing DEBUG] Rectangle complete', {
        page: drawing.page,
        pixelWidth,
        pixelHeight,
        normalizedRect,
      })

      if (normalizedRect) {
        // Generate deterministic ID
        const regionId = generateRegionId(drawing.page, normalizedRect)
        debugLog('[useRectangleDrawing DEBUG] Calling onRectComplete', {
          page: drawing.page,
          regionId,
          normalizedRect,
        })
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
    debugLog('[useRectangleDrawing DEBUG] cancelDrawing called')
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
    // Note: This effect runs on every drawing state change during mouse move
    // Only log state transitions, not every update
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
