import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { announceBrowserClient, isSupabaseConfigured, supabaseConfigProblem } from "./config";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";

export { isSupabaseConfigured, supabaseConfigProblem };

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
    announceBrowserClient(cachedBrowserClient);
  }
  return cachedBrowserClient;
}
