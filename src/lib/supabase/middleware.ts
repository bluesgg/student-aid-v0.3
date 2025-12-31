/**
 * Supabase Middleware Client
 * 
 * Creates a Supabase client for use in Next.js middleware.
 * Handles session refresh and cookie management.
 */

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Create a Supabase client for middleware
 * 
 * This function creates a client and returns the response object
 * that should be returned from the middleware.
 */
export async function createMiddlewareSupabaseClient(request: NextRequest) {
  // Create an unmodified response first
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // First, set cookies on the request (for downstream use)
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          
          // Then create a new response with updated cookies
          supabaseResponse = NextResponse.next({
            request,
          });
          
          // Set cookies on the response (to send back to browser)
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: Do NOT run any Supabase operations between createServerClient 
  // and supabase.auth.getUser(). A simple mistake could make your users 
  // very hard to debug.

  // Refresh the session if it exists
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { supabase, response: supabaseResponse, user };
}


