"use client";

import { useState } from "react";
import { Check, ChevronLeft, Search } from "lucide-react";
import { useT } from "@/i18n/client";
import type { ShopCategory } from "@/lib/services/shop-query";

export interface ShopBrand {
  slug: string;
  name: string;
  name_bn?: string | null;
  count: number;
}

type Named = { name: string; name_bn?: string | null };

/** Shared look of the sidebar filter cards. */
export const cardClass = "bg-surface-card p-space-base rounded-lg border border-border-light shadow-sm flex flex-col gap-1";
export const headingClass =
  "font-display text-xs font-bold uppercase tracking-wider text-primary pb-1.5 mb-1 border-b border-border-light";
export const rowClass = (on: boolean) =>
  `w-full min-h-11 md:min-h-9 flex items-center gap-2 rounded-md px-2 text-left text-sm transition-colors ${
    on ? "bg-surface-subtle font-bold text-primary" : "text-on-surface hover:bg-surface-subtle"
  }`;

/** How many products a click leads to. */
export function Count({ n }: { n: number }) {
  const { locale } = useT();
  return (
    <span className="ml-auto shrink-0 min-w-8 rounded-full bg-surface-subtle px-2 py-0.5 text-center text-xs tabular-nums text-on-surface-variant">
      {new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-IN").format(n)}
    </span>
  );
}

/** A tick box drawn in front of a row label. */
export function Tick({ on, round = false }: { on: boolean; round?: boolean }) {
  return (
    <span
      aria-hidden
      className={`grid h-4 w-4 shrink-0 place-items-center border ${round ? "rounded-full" : "rounded"} ${
        on ? "border-primary bg-primary text-on-primary" : "border-border-light"
      }`}
    >
      {on && <Check className="h-3 w-3" strokeWidth={3} />}
    </span>
  );
}

/**
 * The shop's category list. With nothing chosen it lists every category
 * (a sport such as Badminton, or a kind such as Jersey). Once one is open it
 * shows only that category and its sub-categories (Racket, Shuttlecock, Net),
 * with a way back to all. Only what has a product here is listed, with counts.
 */
export function CategoryTree({
  items,
  all,
  active,
  activeSub,
  onPick,
}: {
  items: ShopCategory[];
  all: number;
  active: string;
  /** Slug of the open sub-category, "" for none. */
  activeSub: string;
  /** Category slug ("all" for everything) and sub-category slug ("" for none). */
  onPick: (category: string, sub: string) => void;
}) {
  const { t, locale } = useT();
  const label = (c: Named) => (locale === "bn" && c.name_bn) || c.name;
  if (items.length === 0) return null;
  const current = items.find((c) => c.slug === active);
  // With nothing chosen and only one category here (e.g. under a sport), open it.
  const open = current ?? (items.length === 1 ? items[0] : undefined);
  const shown = current ? [current] : items;

  return (
    <nav aria-label={t("store.shop.ui.categories")} className={cardClass}>
      <h2 className={headingClass}>{t("store.shop.ui.categories")}</h2>
      <button type="button" onClick={() => onPick("all", "")} aria-pressed={!current} className={rowClass(!current)}>
        {current && <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden />}
        <span className="truncate">{t("store.shop.ui.allCategories")}</span>
        {!current && <Count n={all} />}
      </button>
      {shown.map((c) => (
        <div key={c.id}>
          <button
            type="button"
            onClick={() => onPick(c.slug, "")}
            aria-pressed={c === current && !activeSub}
            className={rowClass(c === current && !activeSub)}
          >
            <span className="truncate">{label(c)}</span>
            <Count n={c.count} />
          </button>
          {c === open && c.children.length > 0 && (
            <ul className="ml-3 border-l border-border-light pl-2 flex flex-col">
              {c.children.map((k) => {
                const on = activeSub === k.slug;
                return (
                  <li key={k.id}>
                    <button type="button" onClick={() => onPick(c.slug, on ? "" : k.slug)} aria-pressed={on} className={rowClass(on)}>
                      <span className="truncate">{label(k)}</span>
                      <Count n={k.count} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ))}
    </nav>
  );
}

/** Brands shown before "show more". */
const FIRST = 8;
/** From this many brands a search box helps. */
const SEARCH_FROM = 12;

/** Brands of the products here, most products first; several can be ticked. */
export function BrandList({ items, chosen, onToggle }: { items: ShopBrand[]; chosen: string[]; onToggle: (slug: string) => void }) {
  const { t, locale } = useT();
  const [more, setMore] = useState(false);
  const [find, setFind] = useState("");
  if (items.length === 0) return null;
  const name = (b: ShopBrand) => (locale === "bn" && b.name_bn) || b.name;
  const sorted = [...items].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const q = find.trim().toLowerCase();
  const matching = q ? sorted.filter((b) => b.name.toLowerCase().includes(q) || (b.name_bn ?? "").includes(find.trim())) : sorted;
  // Ticked brands always stay in view.
  const shown = more || q ? matching : matching.filter((b, i) => i < FIRST || chosen.includes(b.slug));
  const hidden = matching.length - shown.length;

  return (
    <div className={cardClass}>
      <h2 className={headingClass}>{t("store.shop.facets.brand")}</h2>
      {items.length >= SEARCH_FROM && (
        <label className="relative mb-1 block">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden />
          <input
            type="search"
            value={find}
            onChange={(e) => setFind(e.target.value)}
            placeholder={t("store.shop.ui.findBrand")}
            aria-label={t("store.shop.ui.findBrand")}
            className="w-full min-h-11 md:min-h-9 rounded-md border border-border-light bg-surface-subtle pl-8 pr-2 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </label>
      )}
      {shown.map((b) => {
        const on = chosen.includes(b.slug);
        return (
          <button key={b.slug} type="button" role="checkbox" aria-checked={on} onClick={() => onToggle(b.slug)} className={rowClass(on)}>
            <Tick on={on} />
            <span className="truncate">{name(b)}</span>
            <Count n={b.count} />
          </button>
        );
      })}
      {!q && (hidden > 0 || more) && (
        <button
          type="button"
          onClick={() => setMore(!more)}
          className="min-h-11 md:min-h-9 px-2 text-left text-sm font-semibold text-primary underline-offset-2 hover:underline"
        >
          {more ? t("store.shop.ui.showLess") : t("store.shop.ui.showMore", { count: hidden })}
        </button>
      )}
    </div>
  );
}
