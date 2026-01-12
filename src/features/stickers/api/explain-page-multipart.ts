/**
 * Client API for multipart explain-page requests.
 * Sends user-selected image regions for AI explanation.
 */

import { type NormalizedRect, type SelectedImageRegion } from '@/lib/stickers/selection-hash'

// ==================== Types ====================

export interface SelectedRegionWithCrop extends SelectedImageRegion {
  id: string  // Deterministic region ID
  crop?: Blob  // JPEG crop blob (may be missing if extraction failed)
}

export interface ExplainSelectedImagesPayload {
  courseId: string
  fileId: string
  page: number  // Root page (session root)
  pdfType: 'Lecture' | 'Homework' | 'Exam' | 'Other'
  locale: 'en' | 'zh-Hans'
  effectiveMode: 'with_selected_images'
  selectedImageRegions: SelectedImageRegion[]
  textSelection?: {
    page: number
    textSnippet: string
    rect?: NormalizedRect | null
  }
}

export interface ExplainSelectedImagesResponse {
  ok: boolean
  status: 'ready' | 'generating'
  generationId?: string
  stickers?: unknown[]
  quota?: {
    autoExplain: {
      used: number
      limit: number
      resetAt: string
    }
  }
  cached?: boolean
  source?: string
  error?: {
    code: string
    message: string
  }
  pollInterval?: number
}

// ==================== Error Handling ====================

export class MissingCropError extends Error {
  constructor(
    public regionId: string,
    public page: number,
    public totalRegions: number,
    public cachedCrops: number
  ) {
    super(`Missing crop for region ${regionId} on page ${page}`)
    this.name = 'MissingCropError'
  }
}

// ==================== API Client ====================

/**
 * Build FormData for multipart explain-page request.
 * 
 * @param payload - Request payload with regions
 * @param regionCrops - Map of region IDs to JPEG blobs
 * @returns FormData ready to send
 * @throws MissingCropError if any region is missing a crop
 */
export function buildExplainFormData(
  payload: ExplainSelectedImagesPayload,
  regionCrops: Map<string, Blob>
): FormData {
  const formData = new FormData()

  // Build the payload JSON (without crops)
  const payloadJson: ExplainSelectedImagesPayload = {
    courseId: payload.courseId,
    fileId: payload.fileId,
    page: payload.page,
    pdfType: payload.pdfType,
    locale: payload.locale,
    effectiveMode: 'with_selected_images',
    selectedImageRegions: payload.selectedImageRegions,
    textSelection: payload.textSelection,
  }

  formData.append('payload', JSON.stringify(payloadJson))

  // Append image files in order matching selectedImageRegions
  for (let i = 0; i < payload.selectedImageRegions.length; i++) {
    const region = payload.selectedImageRegions[i]
    // Generate the same ID format used in the frontend
    const regionId = `${region.page}-${region.rect.x.toFixed(4)}-${region.rect.y.toFixed(4)}-${region.rect.width.toFixed(4)}-${region.rect.height.toFixed(4)}`
    
    const crop = regionCrops.get(regionId)
    if (!crop) {
      throw new MissingCropError(
        regionId,
        region.page,
        payload.selectedImageRegions.length,
        regionCrops.size
      )
    }

    formData.append(`image_${i}`, crop, `region-${i}.jpg`)
  }

  return formData
}

/**
 * Send multipart explain-page request to the API.
 * 
 * @param payload - Request payload with regions
 * @param regionCrops - Map of region IDs to JPEG blobs
 * @returns API response
 */
export async function explainSelectedImages(
  payload: ExplainSelectedImagesPayload,
  regionCrops: Map<string, Blob>
): Promise<ExplainSelectedImagesResponse> {
  const formData = buildExplainFormData(payload, regionCrops)

  const response = await fetch('/api/ai/explain-page', {
    method: 'POST',
    body: formData,
    // Note: Don't set Content-Type header - browser will set it with boundary
  })

  const data = await response.json()

  if (!response.ok) {
    return {
      ok: false,
      status: 'ready',
      error: {
        code: data.error?.code || 'UNKNOWN_ERROR',
        message: data.error?.message || 'An unexpected error occurred',
      },
    }
  }

  return {
    ok: true,
    status: data.status || 'ready',
    generationId: data.generationId,
    stickers: data.stickers,
    quota: data.quota,
    cached: data.cached,
    source: data.source,
    pollInterval: data.pollInterval,
  }
}

/**
 * Poll for generation status.
 * 
 * @param generationId - Generation ID to poll
 * @returns Status response
 */
export async function pollExplainStatus(
  generationId: string
): Promise<{
  status: 'generating' | 'ready' | 'failed'
  stickers?: unknown[]
  error?: string
  generationTimeMs?: number
}> {
  const response = await fetch(`/api/ai/explain-page/status/${generationId}`)
  const data = await response.json()

  return {
    status: data.status,
    stickers: data.stickers,
    error: data.error,
    generationTimeMs: data.generationTimeMs,
  }
}
