"use client";

import React, { useState, useMemo, useCallback } from "react";
import { CategoryStrip } from "@/components/shop/CategoryStrip";
import { InfiniteProductGrid } from "@/components/shop/InfiniteProductGrid";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Home, ChevronRight, SlidersHorizontal, ArrowUpDown } from "lucide-react";
import { ChipIcon, TermIcon } from "@/components/ui/ChipIcon";
import { useT } from "@/i18n/client";
import { FilterSidebar } from "@/components/shop/FilterSidebar";
import type { PriceRange } from "@/components/shop/PriceFilter";
import type { Category, Product } from "@/types";
import type { CatalogTerm, TermType } from "@/lib/services/catalog";

const FACET_ORDER: TermType[] = ["team", "league", "edition", "season", "player", "brand"];

interface ShopContentProps {
  products: Product[];
  total: number;
  categories: Category[];
  categoryStrip: { id: string; slug: string; name: string; name_bn?: string | null }[];
  categoryHasMore: boolean;
  terms: CatalogTerm[];
  termSelection: Partial<Record<TermType, string[]>>;
  parent?: Category;
  category: string;
  subCategory: string;
  query: string;
  sortBy: string;
  inStockOnly: boolean;
  dealsOnly: boolean;
  sizes: string[];
  priceRange: PriceRange | null;
  priceMin?: number;
  priceMax?: number;
  pageSize: number;
}

