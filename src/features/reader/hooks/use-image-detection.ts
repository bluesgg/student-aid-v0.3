'use client'

import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { debugLog } from '@/lib/debug'

/**
 * Detection method for an image
 * - 'ops': Automatically detected by the system during PDF upload
 * - 'manual': Manually detected by user clicking in mark mode
 */
export type DetectionMethod = 'ops' | 'manual'

/**
 * Detected image rectangle (normalized 0-1 coordinates)
 */
export interface DetectedImageRect {
  id: string
  imageIndex: number
  rect: {
    x: number
    y: number
    width: number
    height: number
  }
  /** How the image was detected. Manual images can be deleted by users. */
  detectionMethod?: DetectionMethod
}

/**
 * Image extraction status
 */
export interface ImageExtractionStatus {
  status: 'pending' | 'partial' | 'complete' | 'failed'
  progress: number
  totalPages: number
}

/**
 * API response for detected images
 */
interface DetectedImagesResponse {
  enabled: boolean
  images: DetectedImageRect[]
  extractionStatus: ImageExtractionStatus
  page: number
  pageExtracted?: boolean
}

/**
 * Fetch detected images for a specific page
 */
async function fetchDetectedImages(
  courseId: string,
  fileId: string,
  page: number
): Promise<DetectedImagesResponse> {
  const response = await fetch(
    `/api/courses/${courseId}/files/${fileId}/images?page=${page}`
  )

  if (!response.ok) {
    throw new Error('Failed to fetch detected images')
  }

  const json = await response.json()
  return json.data
}

interface UseImageDetectionProps {
  courseId: string
  fileId: string
  page: number
  enabled?: boolean
}

interface UseImageDetectionReturn {
  images: DetectedImageRect[]
  extractionStatus: ImageExtractionStatus | null
  isLoading: boolean
  isEnabled: boolean
  pageExtracted: boolean
  error: Error | null
}

/**
 * Hook to fetch detected images for the current page.
 * Returns normalized image rectangles for rendering overlays.
 */
export function useImageDetection({
  courseId,
  fileId,
  page,
  enabled = true,
}: UseImageDetectionProps): UseImageDetectionReturn {
  const query = useQuery({
    queryKey: ['detected-images', courseId, fileId, page],
    queryFn: () => fetchDetectedImages(courseId, fileId, page),
    enabled: enabled && !!courseId && !!fileId && page > 0,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
    retry: 1,
    // Keep previous data while loading new page to prevent toolbar button text flicker
    placeholderData: keepPreviousData,
  })

  // Debug logging
  if (query.data) {
    debugLog('[useImageDetection] API response:', {
      page,
      enabled: query.data.enabled,
      imagesCount: query.data.images?.length ?? 0,
      extractionStatus: query.data.extractionStatus,
      images: query.data.images,
    })
  }

  return {
    images: query.data?.images ?? [],
    extractionStatus: query.data?.extractionStatus ?? null,
    isLoading: query.isLoading,
    isEnabled: query.data?.enabled ?? false,
    pageExtracted: query.data?.pageExtracted ?? false,
    error: query.error as Error | null,
  }
}

/**
 * Hit test a click position against detected images.
 * Returns the topmost image that contains the click point, or null.
 *
 * @param clickX - Click X position (normalized 0-1)
 * @param clickY - Click Y position (normalized 0-1)
 * @param images - Array of detected images to test
 * @returns The clicked image, or null if no hit
 */
export function hitTestImages(
  clickX: number,
  clickY: number,
  images: DetectedImageRect[]
): DetectedImageRect | null {
  // Test in reverse order (topmost/last-rendered first)
  for (let i = images.length - 1; i >= 0; i--) {
    const img = images[i]
    const { x, y, width, height } = img.rect

    if (
      clickX >= x &&
      clickX <= x + width &&
      clickY >= y &&
      clickY <= y + height
    ) {
      return img
    }
  }

  return null
}

/**
 * Convert page coordinates to normalized 0-1 coordinates.
 *
 * @param pageX - X position relative to page element
 * @param pageY - Y position relative to page element
 * @param pageWidth - Page element width in pixels
 * @param pageHeight - Page element height in pixels
 * @returns Normalized coordinates
 */
export function normalizePageCoordinates(
  pageX: number,
  pageY: number,
  pageWidth: number,
  pageHeight: number
): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(1, pageX / pageWidth)),
    y: Math.max(0, Math.min(1, pageY / pageHeight)),
  }
}

/**
 * Convert normalized coordinates to pixel coordinates.
 *
 * @param rect - Normalized rectangle (0-1)
 * @param pageWidth - Page width in pixels
 * @param pageHeight - Page height in pixels
 * @returns Pixel coordinates
 */
export function denormalizeRect(
  rect: { x: number; y: number; width: number; height: number },
  pageWidth: number,
  pageHeight: number
): { x: number; y: number; width: number; height: number } {
  return {
    x: rect.x * pageWidth,
    y: rect.y * pageHeight,
    width: rect.width * pageWidth,
    height: rect.height * pageHeight,
  }
}

/**
 * Response from the detect API
 */
export interface DetectImageAtPositionResult {
  found: boolean
  image?: {
    id?: string
    rect: { x: number; y: number; width: number; height: number }
  }
  page: number
}

/**
 * Detect if there's an image at the specified click position.
 * Uses the backend image extraction algorithm to check for images.
 *
 * @param courseId - Course ID
 * @param fileId - File ID
 * @param page - Page number (1-indexed)
 * @param clickX - Normalized X position (0-1)
 * @param clickY - Normalized Y position (0-1)
 * @returns Detection result with image rect if found
 */
export async function detectImageAtPosition(
  courseId: string,
  fileId: string,
  page: number,
  clickX: number,
  clickY: number
): Promise<DetectImageAtPositionResult> {
  const response = await fetch(
    `/api/courses/${courseId}/files/${fileId}/images/detect`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page, clickX, clickY }),
    }
  )

  if (!response.ok) {
    throw new Error('Failed to detect image at position')
  }

  const json = await response.json()
  return json.data as DetectImageAtPositionResult
}

/**
 * Delete a manually detected image.
 * Only images with detectionMethod='manual' can be deleted.
 *
 * @param courseId - Course ID
 * @param fileId - File ID
 * @param imageId - ID of the detected image to delete
 * @returns Success status
 */
export async function deleteDetectedImage(
  courseId: string,
  fileId: string,
  imageId: string
): Promise<{ deleted: boolean; imageId: string }> {
  const response = await fetch(
    `/api/courses/${courseId}/files/${fileId}/images/${imageId}`,
    {
      method: 'DELETE',
    }
  )

  if (!response.ok) {
    const json = await response.json()
    throw new Error(json.error?.message || 'Failed to delete detected image')
  }

  const json = await response.json()
  return json.data
}
