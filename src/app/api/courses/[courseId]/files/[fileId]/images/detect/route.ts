import { NextRequest } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { successResponse, errors } from '@/lib/api-response'
import { isFeatureEnabled } from '@/lib/feature-flags'
import { extractSinglePageImages } from '@/lib/pdf/image-extractor'
import type { PdfType } from '@/lib/supabase/db'

interface RouteParams {
  params: Promise<{ courseId: string; fileId: string }>
}

interface DetectRequestBody {
  page: number
  clickX: number
  clickY: number
}

interface NormalizedRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Check if a click point falls within a rectangle
 */
function isPointInRect(
  clickX: number,
  clickY: number,
  rect: NormalizedRect
): boolean {
  return (
    clickX >= rect.x &&
    clickX <= rect.x + rect.width &&
    clickY >= rect.y &&
    clickY <= rect.y + rect.height
  )
}

/**
 * POST /api/courses/:courseId/files/:fileId/images/detect - Detect image at click position
 *
 * Body:
 * - page: number - Page number (1-indexed)
 * - clickX: number - Normalized X position (0-1)
 * - clickY: number - Normalized Y position (0-1)
 *
 * Returns the detected image if found at the click position, and saves it to the database.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { fileId } = await params

    // Check feature flag
    if (!isFeatureEnabled('AUTO_IMAGE_DETECTION')) {
      return errors.invalidInput('Auto image detection is not enabled')
    }

    const supabase = createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return errors.unauthorized()
    }

    // Parse request body
    const body: DetectRequestBody = await request.json()
    const { page, clickX, clickY } = body

    // Validate inputs
    if (typeof page !== 'number' || page < 1) {
      return errors.invalidInput('Page must be a positive integer')
    }

    if (typeof clickX !== 'number' || clickX < 0 || clickX > 1) {
      return errors.invalidInput('clickX must be a number between 0 and 1')
    }

    if (typeof clickY !== 'number' || clickY < 0 || clickY > 1) {
      return errors.invalidInput('clickY must be a number between 0 and 1')
    }

    // Verify file belongs to user
    const { data: file, error: fileError } = await supabase
      .from('files')
      .select('id, pdf_content_hash, page_count, storage_key, type')
      .eq('id', fileId)
      .eq('user_id', user.id)
      .single()

    if (fileError || !file) {
      return errors.notFound('File')
    }

    if (page > file.page_count) {
      return errors.invalidInput(`Page must be between 1 and ${file.page_count}`)
    }

    const adminSupabase = createAdminClient()

    // Download PDF from storage
    const { data: pdfData, error: downloadError } = await adminSupabase.storage
      .from('course-files')
      .download(file.storage_key)

    if (downloadError || !pdfData) {
      console.error('[Detect API] Failed to download PDF:', downloadError)
      return errors.internalError()
    }

    // Convert to buffer
    const pdfBuffer = Buffer.from(await pdfData.arrayBuffer())

    // Determine PDF type
    const pdfType: PdfType = file.type === 'Lecture' ? 'ppt' : 'textbook'

    // Extract images from the page WITHOUT filtering
    // This allows detecting images that were previously filtered out (small images, banners, etc.)
    const pageResult = await extractSinglePageImages(pdfBuffer, page, pdfType, true)

    console.log('[Detect API] Extraction result:', {
      page,
      clickX,
      clickY,
      imagesFound: pageResult.images.length,
    })

    // Find all images that contain the click point
    const matchingImages = pageResult.images.filter(image =>
      isPointInRect(clickX, clickY, image)
    )

    // If multiple images overlap at click position, select the smallest one
    // (most likely the image user intended to click)
    const foundImage = matchingImages.length > 0
      ? matchingImages.reduce((smallest, current) => {
          const smallestArea = smallest.width * smallest.height
          const currentArea = current.width * current.height
          return currentArea < smallestArea ? current : smallest
        })
      : null

    if (!foundImage) {
      // No image found at click position
      return successResponse({
        found: false,
        page,
      })
    }

    // Image found - save to detected_images table
    if (file.pdf_content_hash) {
      // Get the max image_index for this page to assign the next index
      const { data: existingImages } = await adminSupabase
        .from('detected_images')
        .select('image_index')
        .eq('pdf_hash', file.pdf_content_hash)
        .eq('page', page)
        .order('image_index', { ascending: false })
        .limit(1)

      const nextIndex = existingImages?.[0]?.image_index != null
        ? existingImages[0].image_index + 1
        : 0

      // Check if this exact rect already exists (avoid duplicates)
      const { data: duplicateCheck } = await adminSupabase
        .from('detected_images')
        .select('id')
        .eq('pdf_hash', file.pdf_content_hash)
        .eq('page', page)
        .eq('rect', foundImage)
        .limit(1)

      let savedImageId: string | null = null

      if (!duplicateCheck || duplicateCheck.length === 0) {
        // Insert new detected image
        const { data: inserted, error: insertError } = await adminSupabase
          .from('detected_images')
          .insert({
            pdf_hash: file.pdf_content_hash,
            page,
            image_index: nextIndex,
            rect: foundImage,
            detection_method: 'manual',
            pdf_type: pdfType,
          })
          .select('id')
          .single()

        if (insertError) {
          console.error('[Detect API] Error saving detected image:', insertError)
          // Still return success - we found the image, just couldn't persist it
        } else {
          savedImageId = inserted.id
          console.log('[Detect API] Saved detected image:', {
            id: savedImageId,
            page,
            rect: foundImage,
          })
        }
      } else {
        savedImageId = duplicateCheck[0].id
        console.log('[Detect API] Image already exists:', savedImageId)
      }

      return successResponse({
        found: true,
        image: {
          id: savedImageId,
          rect: foundImage,
        },
        page,
      })
    }

    // No pdf_content_hash - return result without saving
    return successResponse({
      found: true,
      image: {
        rect: foundImage,
      },
      page,
    })
  } catch (error) {
    console.error('[Detect API] Error:', error)
    return errors.internalError()
  }
}
