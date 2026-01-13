/**
 * GET /api/context/extraction-status/:fileId
 * Check context extraction status for a file
 */

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { successResponse, errors } from '@/lib/api-response'
import { getExtractionStatus } from '@/lib/context/extraction-trigger'

interface RouteParams {
  params: { fileId: string }
}

/**
 * GET /api/context/extraction-status/:fileId
 * Returns the extraction status for a file
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const supabase = createClient()

    // Verify authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return errors.unauthorized()
    }

    // Verify file exists and get course_id
    const { data: file, error: fileError } = await supabase
      .from('files')
      .select('id, course_id')
      .eq('id', params.fileId)
      .single()

    if (fileError || !file) {
      return errors.notFound('File')
    }

    // Verify course belongs to user
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('id')
      .eq('id', file.course_id)
      .eq('user_id', user.id)
      .single()

    if (courseError || !course) {
      return errors.forbidden('You do not have access to this file')
    }

    // Get extraction status
    const status = await getExtractionStatus(params.fileId)

    return successResponse({
      status: status.status,
      progress: status.progress,
      entriesCount: status.entriesCount,
      error: status.error,
    })
  } catch (error) {
    console.error('[Context] Error getting extraction status:', error)
    return errors.internalError()
  }
}
