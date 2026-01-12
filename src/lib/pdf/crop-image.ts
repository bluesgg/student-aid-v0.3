/**
 * JPEG crop extraction utility for PDF image regions.
 * Extracts rectangular regions from canvas and encodes as JPEG blobs.
 */

import { type NormalizedRect } from '@/lib/stickers/selection-hash'

/** Default JPEG quality for crop extraction (0.85 = 85%) */
const DEFAULT_JPEG_QUALITY = 0.85

/** MIME type for extracted crops */
const CROP_MIME_TYPE = 'image/jpeg'

/**
 * Convert normalized rect to pixel rect using canvas dimensions.
 * 
 * @param rect - Normalized rect (0..1 coordinates)
 * @param canvasWidth - Canvas width in pixels
 * @param canvasHeight - Canvas height in pixels
 * @returns Pixel rect with absolute coordinates
 */
export function normalizedToPixelRect(
  rect: NormalizedRect,
  canvasWidth: number,
  canvasHeight: number
): { x: number; y: number; width: number; height: number } {
  return {
    x: Math.round(rect.x * canvasWidth),
    y: Math.round(rect.y * canvasHeight),
    width: Math.round(rect.width * canvasWidth),
    height: Math.round(rect.height * canvasHeight),
  }
}

/**
 * Convert pixel rect to normalized rect using canvas dimensions.
 * 
 * @param pixelRect - Pixel rect with absolute coordinates
 * @param canvasWidth - Canvas width in pixels
 * @param canvasHeight - Canvas height in pixels
 * @returns Normalized rect (0..1 coordinates)
 */
export function pixelToNormalizedRect(
  pixelRect: { x: number; y: number; width: number; height: number },
  canvasWidth: number,
  canvasHeight: number
): NormalizedRect {
  return {
    x: pixelRect.x / canvasWidth,
    y: pixelRect.y / canvasHeight,
    width: pixelRect.width / canvasWidth,
    height: pixelRect.height / canvasHeight,
  }
}

/**
 * Extract a rectangular region from a canvas as a JPEG blob.
 * 
 * Uses an offscreen canvas to avoid flickering in the UI.
 * 
 * @param sourceCanvas - The source canvas to crop from
 * @param normalizedRect - Normalized rect (0..1 coordinates relative to canvas)
 * @param quality - JPEG quality (0-1, default 0.85)
 * @returns Promise resolving to JPEG Blob
 * 
 * @throws Error if canvas context cannot be obtained or crop fails
 * 
 * @example
 * ```typescript
 * const blob = await cropPageRegion(canvas, { x: 0.1, y: 0.2, width: 0.5, height: 0.3 })
 * // blob is a JPEG image of the selected region
 * ```
 */
export async function cropPageRegion(
  sourceCanvas: HTMLCanvasElement,
  normalizedRect: NormalizedRect,
  quality: number = DEFAULT_JPEG_QUALITY
): Promise<Blob> {
  const canvasWidth = sourceCanvas.width
  const canvasHeight = sourceCanvas.height

  // Convert normalized rect to pixel coordinates
  const pixelRect = normalizedToPixelRect(normalizedRect, canvasWidth, canvasHeight)

  // Validate dimensions
  if (pixelRect.width <= 0 || pixelRect.height <= 0) {
    throw new Error(`Invalid crop dimensions: ${pixelRect.width}x${pixelRect.height}`)
  }

  // Clamp to canvas bounds
  const clampedX = Math.max(0, pixelRect.x)
  const clampedY = Math.max(0, pixelRect.y)
  const clampedWidth = Math.min(pixelRect.width, canvasWidth - clampedX)
  const clampedHeight = Math.min(pixelRect.height, canvasHeight - clampedY)

  // Create offscreen canvas for the crop
  const offscreenCanvas = document.createElement('canvas')
  offscreenCanvas.width = clampedWidth
  offscreenCanvas.height = clampedHeight

  const ctx = offscreenCanvas.getContext('2d')
  if (!ctx) {
    throw new Error('Failed to get 2D context for crop canvas')
  }

  // Draw the cropped region to the offscreen canvas
  ctx.drawImage(
    sourceCanvas,
    clampedX,
    clampedY,
    clampedWidth,
    clampedHeight,
    0,
    0,
    clampedWidth,
    clampedHeight
  )

  // Convert to JPEG blob
  return new Promise((resolve, reject) => {
    offscreenCanvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob)
        } else {
          reject(new Error('Failed to convert canvas to JPEG blob'))
        }
      },
      CROP_MIME_TYPE,
      quality
    )
  })
}

/**
 * Convert a Blob to base64 string.
 * Useful for sending images in API requests.
 * 
 * @param blob - Blob to convert
 * @returns Promise resolving to base64 string (without data URL prefix)
 */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      // Remove the data URL prefix (e.g., "data:image/jpeg;base64,")
      const base64 = result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/**
 * Estimate the size of a JPEG blob in KB.
 * 
 * @param blob - JPEG blob
 * @returns Size in KB
 */
export function estimateBlobSizeKB(blob: Blob): number {
  return Math.round(blob.size / 1024)
}

/**
 * Check if a crop would be within reasonable size limits.
 * 
 * @param normalizedRect - Normalized rect
 * @param canvasWidth - Canvas width
 * @param canvasHeight - Canvas height
 * @param maxPixels - Maximum pixels (default 4M = 2000x2000)
 * @returns true if within limits
 */
export function isCropWithinLimits(
  normalizedRect: NormalizedRect,
  canvasWidth: number,
  canvasHeight: number,
  maxPixels: number = 4_000_000
): boolean {
  const pixelRect = normalizedToPixelRect(normalizedRect, canvasWidth, canvasHeight)
  const totalPixels = pixelRect.width * pixelRect.height
  return totalPixels <= maxPixels
}
