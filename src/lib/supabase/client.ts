'use client'

import { createBrowserClient } from '@supabase/ssr'

/**
 * Creates a Supabase client for browser-side operations.
 * Use this for real-time subscriptions and client-side auth state.
 *
 * Note: This client respects RLS policies. For admin operations,
 * use server-side routes with createAdminClient.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
