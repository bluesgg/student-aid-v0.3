/**
 * POST /api/auth/login
 * 
 * Authenticate user with email and password.
 * Sets session cookie on success.
 */

import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { jsonOk, jsonError, parseBody, mapSupabaseAuthError } from "@/lib/api-helpers";
import { loginSchema, type LoginResponse } from "@/types/auth";

export async function POST(request: NextRequest) {
  // Parse and validate request body
  const parsed = await parseBody(request, loginSchema);
  if ("error" in parsed) {
    return parsed.error;
  }

  const { email, password } = parsed.data;

  try {
    const supabase = await createServerSupabaseClient();

    // Attempt to sign in
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      const mapped = mapSupabaseAuthError(error);
      return jsonError(mapped.code, mapped.message);
    }

    if (!data.user) {
      return jsonError("UNAUTHORIZED", "Incorrect email or password.");
    }

    // Build response
    const response: LoginResponse = {
      user: {
        id: data.user.id,
        email: data.user.email ?? email,
        createdAt: data.user.created_at,
      },
    };

    return jsonOk(response);
  } catch (err) {
    console.error("[POST /api/auth/login] Unexpected error:", err);
    return jsonError("INTERNAL_ERROR", "An unexpected error occurred.");
  }
}





