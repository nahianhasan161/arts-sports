"use client";

import React, { useState, useCallback, useTransition } from "react";
import { CategoryStrip } from "@/components/shop/CategoryStrip";
import { InfiniteProductGrid } from "@/components/shop/InfiniteProductGrid";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Home, ChevronRight, SlidersHorizontal, ArrowUpDown, X, Loader2 } from "lucide-react";
import { ChipIcon, TermIcon } from "@/components/ui/ChipIcon";
import { useT } from "@/i18n/client";
import { FilterSidebar } from "@/components/shop/FilterSidebar";
import { priceText } from "@/components/shop/PriceFilter";
import type { ShopBrand } from "@/components/shop/CategoryTree";
import type { ShopFacets } from "@/lib/services/shop-query";
import type { StoreSport } from "@/lib/sports";
import type { Product } from "@/types";
import type { CatalogTerm, TermType } from "@/lib/services/catalog";

/** Term rows above the grid. Brands are in the sidebar. */
const FACET_ORDER: TermType[] = ["team", "league", "edition", "season", "player"];

type Named = { name: string; name_bn?: string | null };

interface ShopContentProps {
  products: Product[];
  total: number;
  facets: ShopFacets;
  terms: CatalogTerm[];
  brands: ShopBrand[];
  termSelection: Partial<Record<TermType, string[]>>;
  parent: Named | null;
  /** Active category slug, "all" for none. */
  category: string;
  /** Active sub-category slug ("" for none) and its name. */
  subCategory: string;
  sub: Named | null;
  sport: StoreSport | null;
  query: string;
  sortBy: string;
  inStockOnly: boolean;
  dealsOnly: boolean;
  sizes: string[];
  priceMin?: number;
  priceMax?: number;
  pageSize: number;
}

