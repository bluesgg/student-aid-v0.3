/**
 * POST /api/auth/register
 * 
 * Register a new user account.
 * Returns needsEmailConfirmation=true when email verification is required.
 */

import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { jsonOk, jsonError, parseBody, mapSupabaseAuthError } from "@/lib/api-helpers";
import { registerSchema, type RegisterResponse } from "@/types/auth";

export async function POST(request: NextRequest) {
  // Parse and validate request body
  const parsed = await parseBody(request, registerSchema);
  if ("error" in parsed) {
    return parsed.error;
  }

  const { email, password } = parsed.data;

  try {
    const supabase = await createServerSupabaseClient();

    // Get the origin for the email redirect
    const origin = request.nextUrl.origin;
    const emailRedirectTo = `${origin}/auth/callback`;

    // Attempt to sign up
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo,
      },
    });

    if (error) {
      const mapped = mapSupabaseAuthError(error);
      return jsonError(mapped.code, mapped.message);
    }

    // Check if user was actually created or if email already exists
    // When email confirmation is enabled and email exists, Supabase may return
    // a user object with identities = [] instead of an error
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      return jsonError(
        "EMAIL_ALREADY_EXISTS",
        "This email is already registered. Please sign in instead."
      );
    }

    if (!data.user) {
      return jsonError("INTERNAL_ERROR", "Failed to create user account.");
    }

    // Build response
    const response: RegisterResponse = {
      user: {
        id: data.user.id,
        email: data.user.email ?? email,
        createdAt: data.user.created_at,
      },
      // When email confirmation is enabled, session will be null
      needsEmailConfirmation: data.session === null,
    };

    return jsonOk(response, 201);
  } catch (err) {
    console.error("[POST /api/auth/register] Unexpected error:", err);
    return jsonError("INTERNAL_ERROR", "An unexpected error occurred.");
  }
}