export function ShopContent({
  products,
  total,
  categories,
  categoryStrip,
  categoryHasMore,
  terms,
  termSelection,
  parent,
  category,
  subCategory,
  query,
  sortBy,
  inStockOnly,
  dealsOnly,
  sizes,
  priceRange,
  priceMin,
  priceMax,
  pageSize,
}: ShopContentProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t, locale } = useT();
  const label = (c: { name: string; name_bn?: string | null }) => (locale === "bn" && c.name_bn) || c.name;
  const parentName = parent && label(parent);
  const num = (n: number) => new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-IN").format(n);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [shown, setShown] = useState(products.length);

  /**
   * Filter state lives in the URL, so a shopper can bookmark or share a
   * filtered catalogue and the back button steps through it. This component
   * used to keep the same state in a zustand store, which meant the address
   * bar never described what was on screen.
   */
  const applyParams = useCallback(
    (patch: Record<string, string | null>, resetPage = true) => {
      const next = new URLSearchParams(searchParams?.toString() ?? "");
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === "" || value === "all") {
          next.delete(key);
        } else {
          next.set(key, value);
        }
      }
      // Any filter change invalidates the current page number.
      if (resetPage) next.delete("page");
      const qs = next.toString();
      router.push(qs ? `/shop?${qs}` : "/shop", { scroll: false });
    },
    [router, searchParams]
  );

  const setCategory = useCallback(
    (next: string) => applyParams({ category: next, sub: null }),
    [applyParams]
  );
  const setSubCategory = useCallback(
    (next: string) => applyParams({ sub: next || null }),
    [applyParams]
  );
  const toggleSize = useCallback(
    (size: string) => {
      const next = sizes.includes(size)
        ? sizes.filter((s) => s !== size)
        : [...sizes, size];
      applyParams({ sizes: next.length > 0 ? next.join(",") : null });
    },
    [applyParams, sizes]
  );
  const toggleTerm = useCallback(
    (type: TermType, slug: string) => {
      const current = termSelection[type] ?? [];
      const next = current.includes(slug) ? current.filter((s) => s !== slug) : [...current, slug];
      applyParams({ [type]: next.length > 0 ? next.join(",") : null });
    },
    [applyParams, termSelection]
  );
  const toggleInStock = useCallback(
    () => applyParams({ stock: inStockOnly ? null : "in" }),
    [applyParams, inStockOnly]
  );
  const setPriceRange = useCallback(
    (min: number | null, max: number | null) =>
      applyParams({ price_min: min === null ? null : String(min), price_max: max === null ? null : String(max) }),
    [applyParams]
  );
  const resetFilters = useCallback(() => router.push("/shop"), [router]);

  // Sub-category chips come from the database tree, falling back to the
  // catalogue's own sub_category values so a product tagged with something
  // the category tree has not caught up with is still reachable.
  const quickChips = useMemo(() => {
    const fromTree = (parent?.children ?? []).map((c) => c.name);
    const fromProducts = products
      .map((p) => p.sub_category)
      .filter((v): v is string => Boolean(v));
    const all = new Set([...fromTree, ...fromProducts]);
    return Array.from(all).sort((a, b) => a.localeCompare(b));
  }, [parent, products]);

  // The chips carry the stored (English) name, which is what the URL filters by.
  const subNames = useMemo(
    () => new Map(categories.flatMap((c) => c.children ?? []).map((c) => [c.name, c])),
    [categories]
  );

  // Price, size and the term filters run in the query; deals and in-stock
  // are checked here on each loaded batch.
  const clientFilter = useCallback(
    (p: Product) =>
      (!dealsOnly || (p.discount_percent ?? 0) > 0) &&
      // With sizes chosen, one of those sizes has to be in stock.
      (!inStockOnly ||
        p.sizes?.some((s) => (s.stock ?? 0) > 0 && (sizes.length === 0 || sizes.includes(s.size))) ||
        (sizes.length === 0 && (p.stock ?? 0) > 0)),
    [dealsOnly, inStockOnly, sizes]
  );
  const queryString = searchParams?.toString() ?? "";

  const heading = parentName
    ? t("store.shop.collection", { name: parentName })
    : query
      ? t("store.shop.searchTitle", { q: query })
      : t("store.shop.allTitle");

  return (
    <div className="w-full pb-space-3xl">
      {/* 1. Breadcrumbs, title, categories and facets */}
      <section className="w-full bg-surface-card as-mown border-b border-border-light">
        <div className="max-w-container-max mx-auto px-4 sm:px-6 pt-5 pb-4">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-text-muted mb-4">
            <Link href="/" className="hover:text-on-surface transition-colors flex items-center gap-1">
              <Home className="w-3.5 h-3.5" />
              <span>{t("store.shop.home")}</span>
            </Link>
            <ChevronRight className="w-3 h-3 opacity-40" />
            <Link href="/shop" className="hover:text-on-surface transition-colors">
              {t("store.shop.shop")}
            </Link>
            <ChevronRight className="w-3 h-3 opacity-40" />
            <span className="font-semibold text-on-surface">
              {parentName ?? (query ? `“${query}”` : t("store.shop.allProducts"))}
            </span>
          </nav>

          <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 pb-4">
            <div className="flex flex-col gap-1.5">
              <h1 className="font-display text-3xl sm:text-4xl uppercase text-on-surface tracking-tight font-bold leading-none">
                {heading}
              </h1>
              <p className="text-sm text-text-muted max-w-2xl">{t("store.shop.subtitle")}</p>
            </div>

            {/* The count is the database's answer to this exact filter set,
                so it can never disagree with the grid below it. */}
            <div className="flex items-center gap-2 text-xs text-on-surface-variant bg-surface-subtle px-3 py-1.5 rounded-full border border-border-light self-start md:self-auto tabular-nums">
              <span className="w-2 h-2 rounded-full bg-accent-gold" />
              {t("store.shop.showing", { shown: num(shown), total: num(total) })}
            </div>
          </div>

          {/* Top-level categories: scroll sideways, more load at the end. */}
          <CategoryStrip
            initial={categoryStrip}
            initialHasMore={categoryHasMore}
            active={category}
            onSelect={setCategory}
          />

          {/* Quick Sub-Category Chips */}
          {quickChips.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-3 pb-1 -mx-4 px-4 md:mx-0 md:px-0">
              {quickChips.map((chip) => (
                <button
                  key={chip}
                  onClick={() => setSubCategory(chip === subCategory ? "" : chip)}
                  className={`sp-chip ${subCategory === chip ? "sp-on" : ""} h-8 shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap`}
                >
                  <ChipIcon of={[chip]} />
                  {label(subNames.get(chip) ?? { name: chip })}
                </button>
              ))}
            </div>
          )}

          {/* Team, league, edition, season: each row only appears when the
              admin has created terms of that type. */}
          {FACET_ORDER.map((type) => {
            const list = terms.filter((x) => x.type === type);
            if (list.length === 0) return null;
            return (
              <div key={type} className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-2.5 -mx-4 px-4 md:mx-0 md:px-0">
                <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted shrink-0 w-16">
                  {t(`store.shop.facets.${type}`)}
                </span>
                {list.map((term) => {
                  const active = (termSelection[type] ?? []).includes(term.slug);
                  return (
                    <button
                      key={term.id}
                      onClick={() => toggleTerm(type, term.slug)}
                      aria-pressed={active}
                      className={`sp-chip ${active ? "sp-on" : ""} h-8 shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap`}
                    >
                      <TermIcon type={type} />
                      {(locale === "bn" && term.name_bn) || term.name_en}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </section>

      {/* 2. Main Catalog Shell: Sidebar + Product Grid */}
      <section className="max-w-container-max mx-auto px-space-base py-space-lg w-full">
        <div className="flex flex-col lg:flex-row gap-space-xl items-start">
          <div className="hidden lg:block w-[280px] shrink-0">
            <FilterSidebar
              categories={categories}
              category={category}
              subCategory={subCategory}
              sizes={sizes}
              inStockOnly={inStockOnly}
              priceRange={priceRange}
              priceMin={priceMin}
              priceMax={priceMax}
              onCategory={setCategory}
              onSubCategory={setSubCategory}
              onToggleSize={toggleSize}
              onToggleInStock={toggleInStock}
              onPriceRange={setPriceRange}
              onReset={resetFilters}
            />
          </div>

          <div className="flex-1 min-w-0 w-full">
            <div className="bg-surface-card p-3 rounded-lg border border-border-light shadow-sm mb-space-base flex items-center justify-between gap-2">
              <button
                onClick={() => setMobileFilterOpen(true)}
                className="sp-btn sp-board lg:hidden whitespace-nowrap min-h-9 flex items-center gap-1.5 py-1.5 text-xs font-bold font-display uppercase tracking-wider"
              >
                <SlidersHorizontal className="w-4 h-4" />
                <span>{t("store.shop.ui.filters")}</span>
              </button>


              <div className="flex items-center gap-2 ml-auto min-w-0">
                <span className="text-xs text-text-muted font-medium flex items-center gap-1">
                  <ArrowUpDown className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{t("store.shop.ui.sortBy")}:</span>
                </span>
                <select
                  value={sortBy}
                  onChange={(e) => applyParams({ sort: e.target.value })}
                  aria-label={t("store.shop.ui.sortBy")}
                  className="min-w-0 bg-surface-subtle border border-border-light text-primary text-xs font-bold rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                >
                  <option value="newest">{t("store.shop.ui.sortNewest")}</option>
                  <option value="popular">{t("store.shop.ui.sortPopular")}</option>
                  <option value="price_asc">{t("store.shop.ui.sortPriceAsc")}</option>
                  <option value="price_desc">{t("store.shop.ui.sortPriceDesc")}</option>
                </select>
              </div>
            </div>

            {products.length === 0 || (shown === 0 && products.length >= total) ? (
              <div className="bg-surface-card rounded-xl border border-border-light p-12 text-center flex flex-col items-center justify-center">
                <h3 className="font-display text-lg uppercase font-bold text-primary mb-1">
                  {t(queryString ? "store.shop.ui.noMatchTitle" : "store.shop.ui.noneTitle")}
                </h3>
                <p className="text-xs text-text-muted max-w-sm mb-4">
                  {t(queryString ? "store.shop.ui.noMatchText" : "store.shop.ui.noneText")}
                </p>
                <button
                  onClick={resetFilters}
                  className="sp-btn sp-yellow py-2 font-display text-xs uppercase font-bold"
                >
                  {t("store.shop.ui.reset")}
                </button>
              </div>
            ) : (
              <InfiniteProductGrid
                key={queryString}
                initial={products}
                total={total}
                queryString={queryString}
                pageSize={pageSize}
                filter={clientFilter}
                onCount={setShown}
              />
            )}
          </div>
        </div>
      </section>

      {/* Mobile Filter Modal */}
      {mobileFilterOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden lg:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileFilterOpen(false)}
          />
          <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-xs bg-surface-card p-4 overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-border-light mb-4">
                <h3 className="font-display uppercase text-sm font-bold text-primary">
                  {t("store.shop.ui.filters")}
                </h3>
                <button
                  onClick={() => setMobileFilterOpen(false)}
                  className="sp-ico sp-red sp-sm"
                  aria-label={t("store.shop.ui.closeFilters")}
                >
                  ✕
                </button>
              </div>
              <FilterSidebar
                categories={categories}
                category={category}
                subCategory={subCategory}
                sizes={sizes}
                inStockOnly={inStockOnly}
                priceRange={priceRange}
                priceMin={priceMin}
                priceMax={priceMax}
                onCategory={(c) => {
                  setCategory(c);
                  setMobileFilterOpen(false);
                }}
                onSubCategory={setSubCategory}
                onToggleSize={toggleSize}
                onToggleInStock={toggleInStock}
                onPriceRange={setPriceRange}
                onReset={() => {
                  resetFilters();
                  setMobileFilterOpen(false);
                }}
                onCloseMobile={() => setMobileFilterOpen(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
