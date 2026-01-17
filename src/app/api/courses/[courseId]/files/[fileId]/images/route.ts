import { NextRequest } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { successResponse, errors } from '@/lib/api-response'
import { isFeatureEnabled } from '@/lib/feature-flags'
import { getDetectedImages, extractSinglePage } from '@/lib/context/image-extraction-trigger'
import type { PdfType } from '@/lib/supabase/db'

interface RouteParams {
  params: Promise<{ courseId: string; fileId: string }>
}

/**
 * GET /api/courses/:courseId/files/:fileId/images - Get detected images for a page
 *
 * Query params:
 * - page: Page number (1-indexed, required)
 *
 * Returns detected images for the specified page if extraction is complete.
 * Also returns extraction status for progress tracking.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { fileId } = await params

    // Check feature flag
    const autoImageDetectionEnabled = isFeatureEnabled('AUTO_IMAGE_DETECTION')
    console.log('[Images API] Feature flag check:', {
      ENABLE_AUTO_IMAGE_DETECTION: process.env.ENABLE_AUTO_IMAGE_DETECTION,
      isEnabled: autoImageDetectionEnabled,
    })

    if (!autoImageDetectionEnabled) {
      return successResponse({
        enabled: false,
        images: [],
        extractionStatus: 'pending',
      })
    }

    const supabase = createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return errors.unauthorized()
    }

    // Verify file belongs to user
    const { data: file, error: fileError } = await supabase
      .from('files')
      .select('id, pdf_content_hash, page_count, storage_key, type, image_extraction_status, image_extraction_progress')
      .eq('id', fileId)
      .eq('user_id', user.id)
      .single()

    if (fileError || !file) {
      return errors.notFound('File')
    }

    // Get page number from query
    const { searchParams } = new URL(request.url)
    const pageParam = searchParams.get('page')

    if (!pageParam) {
      return errors.invalidInput('Page number is required')
    }

    const page = parseInt(pageParam, 10)

    if (isNaN(page) || page < 1 || page > file.page_count) {
      return errors.invalidInput(`Page must be between 1 and ${file.page_count}`)
    }

    // Get extraction status
    const extractionStatus = {
      status: file.image_extraction_status || 'pending',
      progress: file.image_extraction_progress || 0,
      totalPages: file.page_count,
    }

    // If no content hash, extraction hasn't run
    if (!file.pdf_content_hash) {
      return successResponse({
        enabled: true,
        images: [],
        extractionStatus,
        page,
      })
    }

    // Check if this page has been extracted
    const pageExtracted =
      extractionStatus.status === 'complete' ||
      (extractionStatus.status === 'partial' && page <= extractionStatus.progress)

    if (!pageExtracted) {
      // Page not yet extracted - trigger lazy extraction
      try {
        // Download PDF from storage
        const adminSupabase = createAdminClient()
        const { data: pdfData, error: downloadError } = await adminSupabase.storage
          .from('course-files')
          .download(file.storage_key)

        if (downloadError || !pdfData) {
          console.error('[Images API] Failed to download PDF for lazy extraction:', downloadError)
          return successResponse({
            enabled: true,
            images: [],
            extractionStatus,
            page,
            pageExtracted: false,
          })
        }

        // Convert to buffer
        const pdfBuffer = Buffer.from(await pdfData.arrayBuffer())

        // Determine PDF type from file type
        const pdfType: PdfType = file.type === 'Lecture' ? 'ppt' : 'textbook'

        // Extract single page (fallback if background extraction hasn't reached this page)
        const { images: extractedImages } = await extractSinglePage({
          fileId: file.id,
          pdfHash: file.pdf_content_hash,
          pdfBuffer,
          pageNumber: page,
          pdfType,
        })

        // Note: Progress is NOT updated here - it's managed by background extraction
        // This lazy extraction is a fallback only, doesn't affect overall progress tracking

        // Get the stored images (including any that were just extracted)
        const images = await getDetectedImages(file.pdf_content_hash, page)

        return successResponse({
          enabled: true,
          images: images.map((img) => ({
            id: img.id,
            imageIndex: img.image_index,
            rect: img.rect,
            detectionMethod: img.detection_method,
          })),
          extractionStatus,
          page,
          pageExtracted: true,
        })
      } catch (lazyError) {
        console.error('[Images API] Lazy extraction failed:', lazyError)
        // Return without images - client will see pageExtracted: false
        return successResponse({
          enabled: true,
          images: [],
          extractionStatus,
          page,
          pageExtracted: false,
        })
      }
    }

    // Get detected images for this page
    const images = await getDetectedImages(file.pdf_content_hash, page)

    console.log('[Images API] Returning images:', {
      page,
      pdfHash: file.pdf_content_hash?.substring(0, 8),
      imagesFound: images.length,
      extractionStatus,
    })

    return successResponse({
      enabled: true,
      images: images.map((img) => ({
        id: img.id,
        imageIndex: img.image_index,
        rect: img.rect,
        detectionMethod: img.detection_method,
      })),
      extractionStatus,
      page,
      pageExtracted: true,
    })
  } catch (error) {
    console.error('Error fetching detected images:', error)
    return errors.internalError()
  }
}
