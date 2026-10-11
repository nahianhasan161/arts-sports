import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "@/lib/supabase/client";

type CookieEntry = {
  name: string;
  value: string;
};

type CookieStore = {
  getAll: () => CookieEntry[] | null;
  setAll?: (
    cookiesToSet: Array<CookieEntry & { options: CookieOptions }>,
    headers?: Record<string, string>
  ) => void;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";

/**
 * True when this error is Next.js's build-time probe asking whether a route
 * can be rendered statically.
 *
 * `next build` prerenders every route once to find out, and any route that
 * reads cookies throws this. That is the correct outcome for an authenticated
 * or personalised endpoint, but a catch-all that logs unknown errors prints it
 * as "Unexpected <something> error" — so a healthy build looked like it had a
 * dozen failures. Routes that log their own errors call this first to keep
 * real failures distinguishable from a normal dynamic marking.
 */
export function isDynamicServerUsage(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { digest?: string; description?: string };
  return (
    e.digest === "DYNAMIC_SERVER_USAGE" ||
    (typeof e.description === "string" && e.description.includes("couldn't be rendered statically"))
  );
}

export function createSupabaseServerClient(cookieStore: CookieStore): SupabaseClient | null {
  if (!isSupabaseConfigured || !supabaseUrl || !supabasePublishableKey) return null;

  return createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll: cookieStore.getAll,
      setAll: cookieStore.setAll,
    },
  });
}

export async function getSupabaseServerClient(): Promise<SupabaseClient | null> {
  // Dynamically import cookies() to avoid bundling next/headers in client components
  const { cookies } = await import("next/headers");
  const cookieStore = cookies();

  return createSupabaseServerClient({
    getAll: () => cookieStore.getAll(),
    setAll: (cookiesToSet) => {
      try {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      } catch {
        // Cookie writes are handled by middleware when the runtime makes cookies read-only.
      }
    },
  });
}
