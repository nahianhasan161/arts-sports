import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { legacyAdminPath } from "@/lib/admin/paths";

/**
 * Auth runs only for the pages that need a signed-in person (/account, /admin).
 *
 * It used to call Supabase Auth on every request, public pages and every /api
 * call included: one network round trip before anything rendered, and it made
 * every page uncacheable. Public pages don't need it (the browser client keeps
 * the session fresh) and API routes check the session themselves, which also
 * refreshes the cookie when needed.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // The admin is two apps now: /admin/online and /admin/offline.
  const moved = legacyAdminPath(pathname);
  if (moved) {
    const url = request.nextUrl.clone();
    url.pathname = moved;
    return NextResponse.redirect(url);
  }

  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  const isProtectedRoute = isAdminRoute || pathname === "/account" || pathname.startsWith("/account/");
  if (!isProtectedRoute) return NextResponse.next();

  const toSignIn = () => {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = "";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  };

  // No Supabase session cookie at all: no need to ask the auth server.
  const hasSession = request.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));
  if (!hasSession) return toSignIn();

  const response = NextResponse.next({ request: { headers: request.headers } });
  const supabase = createSupabaseServerClient({
    getAll: () => request.cookies.getAll(),
    setAll: (cookiesToSet, headers) => {
      cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value));
    },
  });
  if (!supabase) return response;

  // getClaims() checks the JWT locally when the project uses asymmetric
  // signing keys (no network call), and refreshes an expired session.
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return toSignIn();

  if (isAdminRoute) {
    // Staff accounts (cashier, inventory...) get in too; each page and API
    // then checks the permission it needs. is_staff() covers admins as well.
    const { data: isStaff, error } = await supabase.rpc("is_staff");
    if (error || !isStaff) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  // Static files never reach the middleware; API routes don't either (they
  // check auth themselves).
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|json|woff2?)$).*)"],
};
