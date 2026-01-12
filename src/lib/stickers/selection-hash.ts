/**
 * Selection hash computation for image region selection caching.
 * Produces a stable hash for cache key based on geometric identity of selected regions.
 */

import { createHash } from 'crypto'
import { PROMPT_VERSION, type StickerLocale, type EffectiveMode } from './shared-cache'

/**
 * Normalized rectangle coordinates (0..1 range relative to page dimensions)
 */
export interface NormalizedRect {
  x: number      // 0..1 (left edge)
  y: number      // 0..1 (top edge)
  width: number  // 0..1 (relative width)
  height: number // 0..1 (relative height)
}

/**
 * Selected image region with page and normalized coordinates
 */
export interface SelectedImageRegion {
  page: number
  rect: NormalizedRect
}

/**
 * Parameters for selection hash computation
 */
export interface SelectionHashParams {
  rootPage: number
  effectiveMode: EffectiveMode
  locale: StickerLocale
  regions: SelectedImageRegion[]
}

/**
 * Precision for coordinate rounding (4 decimal places = 0.0001 precision)
 * This tolerates minor floating-point variance while maintaining ~0.1mm precision on typical PDF pages.
 */
const COORDINATE_PRECISION = 4

/**
 * Round a number to specified decimal places.
 * @param value - Number to round
 * @param decimals - Number of decimal places
 * @returns Rounded number
 */
function roundToDecimals(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals)
  return Math.round(value * factor) / factor
}

/**
 * Normalize a rect by rounding coordinates to fixed precision.
 * This ensures consistent hashing across devices with minor floating-point differences.
 * 
 * @param rect - Rectangle to normalize
 * @returns Normalized rectangle with rounded coordinates
 */
export function normalizeRect(rect: NormalizedRect): NormalizedRect {
  return {
    x: roundToDecimals(rect.x, COORDINATE_PRECISION),
    y: roundToDecimals(rect.y, COORDINATE_PRECISION),
    width: roundToDecimals(rect.width, COORDINATE_PRECISION),
    height: roundToDecimals(rect.height, COORDINATE_PRECISION),
  }
}

/**
 * Normalize a region by rounding its rect coordinates.
 * 
 * @param region - Region to normalize
 * @returns Normalized region
 */
function normalizeRegion(region: SelectedImageRegion): SelectedImageRegion {
  return {
    page: region.page,
    rect: normalizeRect(region.rect),
  }
}

/**
 * Sort regions by (page, x, y, width, height) for consistent ordering.
 * This ensures the same set of regions always produces the same hash.
 * 
 * @param regions - Regions to sort
 * @returns Sorted regions (new array)
 */
function sortRegions(regions: SelectedImageRegion[]): SelectedImageRegion[] {
  return [...regions].sort((a, b) => {
    // Sort by page first
    if (a.page !== b.page) return a.page - b.page
    // Then by x
    if (a.rect.x !== b.rect.x) return a.rect.x - b.rect.x
    // Then by y
    if (a.rect.y !== b.rect.y) return a.rect.y - b.rect.y
    // Then by width
    if (a.rect.width !== b.rect.width) return a.rect.width - b.rect.width
    // Finally by height
    return a.rect.height - b.rect.height
  })
}

/**
 * Compute selection hash for cache key.
 * 
 * The hash is based on geometric identity (page + normalized coordinates),
 * NOT on JPEG bytes. This maximizes cross-user cache hits since the same
 * PDF regions will hash identically regardless of rendering differences.
 * 
 * Algorithm:
 * 1. Normalize all region coordinates to 4 decimal precision
 * 2. Sort regions by (page, x, y, width, height)
 * 3. Build canonical JSON with version, root_page, locale, mode, regions
 * 4. SHA-256 hash the canonical JSON
 * 
 * @param params - Selection hash parameters
 * @returns 64-character lowercase hex hash
 * 
 * @example
 * ```typescript
 * const hash = computeSelectionHash({
 *   rootPage: 12,
 *   effectiveMode: 'with_selected_images',
 *   locale: 'en',
 *   regions: [
 *     { page: 13, rect: { x: 0.1234, y: 0.3300, width: 0.4000, height: 0.2800 } },
 *     { page: 13, rect: { x: 0.6000, y: 0.1200, width: 0.2000, height: 0.2000 } }
 *   ]
 * })
 * // Returns: "a3f8c9d2e4b5..."  (64-char hex)
 * ```
 */
