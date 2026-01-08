import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { successResponse, errors, errorResponse, ErrorCodes } from '@/lib/api-response'
import { updateCourseSchema } from '@/lib/validations/course'

interface RouteParams {
  params: { courseId: string }
}

/**
 * GET /api/courses/:courseId - Get a single course
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

    const { data: course, error } = await supabase
      .from('courses')
      .select('*')
      .eq('id', params.courseId)
      .eq('user_id', user.id)
      .single()

    if (error || !course) {
      return errors.notFound('Course')
    }

    // Update last_visited_at
    await supabase
      .from('courses')
      .update({ last_visited_at: new Date().toISOString() })
      .eq('id', params.courseId)

    return successResponse({
      id: course.id,
      name: course.name,
      school: course.school,
      term: course.term,
      fileCount: course.file_count,
      lastVisitedAt: course.last_visited_at,
      createdAt: course.created_at,
    })
  } catch {
    return errors.internalError()
  }
}

/**
 * PATCH /api/courses/:courseId - Update a course
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

    // Validate input
    const result = updateCourseSchema.safeParse(body)
    if (!result.success) {
      const firstError = result.error.errors[0]
      return errors.invalidInput(firstError.message, {
        field: firstError.path[0],
      })
    }

    // Check course exists and belongs to user
    const { data: existing, error: fetchError } = await supabase
      .from('courses')
      .select('id')
      .eq('id', params.courseId)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !existing) {
      return errors.notFound('Course')
    }

    // Update course
    const { data: course, error } = await supabase
      .from('courses')
      .update(result.data)
      .eq('id', params.courseId)
      .select()
      .single()

    if (error) {
      // Check for unique constraint violation
      if (error.code === '23505') {
        return errorResponse(
          ErrorCodes.DUPLICATE_COURSE_NAME,
          'A course with this name already exists.',
          409
        )
      }
      console.error('Error updating course:', error)
      return errors.internalError()
    }

    return successResponse({
      id: course.id,
      name: course.name,
      school: course.school,
      term: course.term,
      fileCount: course.file_count,
      lastVisitedAt: course.last_visited_at,
      createdAt: course.created_at,
    })
  } catch {
    return errors.internalError()
  }
}

/**
 * DELETE /api/courses/:courseId - Delete a course and all its files
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

    // Check course exists and belongs to user
    const { data: existing, error: fetchError } = await supabase
      .from('courses')
      .select('id')
      .eq('id', params.courseId)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !existing) {
      return errors.notFound('Course')
    }

    // Get all files for this course to delete from storage
    const { data: files } = await supabase
      .from('files')
      .select('storage_key')
      .eq('course_id', params.courseId)

    // Delete files from storage
    if (files && files.length > 0) {
      const storageKeys = files.map((f) => f.storage_key)
      await supabase.storage.from('course-files').remove(storageKeys)
    }

    // Delete course (cascades to files and AI data)
    const { error } = await supabase
      .from('courses')
      .delete()
      .eq('id', params.courseId)

    if (error) {
      console.error('Error deleting course:', error)
      return errors.internalError()
    }

    return successResponse({ message: 'Course deleted successfully' })
  } catch {
    return errors.internalError()
  }
}
