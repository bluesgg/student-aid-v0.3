/**
 * GET /auth/callback
 * 
 * Handles OAuth and email confirmation callbacks from Supabase.
 * Exchanges the code for a session and redirects to /courses or the specified next URL.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/courses";
  const origin = requestUrl.origin;

  if (code) {
    try {
      const supabase = await createServerSupabaseClient();
      
      // Exchange the code for a session
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        console.error("[GET /auth/callback] Code exchange error:", error);
        // Redirect to login with error
        return NextResponse.redirect(
          `${origin}/login?error=confirmation_failed&message=${encodeURIComponent(
            "Failed to confirm email. Please try again."
          )}`
        );
      }

      // Successfully authenticated, redirect to next URL
      // Ensure we don't redirect to external URLs
      const redirectUrl = next.startsWith("/") ? `${origin}${next}` : `${origin}/courses`;
      return NextResponse.redirect(redirectUrl);
    } catch (err) {
      console.error("[GET /auth/callback] Unexpected error:", err);
      return NextResponse.redirect(
        `${origin}/login?error=confirmation_failed&message=${encodeURIComponent(
          "An unexpected error occurred."
        )}`
      );
    }
  }

  // No code provided, redirect to login
  return NextResponse.redirect(`${origin}/login`);
}


