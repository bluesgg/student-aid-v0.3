/**
 * Extended anchor types for sticker binding.
 * Supports multi-anchor stickers for image region selection while maintaining
 * backward compatibility with legacy single-anchor format.
 */

import { type NormalizedRect } from '@/lib/stickers/selection-hash'

/**
 * Text anchor - binds sticker to a text snippet on a page
 */
export interface TextAnchor {
  kind: 'text'
  page: number
  textSnippet: string
  rect?: NormalizedRect | null
}

/**
 * Image anchor - binds sticker to a selected image region
 * The `id` field is deterministic based on geometry for reliable hover matching.
 */
export interface ImageAnchor {
  kind: 'image'
  /** Deterministic ID: `${page}-${x.toFixed(4)}-${y.toFixed(4)}-${w.toFixed(4)}-${h.toFixed(4)}` */
  id: string
  page: number
  rect: NormalizedRect
  mime: 'image/jpeg'
}

/**
 * Union type for all anchor kinds
 */
export type StickerAnchorItem = TextAnchor | ImageAnchor

/**
 * Extended sticker anchor structure with optional multi-anchor array.
 * 
 * For backward compatibility:
 * - Legacy stickers have only `textSnippet` and optional `rect`
 * - New stickers (with_selected_images) have `anchors` array
 * 
 * @example Legacy format:
 * ```json
 * {
 *   "textSnippet": "Figure 7 shows...",
 *   "rect": { "x": 0.1, "y": 0.2, "width": 0.3, "height": 0.4 }
 * }
 * ```
 * 
 * @example Extended format:
 * ```json
 * {
 *   "textSnippet": "Figure 7 shows...",
 *   "rect": null,
 *   "anchors": [
 *     { "kind": "text", "page": 12, "textSnippet": "as shown in Figure 7", "rect": null },
 *     { "kind": "image", "id": "13-0.1000-0.2000-0.3000-0.4000", "page": 13, "rect": {...}, "mime": "image/jpeg" }
 *   ]
 * }
 * ```
 */
export interface StickerAnchor {
  /** Text snippet for legacy compatibility and display */
  textSnippet: string
  /** Rectangle for legacy compatibility (null for extended format) */
  rect?: NormalizedRect | null
  /** Extended anchors array (optional for backward compat) */
  anchors?: StickerAnchorItem[]
}

/**
 * API response sticker type with extended anchor support
 */
export interface ApiSticker {
  id: string
  type: 'auto' | 'manual'
  page: number
  anchor: StickerAnchor
  parentId: string | null
  contentMarkdown: string
  folded: boolean
  depth: number
  createdAt: string
}

// ==================== Type Guards ====================

/**
 * Type guard for TextAnchor
 */
export function isTextAnchor(anchor: StickerAnchorItem): anchor is TextAnchor {
  return anchor.kind === 'text'
}

/**
 * Type guard for ImageAnchor
 */
export function isImageAnchor(anchor: StickerAnchorItem): anchor is ImageAnchor {
  return anchor.kind === 'image'
}

// ==================== Helper Functions ====================

/**
 * Get anchors array from a sticker anchor, handling both legacy and extended formats.
 * 
 * For legacy format (no `anchors` array), constructs a TextAnchor from the root fields.
 * For extended format, returns the `anchors` array directly.
 * 
 * @param anchor - Sticker anchor (may be legacy or extended format)
 * @param defaultPage - Default page number for legacy format
 * @returns Array of anchor items
 * 
 * @example
 * ```typescript
 * // Legacy sticker
 * const anchors = getAnchors({ textSnippet: "Hello", rect: null }, 1)
 * // Returns: [{ kind: 'text', page: 1, textSnippet: 'Hello', rect: null }]
 * 
 * // Extended sticker
 * const anchors = getAnchors({ textSnippet: "Hello", anchors: [...] }, 1)
 * // Returns: [...] (the anchors array)
 * ```
 */
export function getAnchors(anchor: StickerAnchor, defaultPage: number): StickerAnchorItem[] {
  if (anchor.anchors && anchor.anchors.length > 0) {
    return anchor.anchors
  }
  
  // Legacy fallback - construct TextAnchor from root fields
  return [{
    kind: 'text',
    page: defaultPage,
    textSnippet: anchor.textSnippet,
    rect: anchor.rect || null,
  }]
}

/**
 * Get only TextAnchor items from a sticker's anchors.
 * 
 * @param anchor - Sticker anchor
 * @param defaultPage - Default page for legacy format
 * @returns Array of TextAnchor items
 */
export function getTextAnchors(anchor: StickerAnchor, defaultPage: number): TextAnchor[] {
  return getAnchors(anchor, defaultPage).filter(isTextAnchor)
}

/**
 * Get only ImageAnchor items from a sticker's anchors.
 * 
 * @param anchor - Sticker anchor
 * @param defaultPage - Default page for legacy format
 * @returns Array of ImageAnchor items
 */
export function getImageAnchors(anchor: StickerAnchor, defaultPage: number): ImageAnchor[] {
  return getAnchors(anchor, defaultPage).filter(isImageAnchor)
}

/**
 * Get all image region IDs from a sticker's anchors.
 * Useful for hover highlighting.
 * 
 * @param anchor - Sticker anchor
 * @param defaultPage - Default page for legacy format
 * @returns Array of region ID strings
 */
export function getImageRegionIds(anchor: StickerAnchor, defaultPage: number): string[] {
  return getImageAnchors(anchor, defaultPage).map(a => a.id)
}

/**
 * Check if a sticker has any image anchors.
 * 
 * @param anchor - Sticker anchor
 * @returns true if sticker has at least one ImageAnchor
 */
export function hasImageAnchors(anchor: StickerAnchor): boolean {
  return anchor.anchors?.some(a => a.kind === 'image') ?? false
}

/**
 * Build an extended anchor structure for with_selected_images mode.
 * 
 * @param textAnchor - Text anchor for reference context
 * @param imageAnchors - Image anchors for selected regions
 * @returns Complete StickerAnchor structure
 */
export function buildExtendedAnchor(
  textAnchor: TextAnchor | null,
  imageAnchors: ImageAnchor[]
): StickerAnchor {
  const anchors: StickerAnchorItem[] = []
  
  if (textAnchor) {
    anchors.push(textAnchor)
  }
  
  anchors.push(...imageAnchors)
  
  // Use first text anchor's snippet for backward compat, or fallback
  const textSnippet = textAnchor?.textSnippet || 
    (imageAnchors.length > 0 ? 'Selected image regions' : 'Explanation')
  
  return {
    textSnippet,
    rect: null,
    anchors,
  }
}
