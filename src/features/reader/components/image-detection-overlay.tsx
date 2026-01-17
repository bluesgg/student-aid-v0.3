'use client'

/**
 * Image Detection Overlay Component
 * Renders hover highlights on auto-detected images in PDF pages.
 * Images are always highlighted on hover (no mode toggle required).
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import type { DetectedImageRect } from '../hooks/use-image-detection'

// ==================== Types ====================

export interface ImageDetectionOverlayProps {
  /** Detected images for current page */
  images: DetectedImageRect[]
  /** Page width in pixels */
  pageWidth: number
  /** Page height in pixels */
  pageHeight: number
  /** Show highlight feedback (highlights all images briefly) */
  showHighlightFeedback: boolean
}

// ==================== Styles ====================

const HIGHLIGHT_COLORS = {
  hover: {
    border: 'border-blue-500',
    bg: 'bg-blue-500/10',
  },
  feedback: {
    border: 'border-blue-500 border-dashed',
    bg: 'bg-blue-500/15',
  },
}

// ==================== Component ====================

export function ImageDetectionOverlay({
  images,
  pageWidth,
  pageHeight,
  showHighlightFeedback,
}: ImageDetectionOverlayProps) {
  const [hoveredImageId, setHoveredImageId] = useState<string | null>(null)

  const handleMouseEnter = useCallback((imageId: string) => {
    setHoveredImageId(imageId)
  }, [])

  const handleMouseLeave = useCallback(() => {
    setHoveredImageId(null)
  }, [])

  if (images.length === 0) {
    return null
  }

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-visible"
      style={{ width: pageWidth, height: pageHeight, zIndex: 10 }}
    >
      {images.map((image) => {
        const isHovered = hoveredImageId === image.id
        const showHighlight = isHovered || showHighlightFeedback

        // Determine colors based on state
        const colors = showHighlightFeedback ? HIGHLIGHT_COLORS.feedback : HIGHLIGHT_COLORS.hover

        // Convert normalized rect to percentage coordinates
        const style = {
          left: `${image.rect.x * 100}%`,
          top: `${image.rect.y * 100}%`,
          width: `${image.rect.width * 100}%`,
          height: `${image.rect.height * 100}%`,
        }

        return (
          <div
            key={image.id}
            className={`pointer-events-auto absolute transition-all duration-150 ${
              showHighlight ? `border-2 ${colors.border} ${colors.bg}` : ''
            }`}
            style={style}
            data-image-id={image.id}
            data-image-index={image.imageIndex}
            onMouseEnter={() => handleMouseEnter(image.id)}
            onMouseLeave={handleMouseLeave}
          >
            {/* Image index indicator (only on hover) */}
            {isHovered && !showHighlightFeedback && (
              <div className="absolute -bottom-1 -right-1 rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-medium text-white shadow">
                {image.imageIndex + 1}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ==================== Helper Component: Extraction Status Indicator ====================

interface ExtractionStatusIndicatorProps {
  status: 'pending' | 'partial' | 'complete' | 'failed'
  progress: number
  totalPages: number
}

/**
 * Small indicator showing image extraction progress for large PDFs.
 * Shown in toolbar when extraction is partial.
 */
export function ExtractionStatusIndicator({
  status,
  progress,
  totalPages,
}: ExtractionStatusIndicatorProps) {
  if (status === 'complete' || status === 'pending') {
    return null
  }

  if (status === 'failed') {
    return (
      <div className="flex items-center gap-1.5 text-xs text-destructive">
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <span>Image detection failed</span>
      </div>
    )
  }

  // Partial extraction
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <svg className="h-3.5 w-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" strokeWidth={2} />
        <path
          className="opacity-75"
          strokeLinecap="round"
          strokeWidth={2}
          d="M12 2a10 10 0 0110 10"
        />
      </svg>
      <span>
        Images: {progress}/{totalPages} pages
      </span>
    </div>
  )
}

// ==================== Helper Component: Lazy Extraction Loading ====================

interface LazyExtractionLoadingProps {
  /** Page width in pixels */
  pageWidth: number
  /** Page height in pixels */
  pageHeight: number
}

/**
 * Loading indicator shown when lazy extraction is in progress for the current page.
 * Appears as a subtle overlay on the PDF page while images are being detected.
 */
export function LazyExtractionLoading({
  pageWidth,
  pageHeight,
}: LazyExtractionLoadingProps) {
  return (
    <div
      className="pointer-events-none absolute inset-0 flex items-start justify-center pt-4"
      style={{ width: pageWidth, height: pageHeight }}
    >
      <div className="flex items-center gap-2 rounded-full bg-background/80 px-3 py-1.5 shadow-sm backdrop-blur-sm">
        <svg
          className="h-3.5 w-3.5 animate-spin text-primary"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" strokeWidth={2} />
          <path
            className="opacity-75"
            strokeLinecap="round"
            strokeWidth={2}
            d="M12 2a10 10 0 0110 10"
          />
        </svg>
        <span className="text-xs text-muted-foreground">Detecting images...</span>
      </div>
    </div>
  )
}

// ==================== Helper Component: No Image Detected Popup ====================

export interface NoImageDetectedPopupProps {
  /** Whether the popup is visible */
  isOpen: boolean
  /** Click position (x, y) relative to the container */
  position: { x: number; y: number }
  /** Container bounds for positioning */
  containerBounds: { width: number; height: number }
  /** Callback when "Draw manually" is clicked */
  onDrawManually: () => void
  /** Callback when popup is dismissed */
  onDismiss: () => void
  /** Message text (localized) */
  message?: string
  /** Button text (localized) */
  buttonText?: string
}

/**
 * Popup shown when user clicks in mark mode but no image is detected.
 * Positioned near the click location with animation.
 */
export function NoImageDetectedPopup({
  isOpen,
  position,
  containerBounds,
  onDrawManually,
  onDismiss,
  message = 'No image detected at this position',
  buttonText = 'Draw manually',
}: NoImageDetectedPopupProps) {
  const popupRef = useRef<HTMLDivElement>(null)
  const [isAnimating, setIsAnimating] = useState(false)

  // Handle ESC key to dismiss
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onDismiss()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onDismiss])

  // Trigger animation on open
  useEffect(() => {
    if (isOpen) {
      // Small delay to ensure the element is rendered before animating
      requestAnimationFrame(() => {
        setIsAnimating(true)
      })
    } else {
      setIsAnimating(false)
    }
  }, [isOpen])

  // Handle click outside to dismiss
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onDismiss()
      }
    }

    // Delay to avoid immediate dismissal from the triggering click
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 100)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, onDismiss])

  if (!isOpen) return null

  // Calculate popup position, keeping it within container bounds
  const popupWidth = 220
  const popupHeight = 80
  const padding = 16

  let left = position.x - popupWidth / 2
  let top = position.y + 20 // Position below the click point

  // Constrain to container bounds
  if (left < padding) left = padding
  if (left + popupWidth > containerBounds.width - padding) {
    left = containerBounds.width - popupWidth - padding
  }
  if (top + popupHeight > containerBounds.height - padding) {
    top = position.y - popupHeight - 20 // Position above if no room below
  }

  return (
    <div
      ref={popupRef}
      className={`absolute z-50 rounded-lg border border-gray-200 bg-white p-3 shadow-lg transition-all duration-150 ease-out ${
        isAnimating ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
      }`}
      style={{
        left,
        top,
        width: popupWidth,
      }}
    >
      {/* Warning icon + message */}
      <div className="mb-2 flex items-start gap-2">
        <svg
          className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <span className="text-sm text-gray-700">{message}</span>
      </div>

      {/* Draw manually button */}
      <button
        onClick={onDrawManually}
        className="w-full rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
      >
        {buttonText}
      </button>
    </div>
  )
}
