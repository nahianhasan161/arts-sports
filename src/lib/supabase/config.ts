import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * What the site needs to know about Supabase without loading its library
 * (about 65 KB gzipped). Pages a visitor opens first, like the home page,
 * import this; the library itself comes with lib/supabase/client.ts.
 */

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

/** Set by lib/supabase/client.ts when the one browser client is made. */
let browserClient: SupabaseClient | null = null;
const waiting = new Set<(client: SupabaseClient) => void>();

export function announceBrowserClient(client: SupabaseClient) {
  browserClient = client;
  for (const cb of [...waiting]) cb(client);
  waiting.clear();
}

/** Calls back once, now or when some part of the page makes the browser client. Returns a cancel function. */
export function onBrowserClient(cb: (client: SupabaseClient) => void): () => void {
  if (browserClient) {
    cb(browserClient);
    return () => {};
  }
  waiting.add(cb);
  return () => {
    waiting.delete(cb);
  };
}

/** A session cookie (or a sign-in coming back in the URL) that only the Supabase library can read. */
export function mayHaveSession(): boolean {
  return /(?:^|; )sb-[^=]*-auth-token/.test(document.cookie) || /[?&]code=/.test(location.search) || /access_token=/.test(location.hash);
}
