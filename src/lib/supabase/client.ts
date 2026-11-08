import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";

/**
 * Why the browser client is unavailable, or null when it is fine.
 *
 * `isSupabaseConfigured` alone told callers only "not configured", which is
 * what a customer saw instead of the actual cause. The two real causes are a
 * missing variable and a stale dev server: Next.js inlines NEXT_PUBLIC_* at
 * build time, so a `next dev` process started before .env.local was filled in
 * keeps serving an empty URL forever until it is restarted. Naming the cause
 * turns a dead-end error into an instruction.
 */
export function supabaseConfigProblem(): string | null {
  if (!supabaseUrl) {
    return "NEXT_PUBLIC_SUPABASE_URL is not set.";
  }
  if (!supabasePublishableKey) {
    return "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set. If it is set in .env.local, the dev server was started before it was added and must be restarted.";
  }
  if (supabaseUrl.includes("your-project")) {
    return "NEXT_PUBLIC_SUPABASE_URL is still the placeholder value.";
  }
  if (!supabaseUrl.startsWith("http")) {
    return "NEXT_PUBLIC_SUPABASE_URL is not a valid URL.";
  }
  return null;
}

export const isSupabaseConfigured = supabaseConfigProblem() === null;

let cachedBrowserClient: SupabaseClient | null = null;

/**
 * The browser (anon) Supabase client, or null when unconfigured.
 *
 * Always createBrowserClient from @supabase/ssr: it stores the PKCE code
 * verifier in cookies, which is what the server client reads to complete an
 * OAuth code exchange on /auth/callback.
 *
 * There is deliberately no module-level `supabase` export. Evaluating this at
 * import time runs on the server during SSR, where window is undefined, so
 * such an export would be permanently null even in a correctly configured app
 * — a trap for any caller that used it. Call this function instead.
 */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (typeof window === "undefined") return null;

  if (!cachedBrowserClient) {
    cachedBrowserClient = createBrowserClient(supabaseUrl, supabasePublishableKey);
  }
  return cachedBrowserClient;
}
