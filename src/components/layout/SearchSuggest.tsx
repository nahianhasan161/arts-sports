"use client";

import { useEffect, useState } from "react";
import { HoverLink as Link } from "@/components/ui/HoverLink";
import { useT } from "@/i18n/client";
import { formatMoney, localized } from "@/i18n";

type Item = {
  slug: string;
  title: string;
  title_bn: string | null;
  price: number;
  regular_price: number | null;
  image: string | null;
  full: string | null;
};

/**
 * Products that match what is typed in the header search, under the box.
 * Waits 250 ms after the last key so typing does not send a request per letter.
 */
export function SearchSuggest({ query, open, onPick }: { query: string; open: boolean; onPick: () => void }) {
  const { t, locale } = useT();
  const [state, setState] = useState<{ q: string; items: Item[]; total: number } | null>(null);
  const q = query.trim();

  useEffect(() => {
    if (q.length < 2) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/shop/suggest?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : { items: [], total: 0 }))
        .then((d: { items: Item[]; total: number }) => setState({ q, items: d.items ?? [], total: d.total ?? 0 }))
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q]);

  if (!open || q.length < 2) return null;
  const fresh = state?.q === q;

  return (
    <div
      role="listbox"
      aria-label={t("site.header.search")}
      className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-border-light bg-surface-card shadow-xl"
    >
      {!fresh ? (
        <p className="px-4 py-3 text-sm text-on-surface-variant">{t("site.header.suggestLoading")}</p>
      ) : state.items.length === 0 ? (
        <p className="px-4 py-3 text-sm text-on-surface-variant">{t("site.header.suggestNone", { q })}</p>
      ) : (
        <>
          <ul className="max-h-[60vh] overflow-y-auto py-1">
            {state.items.map((item) => (
              <li key={item.slug}>
                <Link
                  href={`/products/${item.slug}`}
                  onClick={onPick}
                  className="flex items-center gap-3 px-3 py-2 hover:bg-surface-container focus:bg-surface-container focus:outline-none"
                >
                  <span className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-surface-container">
                    {item.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.image}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                        onError={(e) => {
                          if (item.full && e.currentTarget.src !== new URL(item.full, location.href).href) e.currentTarget.src = item.full;
                        }}
                      />
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-on-surface">{localized(item, "title", locale)}</span>
                    <span className="text-sm font-bold text-primary">{formatMoney(item.price, locale)}</span>
                    {item.regular_price && item.regular_price > item.price ? (
                      <span className="ml-2 text-xs text-on-surface-variant line-through">{formatMoney(item.regular_price, locale)}</span>
                    ) : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href={`/shop?q=${encodeURIComponent(q)}`}
            onClick={onPick}
            className="block border-t border-border-light px-4 py-2.5 text-center text-sm font-semibold text-primary hover:bg-surface-container"
          >
            {t("site.header.suggestAll", { n: new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-IN").format(state.total) })}
          </Link>
        </>
      )}
    </div>
  );
}
