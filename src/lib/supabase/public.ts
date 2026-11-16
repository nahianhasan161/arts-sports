import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * A server-side client with no session: it reads what any visitor may read
 * (RLS as anon). Use it for catalogue and content reads on public pages.
 *
 * The cookie-based client made every page that used it dynamic, so nothing
 * could be cached and each visit rendered on the Worker and queried the DB.
 * This one reads no cookies, so those pages can be served from the ISR cache.
 */
let client: SupabaseClient | null | undefined;

export function getPublicSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  client = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  return client;
}
