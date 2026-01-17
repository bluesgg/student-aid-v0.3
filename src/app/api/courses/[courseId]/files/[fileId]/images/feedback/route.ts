import { NextRequest } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { successResponse, errors } from '@/lib/api-response'
import { isFeatureEnabled } from '@/lib/feature-flags'
import type { ImageFeedbackType } from '@/lib/supabase/db'

interface RouteParams {
  params: Promise<{ courseId: string; fileId: string }>
}

/**
 * POST /api/courses/:courseId/files/:fileId/images/feedback - Submit image detection feedback
 *
 * Body:
 * - detectedImageId: string - ID of the detected image (optional for missed_image)
 * - feedbackType: 'wrong_boundary' | 'missed_image' | 'false_positive'
 * - correctRect?: { x, y, width, height } - Correct boundary (for wrong_boundary/missed_image)
 * - page?: number - Page number (required for missed_image)
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
    const body = await request.json()
    const { detectedImageId, feedbackType, correctRect, page } = body as {
      detectedImageId?: string
      feedbackType: ImageFeedbackType
      correctRect?: { x: number; y: number; width: number; height: number }
      page?: number
    }

    // Validate feedback type
    const validTypes: ImageFeedbackType[] = ['wrong_boundary', 'missed_image', 'false_positive']
    if (!feedbackType || !validTypes.includes(feedbackType)) {
      return errors.invalidInput('Invalid feedback type. Must be: wrong_boundary, missed_image, or false_positive')
    }

    // Validate requirements based on feedback type
    if (feedbackType === 'missed_image') {
      if (!correctRect) {
        return errors.invalidInput('correctRect is required for missed_image feedback')
      }
      if (!page) {
        return errors.invalidInput('page is required for missed_image feedback')
      }
    } else {
      if (!detectedImageId) {
        return errors.invalidInput('detectedImageId is required for this feedback type')
      }
    }

    // Verify file belongs to user
    const { data: file, error: fileError } = await supabase
      .from('files')
      .select('id, pdf_content_hash')
      .eq('id', fileId)
      .eq('user_id', user.id)
      .single()

    if (fileError || !file) {
      return errors.notFound('File')
    }

    const adminSupabase = createAdminClient()

    // If detectedImageId provided, verify it exists and belongs to this file
    if (detectedImageId) {
      const { data: detectedImage, error: imageError } = await adminSupabase
        .from('detected_images')
        .select('id, pdf_hash')
        .eq('id', detectedImageId)
        .single()

      if (imageError || !detectedImage) {
        return errors.notFound('Detected image')
      }

      // Verify the image belongs to this file's PDF
      if (detectedImage.pdf_hash !== file.pdf_content_hash) {
        return errors.invalidInput('Image does not belong to this file')
      }
    }

    // Store feedback
    const { data: feedback, error: insertError } = await adminSupabase
      .from('image_feedback')
      .insert({
        detected_image_id: detectedImageId || null,
        user_id: user.id,
        feedback_type: feedbackType,
        correct_rect: correctRect || null,
      })
      .select('id')
      .single()

    if (insertError) {
      console.error('[Feedback API] Error storing feedback:', insertError)
      return errors.internalError()
    }

    // If this is a missed_image feedback, also store it as a manual detection
    if (feedbackType === 'missed_image' && correctRect && page && file.pdf_content_hash) {
      // Get the max image_index for this page
      const { data: existingImages } = await adminSupabase
        .from('detected_images')
        .select('image_index')
        .eq('pdf_hash', file.pdf_content_hash)
        .eq('page', page)
        .order('image_index', { ascending: false })
        .limit(1)

      const nextIndex = existingImages && existingImages.length > 0
        ? existingImages[0].image_index + 1
        : 0

      // Insert as manual detection
      await adminSupabase
        .from('detected_images')
        .insert({
          pdf_hash: file.pdf_content_hash,
          page,
          image_index: nextIndex,
          rect: correctRect,
          detection_method: 'manual',
          pdf_type: null,
        })
    }

    return successResponse({
      feedbackId: feedback.id,
      message: 'Feedback submitted successfully',
    })
  } catch (error) {
    console.error('Error submitting feedback:', error)
    return errors.internalError()
  }
}
