/**
 * POST /api/auth/logout
 * 
 * Sign out the current user and clear session cookie.
 */

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { jsonOk, jsonError } from "@/lib/api-helpers";
import type { LogoutResponse } from "@/types/auth";

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient();

    // Sign out
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error("[POST /api/auth/logout] Sign out error:", error);
      // Still return success - user likely just wants to be logged out
    }

    const response: LogoutResponse = {};
    return jsonOk(response);
  } catch (err) {
    console.error("[POST /api/auth/logout] Unexpected error:", err);
    return jsonError("INTERNAL_ERROR", "An unexpected error occurred.");
  }
}


