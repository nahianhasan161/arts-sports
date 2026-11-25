"use client";

import { Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { BadgePercent, Sparkles } from "lucide-react";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import { Ball } from "@/components/football/Ball";
import { ChipIcon } from "@/components/ui/ChipIcon";
import { NavScroller } from "@/components/layout/NavScroller";
import "./category-bar.css";

/** `key` is the shown text; `name` (English) picks the icon. */
export type NavItem = {
  kind: "custom" | "category" | "deal";
  name: string;
  key: MessageKey;
  href: string;
};

export function useNavLabel() {
  const { t } = useT();
  return (item: NavItem) => t(item.key);
}

export function NavIcon({ item, className = "w-4 h-4 shrink-0" }: { item: NavItem; className?: string }): ReactNode {
  if (item.kind === "custom") return <Sparkles className={className} />;
  if (item.kind === "deal") return <BadgePercent className={className} />;
  return <ChipIcon of={[item.name]} className={className} />;
}

/** Is `item` the page being looked at? */
function isCurrent(item: NavItem, pathname: string, search: string) {
  const [path, query = ""] = item.href.split("?");
  if (path !== pathname) return false;
  const now = new URLSearchParams(search);
  return Array.from(new URLSearchParams(query)).every(([k, v]) => {
    const value = now.get(k)?.toLowerCase();
    // The accessories category's own slug can be longer ("sports-accessories").
    return value === v || (k === "category" && !!value?.includes(v));
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
 * the page being looked at. The custom jersey button comes first.
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
        {custom && (
          <Link
            href={custom.href}
            aria-current={pathname === custom.href ? "page" : undefined}
            className="sp-btn sp-jersey shrink-0 h-9 font-display text-sm font-bold whitespace-nowrap inline-flex items-center gap-1.5"
          >
            <NavIcon item={custom} className="w-3.5 h-3.5" />
            {label(custom)}
          </Link>
        )}
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
            {links.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                data-kind={item.kind}
                aria-current={item.href === current ? "page" : undefined}
                className="as-catbar-link h-11 inline-flex items-center gap-1.5 px-3 font-display text-sm font-semibold whitespace-nowrap"
              >
                <NavIcon item={item} />
                {label(item)}
              </Link>
            ))}
            <span ref={ballRef} className="as-catbar-ball" aria-hidden>
              <Ball className="block w-full h-full" />
            </span>
          </div>
        </NavScroller>
      </div>
    </div>
  );
}
