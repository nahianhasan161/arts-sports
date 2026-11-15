"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Shield } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useT } from "@/i18n/client";
import { AdminAccessProvider, buildAccess, type AdminAccess } from "@/components/admin/access";
import type { NavItem } from "@/components/admin/nav";

/**
 * The gate in front of both admin apps. It works out who the person is and
 * what they may open; the look of each app is in online/layout.tsx (sidebar)
 * and offline/layout.tsx (the shop's top menu).
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, isAdmin: isAdminRole, role, loading: authLoading, signOut } = useAuth();
  const { t } = useT();
  // Staff accounts: what their roles allow. null = not loaded yet.
  const [permissions, setPermissions] = useState<string[] | null>(null);
  const isStaff = role === "staff";

  useEffect(() => {
    if (authLoading || !isStaff) return;
    let cancelled = false;
    const supabase = getSupabaseBrowserClient();
    void (async () => {
      const { data } = supabase ? await supabase.rpc("my_permissions") : { data: [] };
      if (!cancelled) setPermissions(Array.isArray(data) ? (data as string[]) : []);
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, isStaff]);

  const access = useMemo<AdminAccess>(() => {
    // Admins see everything; staff see the pages their permissions open.
    const canSee = (i: NavItem) => isAdminRole || i.open === true || Boolean(i.perm && permissions?.includes(i.perm));
    const userName = (user?.user_metadata?.full_name as string | undefined) || (user?.user_metadata?.name as string | undefined) || user?.email?.split("@")[0] || "";
    return { ...buildAccess(canSee), isStaff, userName, signOut };
  }, [isAdminRole, permissions, isStaff, user, signOut]);

  const loading = authLoading || (isStaff && permissions === null);
  const allowed = isAdminRole || (isStaff && (access.hasOnline || access.hasOffline));

  useEffect(() => {
    if (loading || allowed) return;
    const timer = setTimeout(() => router.push("/admin?denied=1"), 0);
    return () => clearTimeout(timer);
  }, [loading, allowed, router]);

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-surface">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-accent-gold border-t-transparent rounded-full animate-spin" />
          <p className="text-text-muted text-sm">{t("admin.shell.loading")}</p>
        </div>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-surface p-6">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-badge-discount/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <Shield className="w-8 h-8 text-badge-discount" />
          </div>
          <h1 className="font-display text-2xl font-bold text-primary mb-3">{t("admin.shell.deniedTitle")}</h1>
          <p className="text-on-surface-variant mb-6">{t("admin.shell.deniedText")}</p>
          <button onClick={() => router.push("/")} className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground rounded-lg font-semibold text-sm hover:opacity-90 transition-opacity">
            {t("admin.shell.backHome")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <AdminAccessProvider value={access}>
      {/* A client component cannot export metadata. React hoists this tag into <head>; it keeps the panel out of search results. */}
      <meta name="robots" content="noindex, nofollow, noarchive" />
      {children}
    </AdminAccessProvider>
  );
}
