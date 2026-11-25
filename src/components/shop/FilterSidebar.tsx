"use client";

import React, { useState } from "react";
import { Filter, X, ChevronUp, ChevronDown } from "lucide-react";
import { useT } from "@/i18n/client";
import { formatMoney } from "@/i18n";
import { PriceFilter } from "@/components/shop/PriceFilter";
import type { ShopFacets } from "@/lib/services/shop-query";

/**
 * Shop filters.
 *
 * This component used to read and write a zustand store, and took its
 * category list from the hardcoded CATEGORIES constant. That meant the
 * filters never reached the URL, so a filtered catalogue could not be
 * bookmarked or shared, and categories created in /admin/categories never
 * appeared here at all.
 *
 * It is now driven entirely by props: the parent page owns the URL and the
 * database, and this only reports intent back up.
 */

interface FilterSidebarProps {
  facets: ShopFacets;
  sizes: string[];
  inStockOnly: boolean;
  priceMin?: number;
  priceMax?: number;
  onToggleSize: (size: string) => void;
  onToggleInStock: () => void;
  onPriceRange: (min: number | null, max: number | null) => void;
  onReset: () => void;
  onCloseMobile?: () => void;
}

export function FilterSidebar({
  facets,
  sizes,
  inStockOnly,
  priceMin,
  priceMax,
  onToggleSize,
  onToggleInStock,
  onPriceRange,
  onReset,
  onCloseMobile,
}: FilterSidebarProps) {
  const { t, locale } = useT();
  const { priceRange } = facets;
  const money = (n: number) => formatMoney(n, locale);
  const [priceOpen, setPriceOpen] = useState(true);
  const [sizeOpen, setSizeOpen] = useState(true);

  const priceLabel =
    priceMin !== undefined && priceMax !== undefined
      ? `${money(priceMin)} – ${money(priceMax)}`
      : priceMax !== undefined
        ? t("store.shop.ui.upTo", { price: money(priceMax) })
        : priceMin !== undefined
          ? t("store.shop.ui.from", { price: money(priceMin) })
          : null;

  const hasActiveFilters =
    sizes.length > 0 ||
    priceLabel !== null ||
    inStockOnly;

  return (
    <aside className="w-full flex flex-col gap-space-base">
      {/* 1. Active Filters Box */}
      {hasActiveFilters && (
        <div className="bg-surface-card p-space-base rounded-lg border border-border-light shadow-sm flex flex-col gap-space-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Filter className="w-4 h-4 text-primary" />
              <span className="font-display uppercase tracking-wider text-xs font-bold text-primary">
                {t("store.shop.ui.activeFilters")}
              </span>
            </div>
            <button
              onClick={onReset}
              className="sp-btn sp-yellow py-1 text-xs font-bold uppercase"
            >
              {t("store.shop.ui.clearAll")}
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5 pt-1">
            {[
              ...sizes.map((s) => ({ key: `size-${s}`, text: t("store.shop.ui.sizeIs", { size: s }), off: () => onToggleSize(s) })),
              ...(priceLabel ? [{ key: "price", text: priceLabel, off: () => onPriceRange(null, null) }] : []),
              ...(inStockOnly ? [{ key: "stock", text: t("store.shop.ui.inStock"), off: onToggleInStock }] : []),
            ].map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={chip.off}
                aria-label={t("store.shop.ui.clearFilter", { name: chip.text })}
                className="inline-flex min-h-11 items-center gap-2 rounded border border-border-light bg-surface-subtle px-3 text-xs text-primary"
              >
                {chip.text}
                <X className="w-3.5 h-3.5" aria-hidden />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 2. Price sliders, when there is more than one price */}
      {priceRange && priceRange.max > priceRange.min && (
      <div className="bg-surface-card p-space-base rounded-lg border border-border-light shadow-sm flex flex-col gap-2">
        <button
          onClick={() => setPriceOpen(!priceOpen)}
          className="w-full flex items-center justify-between font-display text-xs font-bold uppercase tracking-wider text-primary"
        >
          <span>{t("store.shop.ui.price")} (৳)</span>
          {priceOpen ? (
            <span className="sp-ico sp-tennis sp-sm"><ChevronUp className="w-4 h-4" /></span>
          ) : (
            <span className="sp-ico sp-tennis sp-sm"><ChevronDown className="w-4 h-4" /></span>
          )}
        </button>

        {priceOpen && <PriceFilter range={priceRange} min={priceMin} max={priceMax} onChange={onPriceRange} />}
      </div>
      )}

      {/* 3. Sizes or options, only those the products here come in */}
      {facets.sizes && (
      <div className="bg-surface-card p-space-base rounded-lg border border-border-light shadow-sm flex flex-col gap-2">
        <button
          onClick={() => setSizeOpen(!sizeOpen)}
          className="w-full flex items-center justify-between font-display text-xs font-bold uppercase tracking-wider text-primary"
        >
          <span>{t(facets.sizes.kind === "size" ? "store.shop.ui.size" : "store.shop.ui.option")}</span>
          {sizeOpen ? (
            <span className="sp-ico sp-tennis sp-sm"><ChevronUp className="w-4 h-4" /></span>
          ) : (
            <span className="sp-ico sp-tennis sp-sm"><ChevronDown className="w-4 h-4" /></span>
          )}
        </button>

        {sizeOpen && (
          <div className={facets.sizes.kind === "size" ? "grid grid-cols-4 gap-x-1.5 gap-y-3 pt-2" : "flex flex-wrap gap-2 pt-2"}>
            {facets.sizes.values.map((size) => {
              const active = sizes.includes(size);
              return (
                <button
                  key={size}
                  onClick={() => onToggleSize(size)}
                  aria-pressed={active}
                  className={`sp-size ${active ? "sp-on" : ""} ${size.length > 3 ? "sp-option px-3" : "pt-1"} h-11 text-xs font-bold text-center`}
                >
                  {size}
                </button>
              );
            })}
          </div>
        )}
      </div>
      )}

      {/* 4. In stock, when something here is sold out */}
      {(facets.hasSoldOut || inStockOnly) && (
      <div className="bg-surface-card p-space-base rounded-lg border border-border-light shadow-sm flex items-center justify-between">
        <span className="font-display text-xs font-bold uppercase tracking-wider text-primary">
          {t("store.shop.ui.inStock")}
        </span>
        <button
          onClick={onToggleInStock}
          role="switch"
          aria-checked={inStockOnly}
          aria-label={t("store.shop.ui.inStock")}
          className="w-12 h-11 flex items-center justify-end"
        >
          <span
            className={`sp-switch w-10 h-5 rounded-full p-0.5 transition-colors ${
              inStockOnly ? "bg-primary" : "bg-surface-container"
            }`}
          >
            <span
              className={`sp-knob block w-4 h-4 rounded-full transition-transform ${
                inStockOnly ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </span>
        </button>
      </div>
      )}

      {onCloseMobile && (
        <button
          onClick={onCloseMobile}
          className="sp-btn sp-goal lg:hidden w-full py-3 font-display uppercase tracking-wider text-xs font-bold mt-2"
        >
          {t("store.shop.ui.showResults")}
        </button>
      )}
    </aside>
  );
}
