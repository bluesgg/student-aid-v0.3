import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { successResponse, errors, errorResponse, ErrorCodes } from '@/lib/api-response'
import { createCourseSchema } from '@/lib/validations/course'

const MAX_COURSES = 6

/**
 * GET /api/courses - List all courses for the authenticated user
 */
export async function GET() {
  try {
    const supabase = createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return errors.unauthorized()
    }

    const { data: courses, error } = await supabase
      .from('courses')
      .select('*')
      .eq('user_id', user.id)
      .order('last_visited_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching courses:', error)
      return errors.internalError()
    }

    // Transform to camelCase
    const items = courses.map((course) => ({
      id: course.id,
      name: course.name,
      school: course.school,
      term: course.term,
      fileCount: course.file_count,
      lastVisitedAt: course.last_visited_at,
      createdAt: course.created_at,
    }))

    return successResponse({ items })
  } catch {
    return errors.internalError()
  }
}

/**
 * POST /api/courses - Create a new course
 */
export async function POST(request: NextRequest) {
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
    const result = createCourseSchema.safeParse(body)
    if (!result.success) {
      const firstError = result.error.errors[0]
      return errors.invalidInput(firstError.message, {
        field: firstError.path[0],
      })
    }

    const { name, school, term } = result.data

    // Check course quota
    const { count, error: countError } = await supabase
      .from('courses')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)

    if (countError) {
      console.error('Error counting courses:', countError)
      return errors.internalError()
    }

    if (count !== null && count >= MAX_COURSES) {
      return errorResponse(
        ErrorCodes.COURSE_LIMIT_REACHED,
        `You can create up to ${MAX_COURSES} courses.`,
        403
      )
    }

    // Create course
    const { data: course, error } = await supabase
      .from('courses')
      .insert({
        user_id: user.id,
        name,
        school,
        term,
      })
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
      console.error('Error creating course:', error)
      return errors.internalError()
    }

    return successResponse(
      {
        id: course.id,
        name: course.name,
        school: course.school,
        term: course.term,
        fileCount: course.file_count,
        lastVisitedAt: course.last_visited_at,
        createdAt: course.created_at,
      },
      201
    )
  } catch {
    return errors.internalError()
  }
}
