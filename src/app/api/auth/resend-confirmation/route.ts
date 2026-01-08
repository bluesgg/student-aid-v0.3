import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { successResponse, errors } from '@/lib/api-response'
import { resendConfirmationSchema } from '@/lib/validations/auth'
import {
  checkRateLimit,
  rateLimitConfigs,
  getClientIP,
} from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate input
    const result = resendConfirmationSchema.safeParse(body)
    if (!result.success) {
      const firstError = result.error.errors[0]
      return errors.invalidInput(firstError.message, {
        field: firstError.path[0],
      })
    }

    const { email } = result.data
    const clientIP = getClientIP(request.headers)

    // Check rate limits
    const emailRateLimit = await checkRateLimit(
      rateLimitConfigs.resendEmailByEmail(email)
    )

    if (!emailRateLimit.allowed) {
      return errors.rateLimitExceeded(emailRateLimit.resetInSeconds, 'email')
    }

    const ipRateLimit = await checkRateLimit(
      rateLimitConfigs.resendEmailByIP(clientIP)
    )

    if (!ipRateLimit.allowed) {
      return errors.rateLimitExceeded(ipRateLimit.resetInSeconds, 'ip')
    }

    const supabase = createClient()

    // Resend confirmation email
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
      },
    })

    if (error) {
      // Don't reveal whether email exists for security
      // Just return success anyway
      console.error('Resend confirmation error:', error.message)
    }

    // Always return success to prevent email enumeration
    return successResponse({
      message: 'Confirmation email has been resent.',
    })
  } catch {
    return errors.internalError()
  }
}
