import { NextRequest } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { successResponse, errors } from '@/lib/api-response'
import { isFeatureEnabled } from '@/lib/feature-flags'

interface RouteParams {
  params: Promise<{ courseId: string; fileId: string; imageId: string }>
}

/**
 * DELETE /api/courses/:courseId/files/:fileId/images/:imageId - Delete a manually detected image
 *
 * Only images with detection_method='manual' can be deleted.
 * System-detected images (detection_method='ops') cannot be deleted by users.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { fileId, imageId } = await params

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

    // Get the detected image and verify it exists and belongs to this file
    const { data: detectedImage, error: imageError } = await adminSupabase
      .from('detected_images')
      .select('id, pdf_hash, detection_method')
      .eq('id', imageId)
      .single()

    if (imageError || !detectedImage) {
      return errors.notFound('Detected image')
    }

    // Verify the image belongs to this file's PDF
    if (detectedImage.pdf_hash !== file.pdf_content_hash) {
      return errors.invalidInput('Image does not belong to this file')
    }

    // Only allow deletion of manually detected images
    if (detectedImage.detection_method !== 'manual') {
      return errors.invalidInput('Only manually detected images can be deleted. System-detected images cannot be removed.')
    }

    // Delete the image
    const { error: deleteError } = await adminSupabase
      .from('detected_images')
      .delete()
      .eq('id', imageId)

    if (deleteError) {
      console.error('[Delete Image API] Error deleting image:', deleteError)
      return errors.internalError()
    }

    console.log('[Delete Image API] Successfully deleted manual image:', {
      imageId,
      fileId,
    })

    return successResponse({
      deleted: true,
      imageId,
    })
  } catch (error) {
    console.error('[Delete Image API] Error:', error)
    return errors.internalError()
  }
}
