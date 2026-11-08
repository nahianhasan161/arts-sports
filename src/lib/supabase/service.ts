import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase client with the service-role key. It bypasses row level security,
 * so it is only for server code that has already decided the caller is
 * allowed: a webhook whose signature checked out, or a job.
 *
 * Never use it for something a browser asked for without checking first.
 * The key is a Worker secret (`npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY`)
 * and `.env.local` locally; it must never get a NEXT_PUBLIC_ prefix.
 */
let cached: SupabaseClient | null = null;

export function getServiceSupabase(): SupabaseClient {
  if (cached) return cached;
  // Read at call time: on Cloudflare the secrets are attached per request.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set, so server-side jobs cannot reach the database.");
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

export function isServiceSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}
