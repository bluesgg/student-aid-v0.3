/**
 * POST /api/auth/resend-confirmation
 * 
 * Resend email confirmation link.
 * Always returns success to avoid leaking email existence.
 */

import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { jsonOk, parseBody } from "@/lib/api-helpers";
import { resendConfirmationSchema, type ResendConfirmationResponse } from "@/types/auth";

export async function POST(request: NextRequest) {
  // Parse and validate request body
  const parsed = await parseBody(request, resendConfirmationSchema);
  if ("error" in parsed) {
    return parsed.error;
  }

  const { email } = parsed.data;

  try {
    const supabase = await createServerSupabaseClient();

    // Get the origin for the email redirect
    const origin = request.nextUrl.origin;
    const emailRedirectTo = `${origin}/auth/callback`;

    // Attempt to resend confirmation email
    // We don't check for errors to avoid leaking email existence
    await supabase.auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo,
      },
    });

    // Always return success
    const response: ResendConfirmationResponse = {};
    return jsonOk(response);
  } catch (err) {
    // Log but don't expose error to client
    console.error("[POST /api/auth/resend-confirmation] Error:", err);
    
    // Still return success to avoid leaking information
    const response: ResendConfirmationResponse = {};
    return jsonOk(response);
  }
}