export function computeSelectionHash(params: SelectionHashParams): string {
  const { rootPage, effectiveMode, locale, regions } = params

  // Normalize and sort regions for consistent hashing
  const normalizedRegions = regions.map(normalizeRegion)
  const sortedRegions = sortRegions(normalizedRegions)

  // Build canonical JSON structure
  // Note: Using specific property names and order for stability
  const canonicalData = {
    v: PROMPT_VERSION,
    root_page: rootPage,
    effective_mode: effectiveMode,
    locale: locale,
    regions: sortedRegions.map(r => ({
      page: r.page,
      x: r.rect.x,
      y: r.rect.y,
      w: r.rect.width,
      h: r.rect.height,
    })),
  }

  // Convert to JSON with stable key ordering
  const canonicalJson = JSON.stringify(canonicalData)

  // Compute SHA-256 hash
  const hash = createHash('sha256')
  hash.update(canonicalJson)
  return hash.digest('hex')
}

/**
 * Generate a deterministic region ID from page and rect.
 * Used for reliable hover matching between sticker anchors and UI regions.
 * 
 * Format: `{page}-{x.toFixed(4)}-{y.toFixed(4)}-{width.toFixed(4)}-{height.toFixed(4)}`
 * 
 * @param page - Page number
 * @param rect - Normalized rectangle
 * @returns Deterministic region ID string
 * 
 * @example
 * ```typescript
 * const id = generateRegionId(13, { x: 0.1234, y: 0.33, width: 0.4, height: 0.28 })
 * // Returns: "13-0.1234-0.3300-0.4000-0.2800"
 * ```
 */
export function generateRegionId(page: number, rect: NormalizedRect): string {
  const normalizedRect = normalizeRect(rect)
  return `${page}-${normalizedRect.x.toFixed(COORDINATE_PRECISION)}-${normalizedRect.y.toFixed(COORDINATE_PRECISION)}-${normalizedRect.width.toFixed(COORDINATE_PRECISION)}-${normalizedRect.height.toFixed(COORDINATE_PRECISION)}`
}

/**
 * Parse a region ID back into page and rect.
 * Inverse of generateRegionId.
 * 
 * @param regionId - Region ID string
 * @returns Parsed page and rect, or null if invalid format
 */
export function parseRegionId(regionId: string): { page: number; rect: NormalizedRect } | null {
  const parts = regionId.split('-')
  if (parts.length !== 5) return null

  const [pageStr, xStr, yStr, wStr, hStr] = parts
  const page = parseInt(pageStr, 10)
  const x = parseFloat(xStr)
  const y = parseFloat(yStr)
  const width = parseFloat(wStr)
  const height = parseFloat(hStr)

  if (isNaN(page) || isNaN(x) || isNaN(y) || isNaN(width) || isNaN(height)) {
    return null
  }

  return { page, rect: { x, y, width, height } }
}

/**
 * Validate that a rect has valid normalized coordinates.
 * 
 * @param rect - Rectangle to validate
 * @returns true if valid, false otherwise
 */
export function isValidNormalizedRect(rect: NormalizedRect): boolean {
  // Check bounds: 0 <= x, y, x+width, y+height <= 1
  if (rect.x < 0 || rect.x > 1) return false
  if (rect.y < 0 || rect.y > 1) return false
  if (rect.x + rect.width > 1.0001) return false // Small tolerance for floating point
  if (rect.y + rect.height > 1.0001) return false

  // Check positive size
  if (rect.width <= 0 || rect.height <= 0) return false

  return true
}

/**
 * Clamp a rect to valid normalized coordinates (0..1).
 * Useful for handling edge cases in coordinate calculations.
 * 
 * @param rect - Rectangle to clamp
 * @returns Clamped rectangle
 */
export function clampRect(rect: NormalizedRect): NormalizedRect {
  const x = Math.max(0, Math.min(1, rect.x))
  const y = Math.max(0, Math.min(1, rect.y))
  const width = Math.max(0, Math.min(1 - x, rect.width))
  const height = Math.max(0, Math.min(1 - y, rect.height))
  return { x, y, width, height }
}
