"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, X, ChevronsLeft, ChevronsRight, Globe, ShoppingBag, Store, ExternalLink, LifeBuoy } from "lucide-react";
import { useT } from "@/i18n/client";
import { LanguageToggle, ThemeToggle } from "@/components/layout/Preferences";
import { OFFLINE, ONLINE } from "@/components/admin/nav";
import { useAdminAccess, useCurrentItem } from "@/components/admin/access";

/** The online store app: full-height sidebar on the left, top bar, page. */
export default function OnlineLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useT();
  const { onlineGroups, hasOffline, userName, signOut } = useAdminAccess();
  const { item: currentItem, redirecting } = useCurrentItem("online", pathname);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        if (localStorage.getItem("admin-menu-small") === "1") setCollapsed(true);
        localStorage.setItem("admin-workspace", "online");
      } catch {
        // No storage (private window): the defaults are fine.
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

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

  if (redirecting) return <div className="h-screen bg-surface" />;

  const small = collapsed; // desktop only; the phone drawer is always full width
  const isShared = currentItem?.id === "inventory" || currentItem?.id === "customers" || currentItem?.id === "products";

  return (
    <div className="flex h-screen bg-surface overflow-hidden print:block print:h-auto print:overflow-visible print:bg-white">
      {drawerOpen && <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setDrawerOpen(false)} />}

      <aside
        className={`print:hidden fixed md:static inset-y-0 left-0 z-50 h-full w-72 bg-rail text-rail-text flex flex-col flex-shrink-0 transition-[transform,width] duration-200 ${
          drawerOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        } ${small ? "md:w-[68px]" : "md:w-64"}`}
      >
        <div className={`h-16 flex items-center gap-2 px-4 border-b border-white/10 flex-shrink-0 ${small ? "md:justify-center md:px-0" : ""}`}>
          <div className="w-9 h-9 rounded-lg bg-accent-gold text-rail flex items-center justify-center font-display font-bold flex-shrink-0">A</div>
          <div className={`min-w-0 leading-tight ${small ? "md:hidden" : ""}`}>
            <p className="font-semibold text-white truncate">{t("admin.shell.title")}</p>
            <p className="text-[11px] text-rail-muted truncate">{t("admin.shell.online")}</p>
          </div>
          <button onClick={() => setDrawerOpen(false)} className="md:hidden ml-auto p-2 rounded-lg hover:bg-rail-hover" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* The way over to the other app: the shop. */}
        {hasOffline && (
          <div className={`p-3 border-b border-white/10 flex-shrink-0 ${small ? "md:px-2" : ""}`}>
            <div className={`grid gap-1 rounded-xl bg-white/5 p-1 ${small ? "grid-cols-2 md:grid-cols-1" : "grid-cols-2"}`}>
              <span className="flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold bg-accent-gold text-rail shadow" aria-current="true">
                <ShoppingBag className="w-4 h-4 flex-shrink-0" />
                <span className={small ? "md:hidden" : ""}>{t("admin.shell.online")}</span>
              </span>
              <Link href={OFFLINE} title={t("admin.shell.storeHint")} className="flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold text-rail-muted hover:text-white hover:bg-white/5 transition-colors">
                <Store className="w-4 h-4 flex-shrink-0" />
                <span className={small ? "md:hidden" : ""}>{t("admin.shell.store")}</span>
              </Link>
            </div>
          </div>
        )}

        <nav className="flex-1 overflow-y-auto py-2 no-scrollbar">
          {onlineGroups.map((group) => (
            <div key={group.id} className="mb-1">
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

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden print:block print:overflow-visible">
        <header className="print:hidden h-16 bg-surface-card border-b border-border-light px-3 sm:px-6 flex items-center gap-3 flex-shrink-0">
          <button onClick={() => setDrawerOpen(true)} className="md:hidden p-2 rounded-lg text-on-surface-variant hover:bg-surface-subtle" aria-label={t("admin.shell.openMenu")}>
            <Menu className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-primary truncate">{currentItem ? t(`admin.nav.${currentItem.id}.name`) : t("admin.shell.subtitle")}</h1>
              <span className="hidden sm:inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-blue-100 text-blue-700">
                <ShoppingBag className="w-3 h-3" />
                {isShared ? t("admin.shell.sharedTag") : t("admin.shell.online")}
              </span>
            </div>
            {currentItem && <p className="hidden md:block text-xs text-text-muted truncate">{t(`admin.nav.${currentItem.id}.desc`)}</p>}
          </div>
          <Link href={`${ONLINE}/help`} className="hidden sm:inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-border-light bg-surface-card text-xs font-semibold text-on-surface-variant hover:bg-surface-subtle">
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
