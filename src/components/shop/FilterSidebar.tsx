"use client";

import React, { useState } from "react";
import { Filter, X, ChevronUp, ChevronDown } from "lucide-react";
import { useT } from "@/i18n/client";
import { formatMoney } from "@/i18n";
import { PriceFilter, type PriceRange } from "@/components/shop/PriceFilter";
import type { Category } from "@/types";

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

const SIZES = ["XS", "S", "M", "L", "XL", "XXL", "3XL"];

interface FilterSidebarProps {
  categories: Category[];
  category: string;
  subCategory: string;
  sizes: string[];
  inStockOnly: boolean;
  /** Cheapest and dearest product of the current category, search and team; null when there is none. */
  priceRange: PriceRange | null;
  priceMin?: number;
  priceMax?: number;
  onCategory: (category: string) => void;
  onSubCategory: (subCategory: string) => void;
  onToggleSize: (size: string) => void;
  onToggleInStock: () => void;
  onPriceRange: (min: number | null, max: number | null) => void;
  onReset: () => void;
  onCloseMobile?: () => void;
}

export function FilterSidebar({
  categories,
  category,
  subCategory,
  sizes,
  inStockOnly,
  priceRange,
  priceMin,
  priceMax,
  onCategory,
  onSubCategory,
  onToggleSize,
  onToggleInStock,
  onPriceRange,
  onReset,
  onCloseMobile,
}: FilterSidebarProps) {
  const { t, locale } = useT();
  const label = (c: Category) => (locale === "bn" && c.name_bn) || c.name;
  const money = (n: number) => formatMoney(n, locale);
  const [categoryOpen, setCategoryOpen] = useState(true);
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

  // The tree's top level is the parent categories; the currently selected
  // parent's children are the sub-categories offered as checkboxes.
  const parents = categories;
  const selected = categories.find((c) => c.slug === category || c.id === category);
  const children = selected?.children ?? [];
  const selectedSub = children.find((c) => c.name === subCategory);
  const categoryLabel = selected ? label(selected) : t("store.shop.ui.category");
  const subLabel = selectedSub ? label(selectedSub) : subCategory;

  const hasActiveFilters =
    (category !== "all" && category !== "") ||
    subCategory !== "" ||
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
              className="sp-btn sp-yellow py-1 text-[11px] font-bold uppercase"
            >
              {t("store.shop.ui.clearAll")}
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5 pt-1">
            {category && category !== "all" && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-surface-subtle text-primary border border-border-light rounded text-xs">
                <span>{categoryLabel}</span>
                <button onClick={() => onCategory("all")} aria-label={t("store.shop.ui.clearFilter", { name: categoryLabel })} className="sp-ico sp-red sp-xs">
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            )}

            {subCategory && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-surface-subtle text-primary border border-border-light rounded text-xs">
                <span>{subLabel}</span>
                <button onClick={() => onSubCategory("")} aria-label={t("store.shop.ui.clearFilter", { name: subLabel })} className="sp-ico sp-red sp-xs">
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            )}

            {sizes.map((s) => (
              <span
                key={s}
                className="inline-flex items-center gap-1 px-2 py-1 bg-surface-subtle text-primary border border-border-light rounded text-xs"
              >
                <span>{t("store.shop.ui.sizeIs", { size: s })}</span>
                <button onClick={() => onToggleSize(s)} aria-label={t("store.shop.ui.clearFilter", { name: s })} className="sp-ico sp-red sp-xs">
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}

            {priceLabel && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-surface-subtle text-primary border border-border-light rounded text-xs">
                <span>{priceLabel}</span>
                <button onClick={() => onPriceRange(null, null)} aria-label={t("store.shop.ui.clearFilter", { name: t("store.shop.ui.price") })} className="sp-ico sp-red sp-xs">
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            )}

            {inStockOnly && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-secondary-fixed text-on-surface rounded text-xs font-medium">
                <span>{t("store.shop.ui.inStock")}</span>
                <button onClick={onToggleInStock} aria-label={t("store.shop.ui.clearFilter", { name: t("store.shop.ui.inStock") })} className="sp-ico sp-red sp-xs">
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            )}
          </div>
        </div>
      )}

      {/* 2. Parent Categories */}
      <div className="bg-surface-card p-space-base rounded-lg border border-border-light shadow-sm flex flex-col gap-2">
        <button
          onClick={() => setCategoryOpen(!categoryOpen)}
          className="w-full flex items-center justify-between font-display text-xs font-bold uppercase tracking-wider text-primary"
        >
          <span>{t("store.shop.ui.categories")}</span>
          {categoryOpen ? (
            <span className="sp-ico sp-tennis sp-sm"><ChevronUp className="w-4 h-4" /></span>
          ) : (
            <span className="sp-ico sp-tennis sp-sm"><ChevronDown className="w-4 h-4" /></span>
          )}
        </button>

        {categoryOpen && (
          <div className="flex flex-col gap-2 pt-2 text-xs">
            <button
              onClick={() => onCategory("all")}
              className={`sp-nav flex items-center justify-between py-1.5 px-2 rounded transition-colors text-left [&>:first-child]:mr-auto ${
                !category || category === "all"
                  ? "bg-primary/10 text-primary font-bold"
                  : "hover:bg-surface-subtle text-on-surface-variant"
              }`}
            >
              <span>{t("store.shop.ui.allCategories")}</span>
            </button>
            {parents.map((item) => (
              <button
                key={item.id}
                onClick={() => onCategory(item.slug || item.id)}
                className={`sp-nav flex items-center justify-between py-1.5 px-2 rounded transition-colors text-left [&>:first-child]:mr-auto ${
                  category === item.slug || category === item.id
                    ? "bg-primary/10 text-primary font-bold"
                    : "hover:bg-surface-subtle text-on-surface-variant"
                }`}
              >
                <span>{label(item)}</span>
                {item.children && item.children.length > 0 && (
                  <span className="text-[10px] text-text-muted">{item.children.length.toLocaleString(locale === "bn" ? "bn-BD" : "en-IN")}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 3. Sub-categories of the selected parent */}
      {children.length > 0 && (
        <div className="bg-surface-card p-space-base rounded-lg border border-border-light shadow-sm flex flex-col gap-2">
          <span className="font-display text-xs font-bold uppercase tracking-wider text-primary">
            {t("store.shop.ui.subCategory")}
          </span>
          <div className="flex flex-col gap-1.5 pt-1 text-xs">
            {children.map((item) => (
              <label
                key={item.id}
                className="flex items-center gap-2 cursor-pointer hover:text-primary transition-colors text-on-surface-variant"
              >
                <input
                  type="checkbox"
                  checked={subCategory === item.name}
                  onChange={() => onSubCategory(subCategory === item.name ? "" : item.name)}
                  className="w-3.5 h-3.5 rounded text-primary focus:ring-0 border-border-light"
                />
                <span>{label(item)}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* 4. Price sliders, when there is more than one price */}
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

      {/* 5. Filter by Size */}
      <div className="bg-surface-card p-space-base rounded-lg border border-border-light shadow-sm flex flex-col gap-2">
        <button
          onClick={() => setSizeOpen(!sizeOpen)}
          className="w-full flex items-center justify-between font-display text-xs font-bold uppercase tracking-wider text-primary"
        >
          <span>{t("store.shop.ui.size")}</span>
          {sizeOpen ? (
            <span className="sp-ico sp-tennis sp-sm"><ChevronUp className="w-4 h-4" /></span>
          ) : (
            <span className="sp-ico sp-tennis sp-sm"><ChevronDown className="w-4 h-4" /></span>
          )}
        </button>

        {sizeOpen && (
          <div className="grid grid-cols-4 gap-x-1.5 gap-y-3 pt-2">
            {SIZES.map((size) => {
              const active = sizes.includes(size);
              return (
                <button
                  key={size}
                  onClick={() => onToggleSize(size)}
                  aria-pressed={active}
                  className={`sp-size ${active ? "sp-on" : ""} h-11 pt-1 text-xs font-bold text-center`}
                >
                  {size}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 6. In-Stock Filter */}
      <div className="bg-surface-card p-space-base rounded-lg border border-border-light shadow-sm flex items-center justify-between">
        <span className="font-display text-xs font-bold uppercase tracking-wider text-primary">
          {t("store.shop.ui.inStock")}
        </span>
        <button
          onClick={onToggleInStock}
          role="switch"
          aria-checked={inStockOnly}
          aria-label={t("store.shop.ui.inStock")}
          className={`sp-switch w-10 h-5 rounded-full p-0.5 transition-colors ${
            inStockOnly ? "bg-primary" : "bg-surface-container"
          }`}
        >
          <div
            className={`sp-knob w-4 h-4 rounded-full transition-transform ${
              inStockOnly ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>

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