export function ShopContent({
  products,
  total,
  facets,
  terms,
  brands,
  termSelection,
  parent,
  category,
  subCategory,
  sub,
  sport,
  query,
  sortBy,
  inStockOnly,
  dealsOnly,
  sizes,
  priceMin,
  priceMax,
  pageSize,
}: ShopContentProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t, locale } = useT();
  const label = (c: Named) => (locale === "bn" && c.name_bn) || c.name;
  const parentName = parent && label(parent);
  const subName = parent && sub ? label(sub) : null;
  const sportName = sport && t(`site.nav.${sport}`);
  const num = (n: number) => new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-IN").format(n);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [shown, setShown] = useState(products.length);
  // Each filter tap asks the server for the new list; until it arrives the
  // grid fades, so a tap never looks like it did nothing.
  const [pending, startTransition] = useTransition();

  /**
   * Filter state lives in the URL, so a shopper can bookmark or share a
   * filtered catalogue and the back button steps through it.
   */
  const go = useCallback(
    (href: string) => startTransition(() => router.push(href, { scroll: false })),
    [router]
  );
  const applyParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams?.toString() ?? "");
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === "" || value === "all") next.delete(key);
        else next.set(key, value);
      }
      // Any filter change invalidates the current page number.
      next.delete("page");
      const qs = next.toString();
      go(qs ? `/shop?${qs}` : "/shop");
    },
    [go, searchParams]
  );

  const pickCategory = useCallback(
    (next: string, nextSub: string) => applyParams({ category: next, sub: nextSub || null }),
    [applyParams]
  );
  const toggleSize = useCallback(
    (size: string) => {
      const next = sizes.includes(size) ? sizes.filter((s) => s !== size) : [...sizes, size];
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
  const toggleBrand = useCallback((slug: string) => toggleTerm("brand", slug), [toggleTerm]);
  const toggleInStock = useCallback(() => applyParams({ stock: inStockOnly ? null : "in" }), [applyParams, inStockOnly]);
  const setPriceRange = useCallback(
    (min: number | null, max: number | null) =>
      applyParams({ price_min: min === null ? null : String(min), price_max: max === null ? null : String(max) }),
    [applyParams]
  );
  /** Everything away: back to the whole shop. */
  const resetFilters = useCallback(() => go("/shop"), [go]);
  /** The chips away; the category, sport and search stay. */
  const clearFilters = useCallback(
    () =>
      applyParams({
        brand: null,
        ...Object.fromEntries(FACET_ORDER.map((type) => [type, null])),
        price_min: null,
        price_max: null,
        sizes: null,
        stock: null,
      }),
    [applyParams]
  );

  const chosenBrands = termSelection.brand ?? [];
  const brandName = (slug: string) => {
    const b = brands.find((x) => x.slug === slug);
    return b ? label(b) : slug;
  };
  const termName = (type: TermType, slug: string) => {
    const x = terms.find((term) => term.type === type && term.slug === slug);
    return x ? (locale === "bn" && x.name_bn) || x.name_en : slug;
  };
  const priceOn = priceMin !== undefined || priceMax !== undefined;

  /** What is switched on, as chips that take it off again. */
  const chips = [
    ...chosenBrands.map((b) => ({ key: `brand-${b}`, text: brandName(b), off: () => toggleBrand(b) })),
    ...FACET_ORDER.flatMap((type) =>
      (termSelection[type] ?? []).map((s) => ({ key: `${type}-${s}`, text: termName(type, s), off: () => toggleTerm(type, s) }))
    ),
    ...(priceOn ? [{ key: "price", text: priceText(t, locale, priceMin, priceMax, facets.priceBands.some((x) => x.min === priceMin && x.max === priceMax)), off: () => setPriceRange(null, null) }] : []),
    ...sizes.map((s) => ({ key: `size-${s}`, text: t("store.shop.ui.sizeIs", { size: s }), off: () => toggleSize(s) })),
    ...(inStockOnly ? [{ key: "stock", text: t("store.shop.ui.inStock"), off: toggleInStock }] : []),
  ];

  // Only sub-categories that have a product here.
  const subChips = facets.categories.find((c) => c.slug === category)?.children ?? [];
  const queryString = searchParams?.toString() ?? "";

  const heading = subName
    ? subName
    : parentName
      ? t("store.shop.collection", { name: parentName })
      : query
        ? t("store.shop.searchTitle", { q: query })
        : sportName
          ? sportName
          : dealsOnly
            ? t("site.nav.offers")
            : t("store.shop.allTitle");

  const sidebar = (
    <FilterSidebar
      facets={facets}
      category={category}
      subCategory={subCategory}
      onPickCategory={pickCategory}
      brands={brands}
      chosenBrands={chosenBrands}
      onToggleBrand={toggleBrand}
      sizes={sizes}
      inStockOnly={inStockOnly}
      priceMin={priceMin}
      priceMax={priceMax}
      onToggleSize={toggleSize}
      onToggleInStock={toggleInStock}
      onPriceRange={setPriceRange}
    />
  );

  return (
    <div className="w-full pb-space-3xl">
      {/* 1. Breadcrumbs, title, categories and facets */}
      <section className="w-full bg-surface-card as-mown border-b border-border-light">
        <div className="max-w-container-max mx-auto px-4 sm:px-6 pt-5 pb-4">
          <nav aria-label={t("store.shop.ui.breadcrumb")} className="flex flex-wrap items-center gap-x-1.5 text-xs text-text-muted mb-1 [&_a]:inline-flex [&_a]:min-h-11 md:[&_a]:min-h-8 [&_a]:items-center">
            <Link href="/" className="hover:text-on-surface transition-colors flex items-center gap-1">
              <Home className="w-3.5 h-3.5" />
              <span>{t("store.shop.home")}</span>
            </Link>
            <ChevronRight className="w-3 h-3 opacity-40" />
            <Link href="/shop" className="hover:text-on-surface transition-colors">
              {t("store.shop.shop")}
            </Link>
            <ChevronRight className="w-3 h-3 opacity-40" />
            {subName && parentName ? (
              <>
                <button type="button" onClick={() => pickCategory(category, "")} className="inline-flex min-h-11 md:min-h-8 items-center hover:text-on-surface transition-colors">
                  {parentName}
                </button>
                <ChevronRight className="w-3 h-3 opacity-40" />
                <span className="font-semibold text-on-surface">{subName}</span>
              </>
            ) : (
              <span className="font-semibold text-on-surface">{query && !parentName ? `“${query}”` : heading}</span>
            )}
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

          {/* Category chips for phones and tablets; on a wide screen the
              sidebar lists the categories, sub-categories and brands. */}
          {facets.categories.length > 1 || category !== "all" ? (
            <div className="lg:hidden">
              <CategoryStrip items={facets.categories} active={category} onSelect={(slug) => pickCategory(slug, "")} />
            </div>
          ) : null}

          {subChips.length > 0 && (
            <div className="lg:hidden flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-3 pb-1 -mx-4 px-4 md:mx-0 md:px-0">
              {subChips.map((chip) => (
                <button
                  key={chip.id}
                  onClick={() => pickCategory(category, chip.slug === subCategory ? "" : chip.slug)}
                  aria-pressed={subCategory === chip.slug}
                  className={`sp-chip ${subCategory === chip.slug ? "sp-on" : ""} min-h-11 shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap`}
                >
                  <ChipIcon of={[chip.name]} />
                  {label(chip)}
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
                <span className="text-xs font-bold uppercase tracking-wider text-text-muted shrink-0 w-16">
                  {t(`store.shop.facets.${type}`)}
                </span>
                {list.map((term) => {
                  const active = (termSelection[type] ?? []).includes(term.slug);
                  return (
                    <button
                      key={term.id}
                      onClick={() => toggleTerm(type, term.slug)}
                      aria-pressed={active}
                      className={`sp-chip ${active ? "sp-on" : ""} min-h-11 shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap`}
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

      {/* 2. Sidebar + product grid */}
      <section className="max-w-container-max mx-auto px-space-base py-space-lg w-full">
        <div className="flex flex-col lg:flex-row gap-space-xl items-start">
          <div className="hidden lg:block w-[280px] shrink-0">{sidebar}</div>

          <div className="flex-1 min-w-0 w-full">
            {/* Filters button (phones), what is switched on, sort */}
            <div className="bg-surface-card p-3 rounded-lg border border-border-light shadow-sm mb-space-base flex flex-wrap items-center gap-2">
              <button
                onClick={() => setMobileFilterOpen(true)}
                className="sp-btn sp-board lg:hidden whitespace-nowrap min-h-11 flex items-center gap-1.5 py-1.5 text-xs font-bold font-display uppercase tracking-wider"
              >
                <SlidersHorizontal className="w-4 h-4" />
                <span>{t("store.shop.ui.filters")}</span>
                {chips.length > 0 && (
                  <span className="grid min-w-5 h-5 place-items-center rounded-full bg-accent-gold px-1 text-xs text-black tabular-nums">
                    {num(chips.length)}
                  </span>
                )}
              </button>

              {chips.length > 0 && (
                <div className="order-last lg:order-none w-full lg:w-auto lg:flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto no-scrollbar lg:flex-wrap">
                  {chips.map((chip) => (
                    <button
                      key={chip.key}
                      type="button"
                      onClick={chip.off}
                      aria-label={t("store.shop.ui.clearFilter", { name: chip.text })}
                      className="inline-flex shrink-0 min-h-11 md:min-h-9 items-center gap-1.5 rounded-full border border-border-light bg-surface-subtle pl-3 pr-2 text-xs font-semibold text-on-surface hover:border-primary"
                    >
                      {chip.text}
                      <X className="w-3.5 h-3.5" aria-hidden />
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="shrink-0 min-h-11 md:min-h-9 px-2 text-xs font-bold text-primary underline underline-offset-2"
                  >
                    {t("store.shop.ui.clearAll")}
                  </button>
                </div>
              )}

              <div className="flex items-center gap-2 ml-auto min-w-0">
                {pending && (
                  <span role="status" className="flex items-center gap-1 text-xs text-text-muted">
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                    <span className="sr-only">{t("store.shop.ui.loading")}</span>
                  </span>
                )}
                <span className="text-xs text-text-muted font-medium flex items-center gap-1">
                  <ArrowUpDown className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{t("store.shop.ui.sortBy")}:</span>
                </span>
                <select
                  value={sortBy}
                  onChange={(e) => applyParams({ sort: e.target.value })}
                  aria-label={t("store.shop.ui.sortBy")}
                  className="min-w-0 bg-surface-subtle border border-border-light text-primary text-sm font-bold rounded-md px-2.5 min-h-11 focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                >
                  <option value="newest">{t("store.shop.ui.sortNewest")}</option>
                  <option value="popular">{t("store.shop.ui.sortPopular")}</option>
                  <option value="price_asc">{t("store.shop.ui.sortPriceAsc")}</option>
                  <option value="price_desc">{t("store.shop.ui.sortPriceDesc")}</option>
                </select>
              </div>
            </div>

            <div aria-busy={pending} className={`transition-opacity ${pending ? "opacity-50 pointer-events-none" : ""}`}>
              {products.length === 0 || (shown === 0 && products.length >= total) ? (
                <div className="bg-surface-card rounded-xl border border-border-light p-12 text-center flex flex-col items-center justify-center">
                  <h3 className="font-display text-lg uppercase font-bold text-primary mb-1">
                    {t(queryString ? "store.shop.ui.noMatchTitle" : "store.shop.ui.noneTitle")}
                  </h3>
                  <p className="text-xs text-text-muted max-w-sm mb-4">
                    {t(queryString ? "store.shop.ui.noMatchText" : "store.shop.ui.noneText")}
                  </p>
                  <button onClick={resetFilters} className="sp-btn sp-yellow py-2 font-display text-xs uppercase font-bold">
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
                  onCount={setShown}
                />
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Filters drawer on phones and tablets */}
      {mobileFilterOpen && (
        <div className="fixed inset-0 z-[60] overflow-hidden lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileFilterOpen(false)} />
          <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-xs bg-surface-card flex flex-col">
              <div className="flex items-center gap-2 p-4 pb-3 border-b border-border-light">
                <h3 className="font-display uppercase text-sm font-bold text-primary">{t("store.shop.ui.filters")}</h3>
                {chips.length > 0 && (
                  <button type="button" onClick={clearFilters} className="min-h-11 px-2 text-xs font-bold text-primary underline underline-offset-2">
                    {t("store.shop.ui.clearAll")}
                  </button>
                )}
                <button onClick={() => setMobileFilterOpen(false)} className="sp-ico sp-red sp-lg ml-auto" aria-label={t("store.shop.ui.closeFilters")}>
                  ✕
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">{sidebar}</div>
              <div className="p-4 pt-3 border-t border-border-light pb-[max(1rem,env(safe-area-inset-bottom))]">
                <button
                  onClick={() => setMobileFilterOpen(false)}
                  className="sp-btn sp-goal w-full py-3 font-display uppercase tracking-wider text-xs font-bold flex items-center justify-center gap-2"
                >
                  {pending && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
                  {t("store.shop.ui.showCount", { count: num(total) })}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
