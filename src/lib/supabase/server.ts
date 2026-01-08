import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Creates a Supabase client for server-side operations.
 * Uses httpOnly cookies for session management.
 *
 * Usage:
 * - In Server Components: const supabase = createClient()
 * - In Route Handlers: const supabase = createClient()
 * - In Server Actions: const supabase = createClient()
 */
export function createClient() {
  const cookieStore = cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options })
          } catch {
            // Handle cookies in read-only context (Server Components)
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options })
          } catch {
            // Handle cookies in read-only context (Server Components)
          }
        },
      },
    }
  )
}

/**
 * Creates a Supabase admin client with service role key.
 * ONLY use for server-side operations that need to bypass RLS.
 *
 * WARNING: Never expose this client to the browser.
 */
export function createAdminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        get() {
          return undefined
        },
        set() {
          // No-op for admin client
        },
        remove() {
          // No-op for admin client
        },
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
