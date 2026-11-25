"use client";

import { Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { BadgePercent, Flame, PackagePlus, Sparkles, Star } from "lucide-react";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import { Ball } from "@/components/football/Ball";
import { AllIcon, ChipIcon } from "@/components/ui/ChipIcon";
import { NavScroller } from "@/components/layout/NavScroller";
import "./category-bar.css";

/** `key` is translated; names from the database show `name_bn` in Bangla when there is one. */
export type NavItem = {
  kind: "all" | "custom" | "category" | "collection" | "deal";
  name: string;
  name_bn?: string | null;
  slug?: string;
  key?: MessageKey;
  href: string;
};

export function useNavLabel() {
  const { t, locale } = useT();
  return (item: NavItem) => (item.key ? t(item.key) : (locale === "bn" && item.name_bn) || item.name);
}

export function NavIcon({ item, className = "w-4 h-4 shrink-0" }: { item: NavItem; className?: string }): ReactNode {
  if (item.kind === "all") return <AllIcon className={className} />;
  if (item.kind === "custom") return <Sparkles className={className} />;
  if (item.kind === "deal") return <BadgePercent className={className} />;
  if (item.kind === "collection") {
    const words = `${item.slug ?? ""} ${item.name} ${item.href}`.toLowerCase();
    const Icon = /\b(new|newest)\b/.test(words) ? PackagePlus : /best|top|popular/.test(words) ? Flame : Star;
    return <Icon className={className} />;
  }
  return <ChipIcon of={[item.slug, item.name, item.name_bn]} className={className} />;
}

/** Is `item` the page being looked at? A category can be in the URL by name or by slug. */
function isCurrent(item: NavItem, pathname: string, search: string) {
  const [path, query = ""] = item.href.split("?");
  if (path !== pathname) return false;
  const now = new URLSearchParams(search);
  if (item.kind === "all") return !["category", "sort", "deals", "q"].some((k) => now.get(k) && now.get(k) !== "all");
  return Array.from(new URLSearchParams(query)).every(([k, v]) => {
    const value = now.get(k)?.toLowerCase();
    return value === v.toLowerCase() || (k === "category" && !!item.slug && value === item.slug.toLowerCase());
  });
}

/** Reads the query apart from the bar, so static pages still render the bar on the server. */
function SearchWatch({ onChange }: { onChange: (search: string) => void }) {
  const search = useSearchParams().toString();
  useEffect(() => onChange(search), [search, onChange]);
  return null;
}

/**
 * The header's category row on large screens. The touchline under it is the
 * pitch: a football rolls along it to the link under the pointer and back to
 * the page being looked at. The custom jersey button stays at the end.
 */
export function CategoryBar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const label = useNavLabel();
  const [search, setSearch] = useState("");
  const rowRef = useRef<HTMLDivElement>(null);
  const ballRef = useRef<HTMLSpanElement>(null);

  const links = items.filter((i) => i.kind !== "custom");
  const custom = items.find((i) => i.kind === "custom");
  const current = links.find((i) => isCurrent(i, pathname, search))?.href;

  const roll = useCallback((to?: HTMLElement | null) => {
    const row = rowRef.current;
    const ball = ballRef.current;
    if (!row || !ball) return;
    const target = to ?? row.querySelector<HTMLElement>('[aria-current="page"]');
    const r = ball.offsetWidth / 2;
    // Off the start of the row when there is nothing to stand under.
    const x = target ? target.offsetLeft + target.offsetWidth / 2 - r : -24;
    ball.style.transform = `translateX(${x}px) rotate(${x / (r || 6)}rad)`;
  }, []);

  // Goes to the current link, again when the links change width (fonts, language).
  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    roll();
    const ro = new ResizeObserver(() => roll());
    ro.observe(row);
    return () => ro.disconnect();
  }, [current, items, roll]);

  useEffect(() => {
    const row = rowRef.current;
    const view = row?.closest("nav");
    const link = row?.querySelector<HTMLElement>('[aria-current="page"]');
    if (view && link) view.scrollLeft = link.offsetLeft + link.offsetWidth / 2 - view.clientWidth / 2;
  }, [current, items]);

  const linkAt = (e: React.SyntheticEvent) => (e.target as HTMLElement).closest<HTMLElement>("a");

  return (
    <div className="hidden lg:block bg-surface-card border-t border-border-light">
      <Suspense fallback={null}>
        <SearchWatch onChange={setSearch} />
      </Suspense>
      <div className="max-w-container-max mx-auto px-space-base h-11 flex items-center gap-4">
        <NavScroller>
          <div
            ref={rowRef}
            className="as-catbar relative flex items-center w-max"
            onMouseOver={(e) => {
              const a = linkAt(e);
              if (a) roll(a);
            }}
            onMouseLeave={() => roll()}
            onFocus={(e) => roll(linkAt(e))}
            onBlur={() => roll()}
          >
            {links.map((item, i) => {
              const first = i > 0 && group(item) !== group(links[i - 1]);
              return (
                <div key={item.href} className="contents">
                  {first && <span className="mx-2 h-4 w-px bg-border-light shrink-0" aria-hidden />}
                  <Link
                    href={item.href}
                    data-kind={item.kind}
                    aria-current={item.href === current ? "page" : undefined}
                    className="as-catbar-link h-11 inline-flex items-center gap-1.5 px-2.5 font-display text-[13px] font-semibold whitespace-nowrap"
                  >
                    <NavIcon item={item} />
                    {label(item)}
                  </Link>
                </div>
              );
            })}
            <span ref={ballRef} className="as-catbar-ball" aria-hidden>
              <Ball className="block w-full h-full" />
            </span>
          </div>
        </NavScroller>
        {custom && (
          <Link
            href={custom.href}
            aria-current={pathname === custom.href ? "page" : undefined}
            className="sp-btn sp-jersey shrink-0 h-9 font-display text-[13px] font-bold whitespace-nowrap inline-flex items-center gap-1.5"
          >
            <NavIcon item={custom} className="w-3.5 h-3.5" />
            {label(custom)}
          </Link>
        )}
      </div>
    </div>
  );
}

/** A thin line goes between: everything | categories | collections and deals. */
function group(item: NavItem) {
  return item.kind === "deal" ? "collection" : item.kind;
}
