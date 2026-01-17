import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { successResponse, errors } from '@/lib/api-response'
import {
  getOrCreateUserPreferences,
  updateUserPreferences,
} from '@/lib/user-preferences'
import { z } from 'zod'

const updateSchema = z.object({
  ui_locale: z.enum(['en', 'zh']).optional(),
  explain_locale: z.enum(['en', 'zh']).optional(),
})

/**
 * GET /api/user/preferences - Get current user preferences
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

    // Fetch existing preferences - use maybeSingle() to handle no rows gracefully
    const { data: preferences, error: fetchError } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()

    // If there's an error (other than no rows), log it but continue with defaults
    if (fetchError) {
      console.error('Error fetching preferences:', fetchError)
    }

    // No preferences record = new user
    const isNewUser = preferences === null

    return successResponse({
      preferences: preferences ?? {
        user_id: user.id,
        ui_locale: 'en',
        explain_locale: 'en',
      },
      isNewUser,
    })
  } catch (error) {
    console.error('Error fetching user preferences:', error)
    return errors.internalError()
  }
}

/**
 * POST /api/user/preferences - Create or update user preferences
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
    const parseResult = updateSchema.safeParse(body)

    if (!parseResult.success) {
      return errors.invalidInput(parseResult.error.errors[0].message)
    }

    const updates = parseResult.data

    // If no updates provided, just create defaults
    if (!updates.ui_locale && !updates.explain_locale) {
      const preferences = await getOrCreateUserPreferences(user.id)
      return successResponse({ preferences })
    }

    const preferences = await updateUserPreferences(user.id, updates)

    if (!preferences) {
      return errors.internalError('Failed to update preferences')
    }

    return successResponse({ preferences })
  } catch (error) {
    console.error('Error updating user preferences:', error)
    return errors.internalError()
  }
}

/**
 * PATCH /api/user/preferences - Update user preferences (partial)
 */
export async function PATCH(request: NextRequest) {
  // Same logic as POST for partial updates
  return POST(request)
}
