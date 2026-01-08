import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Email confirmation callback handler.
 * Called when user clicks the verification link from their email.
 *
 * Success: Sets session cookie and redirects to /courses
 * Failure: Redirects to /login with error parameter
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/courses'

  if (!code) {
    return NextResponse.redirect(
      new URL('/login?error=verification_failed', request.url)
    )
  }

  const cookieStore = cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.set({ name, value: '', ...options })
        },
      },
    }
  )

  try {
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      console.error('Auth callback error:', error.message)

      // Check for expired link
      if (error.message.includes('expired')) {
        return NextResponse.redirect(
          new URL('/login?error=link_expired', request.url)
        )
      }

      return NextResponse.redirect(
        new URL('/login?error=verification_failed', request.url)
      )
    }

    // Success - redirect to the intended destination
    return NextResponse.redirect(new URL(next, request.url))
  } catch {
    return NextResponse.redirect(
      new URL('/login?error=verification_failed', request.url)
    )
  }
}
