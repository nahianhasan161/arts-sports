import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient, isDynamicServerUsage as isDynamicUsage } from "@/lib/supabase/server";
import type { Profile } from "@/types";

export interface AdminContext {
  user: {
    id: string;
    email?: string;
  };
  profile: Profile | null;
  isSuperAdmin: boolean;
}

export class AdminAuthError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function requireAdmin(): Promise<AdminContext> {
  const cookieStore = await cookies();
  const supabase = createSupabaseServerClient({
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

  if (!supabase) {
    throw new AdminAuthError(500, "Authentication service not configured");
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new AdminAuthError(
      401,
      "Not signed in. Sign in through the app first: this endpoint reads the session cookie, not an Authorization header."
    );
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    throw new AdminAuthError(
      403,
      "Your account is signed in but has no profile row, so it cannot be checked for admin access. An administrator needs to create one."
    );
  }

  const isSuperAdmin = profile.role === "super_admin";

  if (profile.role !== "admin" && profile.role !== "super_admin") {
    throw new AdminAuthError(
      403,
      `Signed in as ${profile.email ?? user.email ?? user.id}, whose role is "${profile.role}" rather than "admin" or "super_admin". An administrator can change it from the User Management page.`
    );
  }

  return {
    user: { id: user.id, email: user.email },
    profile: profile as Profile,
    isSuperAdmin,
  };
}

export async function requireSuperAdmin(): Promise<AdminContext> {
  const context = await requireAdmin();

  if (!context.isSuperAdmin) {
    throw new AdminAuthError(
      403,
      `Signed in as ${context.profile?.email ?? context.user.email ?? context.user.id}, whose role is "${context.profile?.role}" rather than "super_admin". Only a Super Admin can perform this action.`
    );
  }

  return context;
}

export interface UserContext {
  user: {
    id: string;
    email?: string;
  };
}

export async function requireUser(): Promise<UserContext> {
  const cookieStore = await cookies();
  const supabase = createSupabaseServerClient({
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

  if (!supabase) {
    throw new AdminAuthError(500, "Authentication service not configured");
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new AdminAuthError(
      401,
      "Not signed in. Sign in through the app first: this endpoint reads the session cookie, not an Authorization header."
    );
  }

  return { user: { id: user.id, email: user.email } };
}

/**
 * Next.js throws this marker while prerendering a route to decide whether it
 * can be static. A route that reads cookies -- i.e. every authenticated
 * endpoint -- always trips it, which is correct and expected.
 *
 * Without this check `next build` fills its log with "Unexpected auth/admin
 * error" blocks for a completely healthy build, and a reader scanning CI
 * output cannot tell them apart from a real failure.
 */
function isDynamicServerUsage(error: unknown): boolean {
  return isDynamicUsage(error);
}

export function handleAuthError(error: unknown): NextResponse {
  if (error instanceof AdminAuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (isDynamicServerUsage(error)) {
    // Not a failure: Next.js is marking the route dynamic, exactly as it
    // should. Do not log it, and do not turn it into a 500.
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
  console.error("Unexpected auth error:", error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

export function handleAdminError(error: unknown): NextResponse {
  if (error instanceof AdminAuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (isDynamicServerUsage(error)) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
  console.error("Unexpected admin error:", error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
