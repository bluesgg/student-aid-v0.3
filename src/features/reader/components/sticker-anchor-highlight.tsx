'use client'

import { useMemo } from 'react'

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

interface StickerAnchorHighlightProps {
  /** Normalized rect (0-1 coordinates) from sticker anchor */
  rect: Rect
  /** Page width in pixels */
  pageWidth: number
  /** Page height in pixels */
  pageHeight: number
  /** Whether this is the highlight from sticker hover (vs PDF region hover) */
  isFromStickerHover?: boolean
}

/**
 * Renders a highlight overlay on the PDF page at the sticker anchor position.
 * Used for bidirectional hover highlighting between sticker cards and PDF regions.
 */
export function StickerAnchorHighlight({
  rect,
  pageWidth,
  pageHeight,
  isFromStickerHover = true,
}: StickerAnchorHighlightProps) {
  // Convert normalized coordinates (0-1) to pixel coordinates
  const pixelRect = useMemo(() => {
    return {
      left: rect.x * pageWidth,
      top: rect.y * pageHeight,
      width: rect.width * pageWidth,
      height: rect.height * pageHeight,
    }
  }, [rect, pageWidth, pageHeight])

  // Styling per design doc:
  // - border: 2px solid #3B82F6
  // - background: rgba(59, 130, 246, 0.1)
  return (
    <div
      className="absolute pointer-events-none transition-opacity duration-200"
      style={{
        left: pixelRect.left,
        top: pixelRect.top,
        width: pixelRect.width,
        height: pixelRect.height,
        border: '2px solid #3B82F6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderRadius: '4px',
        opacity: isFromStickerHover ? 1 : 0.8,
      }}
    />
  )
}
