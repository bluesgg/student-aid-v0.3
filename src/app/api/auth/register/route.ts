import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { successResponse, errors } from '@/lib/api-response'
import { registerSchema } from '@/lib/validations/auth'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate input
    const result = registerSchema.safeParse(body)
    if (!result.success) {
      const firstError = result.error.errors[0]
      return errors.invalidInput(firstError.message, {
        field: firstError.path[0],
      })
    }

    const { email, password } = result.data

    const supabase = createClient()

    // Attempt to sign up
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
      },
    })

    if (error) {
      // Check for existing user
      if (error.message.includes('already registered')) {
        return errors.emailAlreadyExists()
      }
      return errors.invalidInput(error.message)
    }

    // Supabase returns a user with identities = [] if email already exists
    // but hasn't been confirmed
    if (data.user && data.user.identities?.length === 0) {
      return errors.emailAlreadyExists()
    }

    return successResponse({
      user: {
        id: data.user?.id,
        email: data.user?.email,
      },
      needsEmailConfirmation: true,
    })
  } catch {
    return errors.internalError()
  }
}
