/**
 * GET /api/auth/me
 * 
 * Get the current authenticated user.
 * Returns UNAUTHORIZED if not logged in.
 */

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { jsonOk, jsonError } from "@/lib/api-helpers";
import type { MeResponse } from "@/types/auth";

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();

    // Get the current user
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return jsonError("UNAUTHORIZED", "Not authenticated.");
    }

    // Build response
    const response: MeResponse = {
      id: user.id,
      email: user.email ?? "",
      createdAt: user.created_at,
    };

    return jsonOk(response);
  } catch (err) {
    console.error("[GET /api/auth/me] Unexpected error:", err);
    return jsonError("INTERNAL_ERROR", "An unexpected error occurred.");
  }
}





