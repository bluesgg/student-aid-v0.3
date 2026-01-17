/**
 * Image extraction trigger functions.
 * Handles extracting image positions when a PDF is uploaded.
 *
 * Strategy:
 * - ≤50 pages: Extract all on upload, status = 'complete'
 * - >50 pages: Extract first 50 on upload, then background extract remaining
 *              Progress updates every 10 pages
 */

import { createAdminClient } from '@/lib/supabase/server'
import { extractPdfImages } from '@/lib/pdf/image-extractor'
import { isFeatureEnabled } from '@/lib/feature-flags'
import type { ImageExtractionStatus, PdfType } from '@/lib/supabase/db'

/** Maximum pages to extract on upload */
const UPLOAD_EXTRACTION_THRESHOLD = 50

/** Progress update interval for background extraction */
const PROGRESS_UPDATE_INTERVAL = 10

export interface ImageExtractionResult {
  cached: boolean
  status: ImageExtractionStatus
  imagesFound: number
  pagesProcessed: number
  totalPages: number
  pdfType: PdfType | null
}

/**
 * Check if images already exist for a PDF hash
 */
export async function checkImagesExist(pdfHash: string): Promise<{
  exists: boolean
  count: number
}> {
  const supabase = createAdminClient()

  const { count, error } = await supabase
    .from('detected_images')
    .select('id', { count: 'exact', head: true })
    .eq('pdf_hash', pdfHash)

  if (error) {
    console.error('[ImageExtract] Error checking image existence:', error)
    return { exists: false, count: 0 }
  }

  return {
    exists: (count || 0) > 0,
    count: count || 0,
  }
}

/**
 * Store detected images in database
 */
async function storeDetectedImages(
  pdfHash: string,
  pageResults: Array<{
    page: number
    images: Array<{ x: number; y: number; width: number; height: number }>
    pdfType: 'ppt' | 'textbook' | null
  }>
): Promise<number> {
  const supabase = createAdminClient()

  const imagesToInsert: Array<{
    pdf_hash: string
    page: number
    image_index: number
    rect: { x: number; y: number; width: number; height: number }
    detection_method: 'ops' | 'manual'
    pdf_type: string | null
  }> = []

  for (const pageResult of pageResults) {
    pageResult.images.forEach((rect, index) => {
      imagesToInsert.push({
        pdf_hash: pdfHash,
        page: pageResult.page,
        image_index: index,
        rect,
        detection_method: 'ops',
        pdf_type: pageResult.pdfType,
      })
    })
  }

  if (imagesToInsert.length === 0) {
    return 0
  }

  // Use upsert to handle duplicates (in case of re-extraction)
  const { error } = await supabase
    .from('detected_images')
    .upsert(imagesToInsert, {
      onConflict: 'pdf_hash,page,image_index',
      ignoreDuplicates: true,
    })

  if (error) {
    console.error('[ImageExtract] Error storing images:', error)
    throw new Error('Failed to store detected images')
  }

  return imagesToInsert.length
}

/**
 * Update file's image extraction status
 */
async function updateFileExtractionStatus(
  fileId: string,
  status: ImageExtractionStatus,
  progress: number
): Promise<void> {
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('files')
    .update({
      image_extraction_status: status,
      image_extraction_progress: progress,
    })
    .eq('id', fileId)

  if (error) {
    console.error('[ImageExtract] Error updating file status:', error)
  }
}

/**
 * Trigger image extraction for a PDF.
 * Called during PDF upload to extract image positions.
 *
 * Strategy:
 * - ≤50 pages: Extract all pages, status = 'complete'
 * - >50 pages: Extract first 50 pages, then start background extraction
 */
export async function triggerImageExtraction(params: {
  fileId: string
  pdfHash: string
  pdfBuffer: Buffer
  totalPages: number
}): Promise<ImageExtractionResult> {
  const { fileId, pdfHash, pdfBuffer, totalPages } = params

  // Check feature flag
  const featureEnabled = isFeatureEnabled('AUTO_IMAGE_DETECTION')
  console.log('[ImageExtract] Feature flag check at upload:', {
    ENABLE_AUTO_IMAGE_DETECTION: process.env.ENABLE_AUTO_IMAGE_DETECTION,
    featureEnabled,
    fileId,
  })

  if (!featureEnabled) {
    return {
      cached: false,
      status: 'pending',
      imagesFound: 0,
      pagesProcessed: 0,
      totalPages,
      pdfType: null,
    }
  }

  try {
    // Step 1: Check if images already exist for this PDF hash
    const { exists, count } = await checkImagesExist(pdfHash)

    if (exists) {
      // Images already extracted by another user - cache hit
      await updateFileExtractionStatus(fileId, 'complete', totalPages)

      return {
        cached: true,
        status: 'complete',
        imagesFound: count,
        pagesProcessed: totalPages,
        totalPages,
        pdfType: null, // Unknown from cache
      }
    }

    // Step 2: Extract images with 50-page threshold
    const maxPages = Math.min(UPLOAD_EXTRACTION_THRESHOLD, totalPages)

    const { results, pdfType, pagesProcessed } = await extractPdfImages(pdfBuffer, {
      maxPages,
      startPage: 1,
      detectType: true,
    })

    // Step 3: Store detected images
    const imagesStored = await storeDetectedImages(pdfHash, results)

    // Step 4: Determine if background extraction is needed
    const needsBackgroundExtraction = totalPages > UPLOAD_EXTRACTION_THRESHOLD

    // Step 5: Update file extraction status
    const initialStatus: ImageExtractionStatus = needsBackgroundExtraction ? 'partial' : 'complete'
    await updateFileExtractionStatus(fileId, initialStatus, pagesProcessed)

    console.log('[ImageExtract] Initial extraction complete:', {
      fileId,
      pdfHash: pdfHash.substring(0, 8),
      imagesFound: imagesStored,
      pagesProcessed,
      totalPages,
      status: initialStatus,
      pdfType,
      needsBackgroundExtraction,
    })

    // Step 6: If more pages remain, trigger background extraction (non-blocking)
    if (needsBackgroundExtraction) {
      // Fire and forget - background extraction runs independently
      runBackgroundExtraction({
        fileId,
        pdfHash,
        pdfBuffer,
        totalPages,
        startPage: UPLOAD_EXTRACTION_THRESHOLD + 1,
        pdfType,
      }).catch((err) => {
        console.error('[ImageExtract] Background extraction error:', err)
      })
    }

    return {
      cached: false,
      status: initialStatus,
      imagesFound: imagesStored,
      pagesProcessed,
      totalPages,
      pdfType,
    }
  } catch (error) {
    console.error('[ImageExtract] Extraction failed:', error)

    // Mark as failed
    await updateFileExtractionStatus(fileId, 'failed', 0)

    return {
      cached: false,
      status: 'failed',
      imagesFound: 0,
      pagesProcessed: 0,
      totalPages,
      pdfType: null,
    }
  }
}

