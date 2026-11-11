import { NextRequest, NextResponse } from "next/server";
import { getSafeRedirectPath } from "@/lib/auth/redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/account";
  const origin = url.origin;

  if (!code) {
    const redirectUrl = new URL("/sign-in", origin);
    redirectUrl.searchParams.set("error", "Authorization code not found");
    return NextResponse.redirect(redirectUrl.toString());
  }

  // Build the redirect response early so Supabase can attach session cookies to it.
  // The second argument is the fallback path, not the origin: passing the
  // origin here sent an unsafe `next` to the home page instead of /account.
  const redirectPath = getSafeRedirectPath(next);
  const response = NextResponse.redirect(new URL(redirectPath, origin));
  const cookieStore = await cookies();

  // Returns null when the Supabase env is missing, so the check below works
  // (createServerClient with `!` env values never returned null).
  const supabase = createSupabaseServerClient({
    getAll: () => cookieStore.getAll(),
    setAll: (cookiesToSet) =>
      cookiesToSet.forEach(({ name, value, options }) =>
        response.cookies.set(name, value, options)
      ),
  });

  if (!supabase) {
    const redirectUrl = new URL("/sign-in", origin);
    redirectUrl.searchParams.set("error", "Authentication service not configured");
    return NextResponse.redirect(redirectUrl.toString());
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("Exchange code error:", error);
    const redirectUrl = new URL("/sign-in", origin);
    redirectUrl.searchParams.set("error", error.message);
    return NextResponse.redirect(redirectUrl.toString());
  }

  return response;
}
