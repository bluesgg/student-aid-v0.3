/**
 * Supabase Environment Variables
 * 
 * Server-only module for reading and validating Supabase configuration.
 * Throws clear errors at startup if required env vars are missing.
 */

// Validate that we're not accidentally importing this in the client
if (typeof window !== "undefined") {
  throw new Error(
    "src/lib/supabase/env.ts should only be imported in server-side code"
  );
}

function getEnvVar(name: string, required = true): string {
  const value = process.env[name];
  if (required && !value) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
      `Please add it to your .env.local file.`
    );
  }
  return value ?? "";
}

/**
 * Supabase configuration
 * These values are read once at module load time and validated.
 */
export const supabaseConfig = {
  /**
   * Supabase project URL
   * @example "https://xxxxx.supabase.co"
   */
  url: getEnvVar("NEXT_PUBLIC_SUPABASE_URL"),

  /**
   * Supabase anonymous key (safe to expose to client, but we only use it server-side in this project)
   * This key has Row Level Security (RLS) applied.
   */
  anonKey: getEnvVar("NEXT_PUBLIC_SUPABASE_ANON_KEY"),

  /**
   * Supabase service role key (NEVER expose to client)
   * This key bypasses RLS and should only be used in server-side code.
   * Optional for basic auth operations, required for admin operations.
   */
  serviceRoleKey: getEnvVar("SUPABASE_SERVICE_ROLE_KEY", false),
} as const;

/**
 * Validate all required Supabase env vars are present
 * Call this at server startup to fail fast if config is missing
 */
export function validateSupabaseEnv(): void {
  const { url, anonKey } = supabaseConfig;
  
  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is required");
  }
  
  if (!anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is required");
  }

  // Validate URL format
  try {
    new URL(url);
  } catch {
    throw new Error(
      `NEXT_PUBLIC_SUPABASE_URL is not a valid URL: ${url}`
    );
  }

  // Log successful validation (only in development)
  if (process.env.NODE_ENV === "development") {
    console.log("✓ Supabase environment validated");
  }
}





