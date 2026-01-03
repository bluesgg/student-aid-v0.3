/**
 * API Route Handler Helpers
 * 
 * Utility functions for building consistent API responses in Route Handlers.
 */

import { NextResponse } from "next/server";
import { ZodError, ZodSchema } from "zod";
import type { ApiResponse, ErrorCode } from "@/types/api";
import { errorCodeToHttpStatus } from "@/types/api";

/**
 * Create a success JSON response
 */
export function jsonOk<T>(data: T, status = 200): NextResponse<ApiResponse<T>> {
  return NextResponse.json({ ok: true, data } as ApiResponse<T>, { status });
}

/**
 * Create an error JSON response
 */
export function jsonError(
  code: ErrorCode,
  message: string,
  status?: number
): NextResponse<ApiResponse<never>> {
  return NextResponse.json(
    { ok: false, error: { code, message } } as ApiResponse<never>,
    { status: status ?? errorCodeToHttpStatus[code] ?? 500 }
  );
}

/**
 * Parse and validate JSON body using a Zod schema
 * Returns the validated data or throws an ApiError
 */
export async function parseBody<T>(
  request: Request,
  schema: ZodSchema<T>
): Promise<{ data: T } | { error: NextResponse<ApiResponse<never>> }> {
  let body: unknown;
  
  try {
    body = await request.json();
  } catch {
    return {
      error: jsonError("INVALID_INPUT", "Invalid JSON body"),
    };
  }

  try {
    const data = schema.parse(body);
    return { data };
  } catch (err) {
    if (err instanceof ZodError) {
      // Get the first error message
      const firstError = err.errors[0];
      const message = firstError
        ? `${firstError.path.join(".")}: ${firstError.message}`.replace(/^:\s*/, "")
        : "Invalid input";
      return {
        error: jsonError("INVALID_INPUT", message),
      };
    }
    return {
      error: jsonError("INVALID_INPUT", "Invalid input"),
    };
  }
}

/**
 * Map Supabase auth error codes to our error codes
 */
export function mapSupabaseAuthError(
  error: { message: string; code?: string; status?: number }
): { code: ErrorCode; message: string } {
  const msg = error.message.toLowerCase();
  
  // Email already registered
  if (
    msg.includes("user already registered") ||
    msg.includes("email already") ||
    error.code === "user_already_exists"
  ) {
    return {
      code: "EMAIL_ALREADY_EXISTS",
      message: "This email is already registered. Please sign in instead.",
    };
  }

  // Invalid credentials
  if (
    msg.includes("invalid login credentials") ||
    msg.includes("invalid password") ||
    error.code === "invalid_credentials"
  ) {
    return {
      code: "UNAUTHORIZED",
      message: "Incorrect email or password. Please try again.",
    };
  }

  // Email not confirmed
  if (
    msg.includes("email not confirmed") ||
    msg.includes("email confirmation") ||
    error.code === "email_not_confirmed"
  ) {
    return {
      code: "EMAIL_NOT_CONFIRMED",
      message: "Please verify your email before signing in.",
    };
  }

  // Rate limiting
  if (msg.includes("rate limit") || error.status === 429) {
    return {
      code: "QUOTA_EXCEEDED",
      message: "Too many attempts. Please try again later.",
    };
  }

  // Default to internal error
  return {
    code: "INTERNAL_ERROR",
    message: "An unexpected error occurred. Please try again.",
  };
}