/**
 * Background extraction for pages beyond the initial threshold.
 * Updates progress every 10 pages for UI feedback.
 */
async function runBackgroundExtraction(params: {
  fileId: string
  pdfHash: string
  pdfBuffer: Buffer
  totalPages: number
  startPage: number
  pdfType: PdfType
}): Promise<void> {
  const { fileId, pdfHash, pdfBuffer, totalPages, startPage, pdfType } = params

  console.log('[ImageExtract] Starting background extraction:', {
    fileId,
    startPage,
    totalPages,
  })

  let currentProgress = startPage - 1
  let totalImagesStored = 0

  try {
    // Process remaining pages in batches of 10
    for (let batchStart = startPage; batchStart <= totalPages; batchStart += PROGRESS_UPDATE_INTERVAL) {
      const batchEnd = Math.min(batchStart + PROGRESS_UPDATE_INTERVAL - 1, totalPages)
      const batchSize = batchEnd - batchStart + 1

      // Extract this batch
      const { results } = await extractPdfImages(pdfBuffer, {
        startPage: batchStart,
        maxPages: batchSize,
        detectType: false,
        pdfType,
      })

      // Store detected images
      const imagesStored = await storeDetectedImages(pdfHash, results)
      totalImagesStored += imagesStored
      currentProgress = batchEnd

      // Update progress every batch (every 10 pages)
      const isComplete = currentProgress >= totalPages
      const status: ImageExtractionStatus = isComplete ? 'complete' : 'partial'
      await updateFileExtractionStatus(fileId, status, currentProgress)

      console.log('[ImageExtract] Background batch complete:', {
        fileId,
        batchStart,
        batchEnd,
        imagesInBatch: imagesStored,
        progress: `${currentProgress}/${totalPages}`,
        status,
      })
    }

    console.log('[ImageExtract] Background extraction finished:', {
      fileId,
      totalPages,
      totalImagesStored,
    })
  } catch (error) {
    console.error('[ImageExtract] Background extraction failed:', {
      fileId,
      currentProgress,
      error,
    })

    // Mark as failed but keep existing progress
    await updateFileExtractionStatus(fileId, 'failed', currentProgress)
  }
}

/**
 * Extract images from a single page (lazy extraction fallback).
 * Used when viewing pages that background extraction hasn't reached yet.
 *
 * Note: Does NOT update file progress - progress is managed by background extraction only.
 * This is a fallback to ensure users can still see images even if background extraction
 * is still running or failed.
 */
export async function extractSinglePage(params: {
  fileId: string
  pdfHash: string
  pdfBuffer: Buffer
  pageNumber: number
  pdfType: PdfType
}): Promise<{
  images: Array<{ x: number; y: number; width: number; height: number }>
  stored: number
}> {
  const { pdfHash, pdfBuffer, pageNumber, pdfType } = params

  // Check feature flag
  if (!isFeatureEnabled('AUTO_IMAGE_DETECTION')) {
    return { images: [], stored: 0 }
  }

  const { extractSinglePageImages } = await import('@/lib/pdf/image-extractor')

  const result = await extractSinglePageImages(pdfBuffer, pageNumber, pdfType)

  // Store in database (will be ignored if already exists due to upsert)
  const stored = await storeDetectedImages(pdfHash, [result])

  // Note: Progress NOT updated here - managed by background extraction

  return {
    images: result.images,
    stored,
  }
}

/**
 * Get detected images for a specific page
 */
export async function getDetectedImages(
  pdfHash: string,
  page: number
): Promise<Array<{
  id: string
  image_index: number
  rect: { x: number; y: number; width: number; height: number }
}>> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('detected_images')
    .select('id, image_index, rect')
    .eq('pdf_hash', pdfHash)
    .eq('page', page)
    .order('image_index', { ascending: true })

  if (error) {
    console.error('[ImageExtract] Error fetching images:', error)
    return []
  }

  return data || []
}

/**
 * Get image extraction status for a file
 */
export async function getImageExtractionStatus(fileId: string): Promise<{
  status: ImageExtractionStatus
  progress: number
  totalPages: number
}> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('files')
    .select('image_extraction_status, image_extraction_progress, page_count')
    .eq('id', fileId)
    .single()

  if (error || !data) {
    return {
      status: 'pending',
      progress: 0,
      totalPages: 0,
    }
  }

  return {
    status: (data.image_extraction_status as ImageExtractionStatus) || 'pending',
    progress: data.image_extraction_progress || 0,
    totalPages: data.page_count,
  }
}
