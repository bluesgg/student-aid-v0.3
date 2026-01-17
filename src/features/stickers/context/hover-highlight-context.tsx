'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

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
 * PDF region being hovered
 */
interface HoveredPdfRegion {
  page: number
  rect: Rect
}

/**
 * Context value for bidirectional hover highlighting
 */
interface HoverHighlightContextValue {
  /** ID of the sticker being hovered (from sticker panel) */
  hoveredStickerId: string | null
  /** Set the hovered sticker ID */
  setHoveredStickerId: (id: string | null) => void
  /** PDF region being hovered (from PDF viewer) */
  hoveredPdfRegion: HoveredPdfRegion | null
  /** Set the hovered PDF region */
  setHoveredPdfRegion: (region: HoveredPdfRegion | null) => void
  /** Anchor rect of the hovered sticker (for PDF highlighting) */
  hoveredStickerRect: Rect | null
  /** Page of the hovered sticker */
  hoveredStickerPage: number | null
  /** Set the hovered sticker's anchor info */
  setHoveredStickerAnchor: (page: number | null, rect: Rect | null) => void
  /** Sticker IDs that match the hovered PDF region */
  matchingStickers: string[]
  /** Set matching sticker IDs */
  setMatchingStickers: (ids: string[]) => void
}

const HoverHighlightContext = createContext<HoverHighlightContextValue | null>(null)

/**
 * Provider for bidirectional hover highlight state
 */
export function HoverHighlightProvider({ children }: { children: ReactNode }) {
  // Sticker hover state (for PDF highlighting)
  const [hoveredStickerId, setHoveredStickerId] = useState<string | null>(null)
  const [hoveredStickerRect, setHoveredStickerRect] = useState<Rect | null>(null)
  const [hoveredStickerPage, setHoveredStickerPage] = useState<number | null>(null)

  // PDF region hover state (for sticker highlighting)
  const [hoveredPdfRegion, setHoveredPdfRegion] = useState<HoveredPdfRegion | null>(null)
  const [matchingStickers, setMatchingStickers] = useState<string[]>([])

  // Combined setter for sticker anchor info
  const setHoveredStickerAnchor = useCallback((page: number | null, rect: Rect | null) => {
    setHoveredStickerPage(page)
    setHoveredStickerRect(rect)
  }, [])

  const value: HoverHighlightContextValue = {
    hoveredStickerId,
    setHoveredStickerId,
    hoveredPdfRegion,
    setHoveredPdfRegion,
    hoveredStickerRect,
    hoveredStickerPage,
    setHoveredStickerAnchor,
    matchingStickers,
    setMatchingStickers,
  }

  return (
    <HoverHighlightContext.Provider value={value}>
      {children}
    </HoverHighlightContext.Provider>
  )
}

/**
 * Hook to access hover highlight context
 */
export function useHoverHighlight() {
  const context = useContext(HoverHighlightContext)
  if (!context) {
    throw new Error('useHoverHighlight must be used within a HoverHighlightProvider')
  }
  return context
}

/**
 * Hook to check if a sticker should be highlighted (from PDF region hover)
 */
export function useStickerHighlighted(stickerId: string) {
  const context = useContext(HoverHighlightContext)
  if (!context) return false
  return context.matchingStickers.includes(stickerId)
}
