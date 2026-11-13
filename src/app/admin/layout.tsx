"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { LogOut, Shield, Menu, X, ChevronsLeft, ChevronsRight, Globe, ShoppingBag, Store, ExternalLink, LifeBuoy } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useT } from "@/i18n/client";
import { LanguageToggle, ThemeToggle } from "@/components/layout/Preferences";
import { NAV, findItem, workspaceOf, type NavItem, type Workspace } from "@/components/admin/nav";

const WORKSPACE_KEY = "admin-workspace";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAdmin: isAdminRole, role, loading: authLoading, signOut } = useAuth();
  const { t } = useT();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  // The workspace last chosen; used on pages that belong to both (stock, customers...).
  const [chosen, setChosen] = useState<Workspace>("online");
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

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        if (localStorage.getItem(WORKSPACE_KEY) === "store") setChosen("store");
        if (localStorage.getItem("admin-menu-small") === "1") setCollapsed(true);
      } catch {
        // No storage (private window): the defaults are fine.
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  // Admins see everything; staff see the pages their permissions open.
  const canSee = (i: NavItem) => isAdminRole || i.open === true || Boolean(i.perm && permissions?.includes(i.perm));
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter(canSee) })).filter((g) => g.items.length > 0);
  const allowed = groups.flatMap((g) => g.items);
  // Help alone does not make someone staff of anything.
  const hasRealAccess = allowed.some((i) => !i.open);
  const currentItem = findItem(allowed, pathname);

  const hasOnline = groups.some((g) => g.workspace === "online" && g.id !== "shared");
  const hasStore = groups.some((g) => g.workspace === "store" && g.id !== "shared");
  const workspace: Workspace = !hasOnline ? "store" : !hasStore ? "online" : (workspaceOf(currentItem?.href) ?? chosen);
  const visibleGroups = groups.filter((g) => g.workspace === workspace || g.workspace === "both");

  const loading = authLoading || (isStaff && permissions === null);
  const isAdmin = isAdminRole || (isStaff && hasRealAccess);
  // A staff account on a page it cannot use (the dashboard, for one) goes to its first page.
  const staffHome = isStaff && !loading && !currentItem ? allowed.find((i) => !i.open)?.href : undefined;

  useEffect(() => {
    if (loading) return;
    if (!isAdmin || staffHome) {
      const timer = setTimeout(() => router.push(staffHome ?? "/admin?denied=1"), 0);
      return () => clearTimeout(timer);
    }
  }, [loading, isAdmin, staffHome, router]);

  function switchTo(next: Workspace) {
    setChosen(next);
    try {
      localStorage.setItem(WORKSPACE_KEY, next);
    } catch {
      // ignore
    }
    // Go to the first page of that workspace the person may open.
    const first = groups.find((g) => g.workspace === next && g.id !== "shared")?.items[0] ?? groups.find((g) => g.workspace === next)?.items[0];
    if (first && workspaceOf(currentItem?.href) !== null) router.push(first.href);
    else if (first && !currentItem) router.push(first.href);
  }

  function toggleCollapsed() {
    setCollapsed((c) => {
      try {
        localStorage.setItem("admin-menu-small", c ? "0" : "1");
      } catch {
        // ignore
      }
      return !c;
    });
  }

  if (loading || staffHome) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-surface">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-accent-gold border-t-transparent rounded-full animate-spin" />
          <p className="text-text-muted text-sm">{t("admin.shell.loading")}</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
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

  const small = collapsed; // desktop only; the phone drawer is always full width
  const userName = (user?.user_metadata?.full_name as string | undefined) || (user?.user_metadata?.name as string | undefined) || user?.email?.split("@")[0] || "";

  return (
    <div className="flex h-screen bg-surface overflow-hidden print:block print:h-auto print:overflow-visible print:bg-white">
      {/* This layout is a client component, so it cannot export metadata.
          React hoists this tag into <head>; it keeps the panel out of search results. */}
      <meta name="robots" content="noindex, nofollow, noarchive" />

      {drawerOpen && <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setDrawerOpen(false)} />}

      {/* Sidebar: the full height of the screen, on the left. */}
      <aside
        className={`print:hidden fixed md:static inset-y-0 left-0 z-50 h-full w-72 bg-rail text-rail-text flex flex-col flex-shrink-0 transition-[transform,width] duration-200 ${
          drawerOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        } ${small ? "md:w-[68px]" : "md:w-64"}`}
      >
        <div className={`h-16 flex items-center gap-2 px-4 border-b border-white/10 flex-shrink-0 ${small ? "md:justify-center md:px-0" : ""}`}>
          <div className="w-9 h-9 rounded-lg bg-accent-gold text-rail flex items-center justify-center font-display font-bold flex-shrink-0">A</div>
          <div className={`min-w-0 leading-tight ${small ? "md:hidden" : ""}`}>
            <p className="font-semibold text-white truncate">{t("admin.shell.title")}</p>
            <p className="text-[11px] text-rail-muted truncate">{t("admin.shell.subtitle")}</p>
          </div>
          <button onClick={() => setDrawerOpen(false)} className="md:hidden ml-auto p-2 rounded-lg hover:bg-rail-hover" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Workspace switch: website or physical shop. */}
        {hasOnline && hasStore && (
          <div className={`p-3 border-b border-white/10 flex-shrink-0 ${small ? "md:px-2" : ""}`}>
            <div className={`grid gap-1 rounded-xl bg-white/5 p-1 ${small ? "grid-cols-2 md:grid-cols-1" : "grid-cols-2"}`}>
              {(["online", "store"] as const).map((w) => {
                const active = workspace === w;
                const Icon = w === "online" ? ShoppingBag : Store;
                return (
                  <button
                    key={w}
                    onClick={() => switchTo(w)}
                    title={t(`admin.shell.${w}Hint`)}
                    aria-pressed={active}
                    className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition-colors ${
                      active ? "bg-accent-gold text-rail shadow" : "text-rail-muted hover:text-white hover:bg-white/5"
                    }`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span className={small ? "md:hidden" : ""}>{t(`admin.shell.${w}`)}</span>
                  </button>
                );
              })}
            </div>
            <p className={`mt-2 px-1 text-[11px] leading-snug text-rail-muted ${small ? "md:hidden" : ""}`}>{t(`admin.shell.${workspace}Hint`)}</p>
          </div>
        )}

        <nav className="flex-1 overflow-y-auto py-2 no-scrollbar">
          {visibleGroups.map((group) => (
            <div key={`${group.id}-${group.workspace}`} className="mb-1">
              <p className={`px-5 pt-4 pb-1.5 text-[11px] font-semibold text-rail-muted/80 ${small ? "md:hidden" : ""}`}>{t(`admin.groups.${group.id}`)}</p>
              {small && <div className="hidden md:block mx-4 my-2 border-t border-white/10" />}
              {group.items.map((item) => {
                const active = currentItem?.href === item.href;
                const label = t(`admin.nav.${item.id}.name`);
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    onClick={() => setDrawerOpen(false)}
                    title={small ? label : undefined}
                    aria-current={active ? "page" : undefined}
                    className={`relative mx-2 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                      active ? "bg-white/10 text-white" : "text-rail-text/80 hover:bg-rail-hover hover:text-white"
                    } ${small ? "md:justify-center md:px-0" : ""}`}
                  >
                    {active && <span className="absolute left-0 top-2 bottom-2 w-1 rounded-full bg-accent-gold" />}
                    <item.icon className={`w-5 h-5 flex-shrink-0 ${active ? "text-accent-gold" : ""}`} />
                    <span className={`truncate ${small ? "md:hidden" : ""}`}>{label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="border-t border-white/10 p-2 flex-shrink-0">
          <Link href="/" className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-rail-text/80 hover:bg-rail-hover hover:text-white ${small ? "md:justify-center md:px-0" : ""}`} title={t("admin.shell.viewSite")}>
            <Globe className="w-5 h-5 flex-shrink-0" />
            <span className={small ? "md:hidden" : ""}>{t("admin.shell.viewSite")}</span>
          </Link>
          <button onClick={signOut} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-rail-text/80 hover:bg-rail-hover hover:text-white ${small ? "md:justify-center md:px-0" : ""}`} title={t("admin.shell.signOut")}>
            <LogOut className="w-5 h-5 flex-shrink-0" />
            <span className={small ? "md:hidden" : ""}>{t("admin.shell.signOut")}</span>
          </button>
          <button onClick={toggleCollapsed} className={`hidden md:flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-rail-muted hover:bg-rail-hover hover:text-white ${small ? "justify-center px-0" : ""}`} title={small ? t("admin.shell.expand") : t("admin.shell.collapse")}>
            {small ? <ChevronsRight className="w-5 h-5" /> : <ChevronsLeft className="w-5 h-5 flex-shrink-0" />}
            {!small && <span>{t("admin.shell.collapse")}</span>}
          </button>
        </div>
      </aside>

      {/* Everything else sits to the right of the sidebar. */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden print:block print:overflow-visible">
        <header className="print:hidden h-16 bg-surface-card border-b border-border-light px-3 sm:px-6 flex items-center gap-3 flex-shrink-0">
          <button onClick={() => setDrawerOpen(true)} className="md:hidden p-2 rounded-lg text-on-surface-variant hover:bg-surface-subtle" aria-label={t("admin.shell.openMenu")}>
            <Menu className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-primary truncate">{currentItem ? t(`admin.nav.${currentItem.id}.name`) : t("admin.shell.subtitle")}</h1>
              <span className={`hidden sm:inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${workspace === "store" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}>
                {workspace === "store" ? <Store className="w-3 h-3" /> : <ShoppingBag className="w-3 h-3" />}
                {workspaceOf(currentItem?.href) === null && currentItem && !currentItem.open && NAV.find((g) => g.id === "shared")?.items.some((i) => i.href === currentItem.href)
                  ? t("admin.shell.sharedTag")
                  : t(`admin.shell.${workspace}`)}
              </span>
            </div>
            {currentItem && <p className="hidden md:block text-xs text-text-muted truncate">{t(`admin.nav.${currentItem.id}.desc`)}</p>}
          </div>
          <Link href="/admin/help" className="hidden sm:inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-border-light bg-surface-card text-xs font-semibold text-on-surface-variant hover:bg-surface-subtle">
            <LifeBuoy className="w-4 h-4" />
            {t("admin.shell.help")}
          </Link>
          <Link href="/" target="_blank" className="hidden lg:inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-border-light bg-surface-card text-xs font-semibold text-on-surface-variant hover:bg-surface-subtle">
            <ExternalLink className="w-4 h-4" />
            {t("admin.shell.viewSite")}
          </Link>
          <LanguageToggle />
          <ThemeToggle />
          {userName && (
            <div className="hidden lg:flex items-center gap-2 pl-2 border-l border-border-light">
              <div className="w-8 h-8 rounded-full bg-accent-gold/20 text-accent-gold flex items-center justify-center text-sm font-bold uppercase">{userName.slice(0, 1)}</div>
              <span className="text-sm font-medium text-on-surface max-w-[120px] truncate">{userName}</span>
            </div>
          )}
        </header>

        {/* The page description also shows on phones, where the top bar has no room for it. */}
        {currentItem && <p className="md:hidden print:hidden px-4 pt-3 text-xs text-text-muted">{t(`admin.nav.${currentItem.id}.desc`)}</p>}

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 print:overflow-visible print:p-0">{children}</main>
      </div>
    </div>
  );
}
