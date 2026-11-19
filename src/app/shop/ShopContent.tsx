"use client";

import React, { useState, useMemo, useCallback } from "react";
import { CategoryStrip } from "@/components/shop/CategoryStrip";
import { InfiniteProductGrid } from "@/components/shop/InfiniteProductGrid";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Home, ChevronRight, SlidersHorizontal, ArrowUpDown, ArrowRight, Sparkles } from "lucide-react";
import { useT } from "@/i18n/client";
import { JerseyPreview } from "@/components/custom-jersey/JerseyPreview";
import { FilterSidebar } from "@/components/shop/FilterSidebar";
import type { Category, Product } from "@/types";
import type { CatalogTerm, TermType } from "@/lib/services/catalog";

const FACET_ORDER: TermType[] = ["team", "league", "edition", "season", "player", "brand"];

interface ShopContentProps {
  products: Product[];
  total: number;
  categories: Category[];
  categoryStrip: { id: string; slug: string; name: string }[];
  categoryHasMore: boolean;
  terms: CatalogTerm[];
  termSelection: Partial<Record<TermType, string[]>>;
  parentName?: string;
  category: string;
  subCategory: string;
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
  categories,
  categoryStrip,
  categoryHasMore,
  terms,
  termSelection,
  parentName,
  category,
  subCategory,
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
    (min: number, max: number) =>
      applyParams({ price_min: String(min), price_max: String(max) }),
    [applyParams]
  );
  const resetFilters = useCallback(() => router.push("/shop"), [router]);

  // Sub-category chips come from the database tree, falling back to the
  // catalogue's own sub_category values so a product tagged with something
  // the category tree has not caught up with is still reachable.
  const quickChips = useMemo(() => {
    const parent = categories.find((c) => c.slug === category || c.id === category);
    const fromTree = (parent?.children ?? []).map((c) => c.name);
    const fromProducts = products
      .map((p) => p.sub_category)
      .filter((v): v is string => Boolean(v));
    const all = new Set([...fromTree, ...fromProducts]);
    return Array.from(all).sort((a, b) => a.localeCompare(b));
  }, [categories, category, products]);

  // Price, size and the term filters run in the query; deals and in-stock
  // are checked here on each loaded batch.
  const clientFilter = useCallback(
    (p: Product) =>
      (!dealsOnly || (p.discount_percent ?? 0) > 0) &&
      (!inStockOnly || p.sizes?.some((s) => (s.stock ?? 0) > 0) || (p.stock ?? 0) > 0),
    [dealsOnly, inStockOnly]
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
      <section className="w-full bg-surface-card border-b border-border-light">
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
                  className={`h-8 px-3.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors border ${
                    subCategory === chip
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-surface-card hover:border-on-surface-variant/50 text-on-surface border-border-light"
                  }`}
                >
                  {chip}
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
                      className={`h-8 px-3.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors border ${
                        active
                          ? "bg-accent-gold text-white border-accent-gold shadow-sm"
                          : "bg-surface-card hover:border-on-surface-variant/50 text-on-surface border-border-light"
                      }`}
                    >
                      {term.name_en}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </section>

      {/* 2. Custom jersey promo: the shop's own product, drawn rather than a remote photo. */}
      <section className="max-w-container-max mx-auto px-4 sm:px-6 mt-5 w-full">
        <div className="relative overflow-hidden rounded-2xl bg-primary-container text-white shadow-md">
          <div className="absolute inset-0 as-pitch-lines" aria-hidden />
          <div className="absolute -top-24 -right-16 w-72 h-72 rounded-full bg-accent-gold/30 blur-3xl" aria-hidden />
          <div className="relative grid md:grid-cols-[1.4fr_1fr] items-center gap-4 p-5 sm:p-8">
            <div className="flex flex-col gap-2.5">
              <span className="self-start inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 border border-white/15 text-[11px] font-bold uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5 text-accent-gold" />
                {t("store.banner.eyebrow")}
              </span>
              <h2 className="font-display text-2xl sm:text-4xl uppercase font-bold leading-tight">{t("store.banner.title")}</h2>
              <p className="text-sm text-white/80 max-w-lg">{t("store.banner.text")}</p>
              <div className="flex flex-wrap gap-2.5 pt-2">
                <Link
                  href="/custom-jersey#order"
                  className="h-11 px-5 rounded-xl bg-accent-gold text-white font-display text-xs uppercase font-bold tracking-wider inline-flex items-center gap-2 hover:brightness-110 transition"
                >
                  {t("store.banner.cta")}
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  href="/custom-jersey/gallery"
                  className="h-11 px-5 rounded-xl bg-white/10 border border-white/25 text-white font-display text-xs uppercase font-bold tracking-wider inline-flex items-center hover:bg-white/20 transition"
                >
                  {t("store.banner.cta2")}
                </Link>
              </div>
            </div>
            <div className="relative hidden md:flex items-center justify-center h-48" aria-hidden>
              <JerseyPreview pattern="stripes" colors={["#b91c1c", "#111827", "#ffffff"]} side="front" teamName="DHAKA FC" number="7" className="absolute left-[8%] h-40 w-auto -rotate-12 opacity-90 drop-shadow-2xl" />
              <JerseyPreview pattern="sash" colors={["#0f2a4a", "#c89b3c", "#ffffff"]} side="back" name="RAHIM" number="10" className="relative h-48 w-auto rotate-6 drop-shadow-[0_25px_35px_rgba(0,0,0,0.5)]" />
            </div>
          </div>
        </div>
      </section>

      {/* 3. Main Catalog Shell: Sidebar + Product Grid */}
      <section className="max-w-container-max mx-auto px-space-base py-space-lg w-full">
        <div className="flex flex-col lg:flex-row gap-space-xl items-start">
          <div className="hidden lg:block w-[280px] shrink-0">
            <FilterSidebar
              categories={categories}
              category={category}
              subCategory={subCategory}
              sizes={sizes}
              inStockOnly={inStockOnly}
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

          <div className="flex-1 w-full">
            <div className="bg-surface-card p-3 rounded-lg border border-border-light shadow-sm mb-space-base flex items-center justify-between">
              <button
                onClick={() => setMobileFilterOpen(true)}
                className="lg:hidden flex items-center gap-1.5 px-3 py-1.5 bg-surface-subtle hover:bg-surface-container rounded-md text-xs font-bold font-display uppercase tracking-wider text-primary border border-border-light"
              >
                <SlidersHorizontal className="w-4 h-4" />
                <span>Filters &amp; Specs</span>
              </button>


              <div className="flex items-center gap-2 ml-auto">
                <span className="text-xs text-text-muted font-medium flex items-center gap-1">
                  <ArrowUpDown className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Sort by:</span>
                </span>
                <select
                  value={sortBy}
                  onChange={(e) => applyParams({ sort: e.target.value })}
                  aria-label="Sort by"
                  className="bg-surface-subtle border border-border-light text-primary text-xs font-bold rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                >
                  <option value="newest">Newest Arrivals</option>
                  <option value="popular">Best Selling / Popular</option>
                  <option value="price_asc">Price: Low to High</option>
                  <option value="price_desc">Price: High to Low</option>
                </select>
              </div>
            </div>

            {products.length === 0 || (shown === 0 && products.length >= total) ? (
              <div className="bg-surface-card rounded-xl border border-border-light p-12 text-center flex flex-col items-center justify-center">
                <h3 className="font-display text-lg uppercase font-bold text-primary mb-1">
                  {total === 0 ? "No products published yet" : "No products found"}
                </h3>
                <p className="text-xs text-text-muted max-w-sm mb-4">
                  {total === 0
                    ? "The catalogue is empty. Check back soon — new arrivals are added regularly."
                    : "We couldn't find any apparel matching your active filters. Try adjusting your size or price range."}
                </p>
                <button
                  onClick={resetFilters}
                  className="px-5 py-2 bg-primary text-primary-foreground font-display text-xs uppercase font-bold rounded-md"
                >
                  Reset All Filters
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
                  Filter Products
                </h3>
                <button
                  onClick={() => setMobileFilterOpen(false)}
                  className="p-1 text-text-muted hover:text-primary"
                  aria-label="Close filters"
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
