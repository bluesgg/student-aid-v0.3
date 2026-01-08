import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { successResponse, errors } from '@/lib/api-response'
import { loginSchema } from '@/lib/validations/auth'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate input
    const result = loginSchema.safeParse(body)
    if (!result.success) {
      const firstError = result.error.errors[0]
      return errors.invalidInput(firstError.message, {
        field: firstError.path[0],
      })
    }

    const { email, password } = result.data

    const supabase = createClient()

    // Attempt to sign in
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      // Check for email not confirmed
      if (error.message.includes('Email not confirmed')) {
        return errors.emailNotConfirmed()
      }
      // Generic invalid credentials for security
      return errors.invalidCredentials()
    }

    return successResponse({
      user: {
        id: data.user.id,
        email: data.user.email,
      },
    })
  } catch {
    return errors.internalError()
  }
}
