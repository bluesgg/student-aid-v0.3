import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { successResponse, errors } from '@/lib/api-response'
import { getSignedUrl, deleteFile } from '@/lib/storage'
import { removeCanonicalRef } from '@/lib/stickers/shared-cache'

interface RouteParams {
  params: { courseId: string; fileId: string }
}

/**
 * GET /api/courses/:courseId/files/:fileId - Get file details and download URL
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const supabase = createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return errors.unauthorized()
    }

    const { data: file, error } = await supabase
      .from('files')
      .select('*')
      .eq('id', params.fileId)
      .eq('course_id', params.courseId)
      .eq('user_id', user.id)
      .single()

    if (error || !file) {
      return errors.notFound('File')
    }

    // Generate signed URL for download
    const downloadUrl = await getSignedUrl(supabase, file.storage_key)

    return successResponse({
      id: file.id,
      courseId: file.course_id,
      name: file.name,
      type: file.type,
      pageCount: file.page_count,
      isScanned: file.is_scanned,
      lastReadPage: file.last_read_page,
      uploadedAt: file.uploaded_at,
      downloadUrl,
      imageExtractionStatus: file.image_extraction_status || 'pending',
      imageExtractionProgress: file.image_extraction_progress || 0,
      // Content hash for cache validation (computed during upload)
      contentHash: file.content_hash || null,
    })
  } catch {
    return errors.internalError()
  }
}

/**
 * PATCH /api/courses/:courseId/files/:fileId - Update file (e.g., last read page)
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const supabase = createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return errors.unauthorized()
    }

    const body = await request.json()
    const { lastReadPage } = body

    // Verify file belongs to user
    const { data: existing, error: fetchError } = await supabase
      .from('files')
      .select('id, page_count')
      .eq('id', params.fileId)
      .eq('course_id', params.courseId)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !existing) {
      return errors.notFound('File')
    }

    // Validate lastReadPage
    if (lastReadPage !== undefined) {
      if (
        typeof lastReadPage !== 'number' ||
        lastReadPage < 1 ||
        lastReadPage > existing.page_count
      ) {
        return errors.invalidInput('Invalid page number')
      }
    }

    const { data: file, error } = await supabase
      .from('files')
      .update({ last_read_page: lastReadPage })
      .eq('id', params.fileId)
      .select()
      .single()

    if (error) {
      console.error('Error updating file:', error)
      return errors.internalError()
    }

    return successResponse({
      id: file.id,
      name: file.name,
      type: file.type,
      pageCount: file.page_count,
      isScanned: file.is_scanned,
      lastReadPage: file.last_read_page,
      uploadedAt: file.uploaded_at,
    })
  } catch {
    return errors.internalError()
  }
}

/**
 * DELETE /api/courses/:courseId/files/:fileId - Delete a file and all its AI data
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const supabase = createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return errors.unauthorized()
    }

    // Get file to delete from storage
    const { data: file, error: fetchError } = await supabase
      .from('files')
      .select('id, storage_key')
      .eq('id', params.fileId)
      .eq('course_id', params.courseId)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !file) {
      return errors.notFound('File')
    }

    // Delete from storage
    await deleteFile(supabase, file.storage_key)

    // Remove canonical document reference (triggers reference_count decrement)
    try {
      await removeCanonicalRef(params.fileId)
    } catch (refError) {
      console.error('Error removing canonical ref:', refError)
      // Non-fatal: continue with file deletion
    }

    // Delete from database (cascades to stickers, qa_interactions, summaries)
    const { error } = await supabase
      .from('files')
      .delete()
      .eq('id', params.fileId)

    if (error) {
      console.error('Error deleting file:', error)
      return errors.internalError()
    }

    return successResponse({ message: 'File deleted successfully' })
  } catch {
    return errors.internalError()
  }
}
