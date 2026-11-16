"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, ShoppingBag, Store } from "lucide-react";
import { useT } from "@/i18n/client";
import PageSkeleton from "@/components/ui/PageSkeleton";
import { LanguageToggle, ThemeToggle } from "@/components/layout/Preferences";
import { OFFLINE, ONLINE, REGISTER } from "@/components/admin/nav";
import { useAdminAccess, useCurrentItem } from "@/components/admin/access";

/**
 * The shop app. A dark bar across the top carries the menu, so the page
 * gets the full width; the register and the receipts (everything under
 * /admin/offline/pos) take the whole screen without it.
 */
export default function OfflineLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useT();
  const { offlineItems, hasOnline, userName, signOut } = useAdminAccess();
  const { item: currentItem, redirecting } = useCurrentItem("offline", pathname);

  useEffect(() => {
    try {
      localStorage.setItem("admin-workspace", "offline");
    } catch {
      // ignore
    }
  }, []);

  if (redirecting) return <PageSkeleton label={t("admin.shell.loading")} className="h-screen" />;
  if (pathname === REGISTER) return <>{children}</>;
  // Receipts: a plain page, ready to print.
  if (pathname.startsWith(`${REGISTER}/`)) return <div className="min-h-screen bg-surface p-4 print:p-0 print:bg-white">{children}</div>;

  return (
    <div className="flex h-screen flex-col bg-surface overflow-hidden print:block print:h-auto print:overflow-visible print:bg-white">
      <header className="print:hidden bg-rail text-rail-text flex-shrink-0">
        <div className="h-14 px-3 sm:px-5 flex items-center gap-3">
          <Link href={OFFLINE} className="flex items-center gap-2 flex-shrink-0">
            <span className="w-9 h-9 rounded-lg bg-accent-gold text-rail flex items-center justify-center">
              <Store className="w-5 h-5" />
            </span>
            <span className="leading-tight hidden sm:block">
              <span className="block font-semibold text-white">{t("admin.shell.title")}</span>
              <span className="block text-[11px] text-rail-muted">{t("admin.shell.store")}</span>
            </span>
          </Link>

          <nav className="hidden lg:flex items-center gap-0.5 ml-4 min-w-0 flex-1">
            {offlineItems.map((item) => {
              const active = currentItem?.href === item.href;
              return (
                <Link key={item.id} href={item.href} aria-current={active ? "page" : undefined} className={`px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${active ? "bg-white/10 text-white" : "text-rail-text/80 hover:bg-rail-hover hover:text-white"}`}>
                  {t(`admin.nav.${item.id}.name`)}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            {hasOnline && (
              <Link href={ONLINE} title={t("admin.shell.onlineHint")} className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-semibold text-rail-text hover:bg-white/10">
                <ShoppingBag className="w-4 h-4" />
                <span className="hidden sm:inline">{t("admin.shell.online")}</span>
              </Link>
            )}
            <LanguageToggle tone="dark" />
            <ThemeToggle tone="dark" />
            {userName && (
              <span className="hidden md:flex items-center gap-2 pl-2 border-l border-white/10">
                <span className="w-8 h-8 rounded-full bg-accent-gold/20 text-accent-gold flex items-center justify-center text-sm font-bold uppercase">{userName.slice(0, 1)}</span>
                <span className="text-sm font-medium text-white max-w-[120px] truncate">{userName}</span>
              </span>
            )}
            <button onClick={signOut} title={t("admin.shell.signOut")} aria-label={t("admin.shell.signOut")} className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-rail-text hover:bg-white/10">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Phones and tablets: the same menu as a row that scrolls sideways. */}
        <nav className="lg:hidden flex gap-1 overflow-x-auto no-scrollbar px-3 pb-2">
          {offlineItems.map((item) => {
            const active = currentItem?.href === item.href;
            return (
              <Link key={item.id} href={item.href} aria-current={active ? "page" : undefined} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${active ? "bg-accent-gold text-rail" : "bg-white/5 text-rail-text"}`}>
                <item.icon className="w-4 h-4" />
                {t(`admin.nav.${item.id}.name`)}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="flex-1 overflow-y-auto print:overflow-visible">
        <div className="p-4 sm:p-6 print:p-0">
          {currentItem && (
            <div className="print:hidden mb-4 max-w-7xl mx-auto">
              <h1 className="text-lg sm:text-xl font-bold text-primary">{t(`admin.nav.${currentItem.id}.name`)}</h1>
              <p className="text-xs sm:text-sm text-text-muted">{t(`admin.nav.${currentItem.id}.desc`)}</p>
            </div>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}
