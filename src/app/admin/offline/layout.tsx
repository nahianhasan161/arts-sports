"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronLeft, ChevronRight, LogOut, ShoppingBag, Store } from "lucide-react";
import { useT } from "@/i18n/client";
import PageSkeleton from "@/components/ui/PageSkeleton";
import { LanguageToggle, ThemeToggle } from "@/components/layout/Preferences";
import { BUY, OFFLINE, OFFLINE_MENU_GROUP, ONLINE, REGISTER, type GroupId, type NavItem } from "@/components/admin/nav";
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
  if (pathname === REGISTER || pathname === BUY) return <>{children}</>;
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
            {barEntries(offlineItems).map((entry) =>
              "group" in entry ? (
                <MenuGroup key={entry.group} group={entry.group} items={entry.items} currentHref={currentItem?.href} />
              ) : (
                <Link key={entry.id} href={entry.href} aria-current={currentItem?.href === entry.href ? "page" : undefined} className={`${entry.id === "purchases" ? "ml-auto " : ""}${barLink(currentItem?.href === entry.href)}`}>
                  {t(`admin.nav.${entry.id}.name`)}
                </Link>
              ),
            )}
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

        {/* Phones and tablets: the same menu as a row that scrolls sideways (arrows for mouse users). */}
        <ScrollRow className="lg:hidden" activeKey={currentItem?.href}>
          {offlineItems.map((item) => {
            const active = currentItem?.href === item.href;
            return (
              <Link key={item.id} href={item.href} data-active={active || undefined} aria-current={active ? "page" : undefined} className={`inline-flex flex-shrink-0 items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${active ? "bg-accent-gold text-rail" : "bg-white/5 text-rail-text"}`}>
                <item.icon className="w-4 h-4" />
                {t(`admin.nav.${item.id}.name`)}
              </Link>
            );
          })}
        </ScrollRow>
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

type BarEntry = NavItem | { group: GroupId; items: NavItem[] };

/** Bar order: plain items stay put; grouped ones collect at their group's first item. */
function barEntries(items: NavItem[]): BarEntry[] {
  const out: BarEntry[] = [];
  const groups = new Map<GroupId, NavItem[]>();
  for (const item of items) {
    const g = OFFLINE_MENU_GROUP[item.id];
    if (!g) {
      out.push(item);
      continue;
    }
    const list = groups.get(g);
    if (list) list.push(item);
    else {
      const fresh = [item];
      groups.set(g, fresh);
      out.push({ group: g, items: fresh });
    }
  }
  // A group with a single visible item is just a link.
  return out.map((e) => ("group" in e && e.items.length === 1 ? e.items[0] : e));
}

function barLink(active: boolean) {
  return `px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${active ? "bg-white/10 text-white" : "text-rail-text/80 hover:bg-rail-hover hover:text-white"}`;
}

function MenuGroup({ group, items, currentHref }: { group: GroupId; items: NavItem[]; currentHref?: string }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = items.some((i) => i.href === currentHref);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={`${barLink(active)} inline-flex items-center gap-1`}>
        {t(`admin.groups.${group}`)}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 min-w-[220px] rounded-xl border border-white/10 bg-rail p-1 shadow-xl">
          {items.map((item) => {
            const on = item.href === currentHref;
            return (
              <Link key={item.id} href={item.href} aria-current={on ? "page" : undefined} onClick={() => setOpen(false)} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium ${on ? "bg-white/10 text-white" : "text-rail-text/80 hover:bg-rail-hover hover:text-white"}`}>
                <item.icon className="w-4 h-4" />
                {t(`admin.nav.${item.id}.name`)}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * A sideways-scrolling row. The scrollbar is hidden, so arrow buttons appear
 * at whichever edge has more items, the mouse wheel scrolls it sideways, and
 * the active item is brought into view.
 */
function ScrollRow({ children, className = "", activeKey }: { children: React.ReactNode; className?: string; activeKey?: string }) {
  const { t } = useT();
  const ref = useRef<HTMLElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setEdges({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: false });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      el.removeEventListener("wheel", onWheel);
      ro.disconnect();
    };
  }, []);

  useEffect(() => {
    const active = ref.current?.querySelector<HTMLElement>("[data-active]");
    active?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [activeKey]);

  const step = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.7, behavior: "smooth" });
  const arrow = "absolute top-0 bottom-2 z-10 flex items-center px-1 text-white from-rail via-rail to-transparent";

  return (
    <div className={`relative ${className}`}>
      <nav ref={ref} className="flex gap-1 overflow-x-auto no-scrollbar px-3 pb-2">
        {children}
      </nav>
      {edges.left && (
        <button type="button" onClick={() => step(-1)} aria-label={t("admin.shell.scrollLeft")} className={`${arrow} left-0 pr-4 bg-gradient-to-r`}>
          <ChevronLeft className="w-5 h-5" />
        </button>
      )}
      {edges.right && (
        <button type="button" onClick={() => step(1)} aria-label={t("admin.shell.scrollRight")} className={`${arrow} right-0 pl-4 bg-gradient-to-l`}>
          <ChevronRight className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}
