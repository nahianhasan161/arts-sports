"use client";

import React, { useState, useMemo, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Home, ChevronRight, SlidersHorizontal, ArrowUpDown } from "lucide-react";
import { ProductCard } from "@/components/product/ProductCard";
import { FilterSidebar } from "@/components/shop/FilterSidebar";
import type { Category, Product } from "@/types";
import type { CatalogTerm, TermType } from "@/lib/services/catalog";

const FACET_ORDER: [TermType, string][] = [
  ["team", "Team"],
  ["league", "League"],
  ["edition", "Edition"],
  ["season", "Season"],
  ["player", "Player"],
  ["brand", "Brand"],
];

interface ShopContentProps {
  products: Product[];
  total: number;
  categories: Category[];
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
  page: number;
  pageSize: number;
}

export function ShopContent({
  products,
  total,
  categories,
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
  page,
  pageSize,
}: ShopContentProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

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

  const filteredProducts = useMemo(() => {
    let list = [...products];
    if (dealsOnly) {
      list = list.filter((p) => (p.discount_percent ?? 0) > 0);
    }
    if (inStockOnly) {
      list = list.filter((p) =>
        p.sizes?.some((s) => (s.stock ?? 0) > 0) || (p.stock ?? 0) > 0
      );
    }
    if (priceMin !== undefined) {
      list = list.filter((p) => p.price >= priceMin);
    }
    if (priceMax !== undefined) {
      list = list.filter((p) => p.price <= priceMax);
    }
    return list;
  }, [products, dealsOnly, inStockOnly, priceMin, priceMax]);

  const heading = parentName
    ? `${parentName.toUpperCase()} COLLECTION`
    : query
      ? `SEARCH RESULTS`
      : "ALL COLLECTIONS";
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="w-full pb-space-3xl">
      {/* 1. Breadcrumbs & Category Hero Strip */}
      <section className="w-full bg-surface-card border-b border-border-light">
        <div className="max-w-container-max mx-auto px-space-base py-space-md">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-text-muted mb-3">
            <Link href="/" className="hover:text-primary transition-colors flex items-center gap-1">
              <Home className="w-3.5 h-3.5" />
              <span>Home</span>
            </Link>
            <ChevronRight className="w-3 h-3 opacity-40" />
            <Link href="/shop" className="hover:text-primary transition-colors">
              Shop
            </Link>
            <ChevronRight className="w-3 h-3 opacity-40" />
            <span className="font-bold text-primary">
              {parentName ?? (query ? `"${query}"` : "All Products")}
            </span>
          </nav>

          {/* Category Title & Metrics */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 pb-3">
            <div>
              <h1 className="font-display text-2xl sm:text-3xl uppercase text-primary tracking-wide font-bold">
                {heading}
              </h1>
              <p className="text-xs sm:text-sm text-text-muted mt-1 max-w-2xl">
                Engineered with certified combed compact organic cotton, tailored
                precision, and modern street aesthetics. Handcrafted for daylong
                comfort in tropical weather.
              </p>
            </div>

            {/* The count is the database's answer to this exact filter set,
                so it can never disagree with the grid below it. */}
            <div className="flex items-center gap-2 text-xs text-text-muted bg-surface-subtle px-3 py-1.5 rounded-lg border border-border-light self-start md:self-auto">
              <span className="w-2 h-2 rounded-full bg-secondary-container" />
              <span>
                Showing <strong className="text-on-surface font-bold">{filteredProducts.length}</strong> of{" "}
                <strong className="text-on-surface font-bold">{total}</strong> products
              </span>
            </div>
          </div>

          {/* Quick Sub-Category Chips */}
          {quickChips.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-2 pb-1 -mx-space-base px-space-base md:mx-0 md:px-0">
              {quickChips.map((chip) => (
                <button
                  key={chip}
                  onClick={() => setSubCategory(chip === subCategory ? "" : chip)}
                  className={`px-3 py-1.5 rounded text-xs font-display uppercase tracking-wider font-semibold whitespace-nowrap transition-colors border ${
                    subCategory === chip
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-surface-subtle hover:bg-surface-container text-on-surface border-border-light"
                  }`}
                >
                  {chip}
                </button>
              ))}
            </div>
          )}

          {/* Team, league, edition, season: each row only appears when the
              admin has created terms of that type. */}
          {FACET_ORDER.map(([type, label]) => {
            const list = terms.filter((t) => t.type === type);
            if (list.length === 0) return null;
            return (
              <div key={type} className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-2 -mx-space-base px-space-base md:mx-0 md:px-0">
                <span className="text-[10px] font-display font-bold uppercase tracking-widest text-text-muted shrink-0 w-14">
                  {label}
                </span>
                {list.map((t) => {
                  const active = (termSelection[type] ?? []).includes(t.slug);
                  return (
                    <button
                      key={t.id}
                      onClick={() => toggleTerm(type, t.slug)}
                      aria-pressed={active}
                      className={`px-3 py-1 rounded text-xs font-semibold whitespace-nowrap transition-colors border ${
                        active
                          ? "bg-primary text-primary-foreground border-primary shadow-sm"
                          : "bg-surface-subtle hover:bg-surface-container text-on-surface border-border-light"
                      }`}
                    >
                      {t.name_en}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </section>

      {/* 2. Editorial Spotlight Promo Banner */}
      <section className="max-w-container-max mx-auto px-space-base mt-space-md w-full">
        <div className="relative bg-primary-container text-white rounded-xl overflow-hidden shadow-md flex flex-col md:flex-row items-stretch">
          <div className="flex-1 p-space-lg md:p-space-xl flex flex-col justify-center relative z-10">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2 py-0.5 bg-secondary text-white rounded text-[10px] font-display font-bold uppercase tracking-widest">
                LIMITED DROP
              </span>
              <span className="text-secondary-fixed text-xs font-display uppercase font-bold tracking-wider">
                WORLD CUP SPECIAL RELEASE
              </span>
            </div>
            <h2 className="font-display text-2xl sm:text-3xl uppercase tracking-wide leading-tight font-bold">
              OFFICIAL &amp; FAN EDITION KITS
            </h2>
            <p className="text-on-primary-container text-xs sm:text-sm max-w-md mt-1 mb-4">
              Engineered lightweight moisture-wicking honeycomb Jacquard knit fabric.
              Official emblem detailing with reinforced 4-way stretch seams.
            </p>
            <div className="flex items-center gap-3">
              <Link
                href="/shop?category=sports"
                className="px-5 py-2.5 bg-secondary hover:bg-secondary-container hover:text-primary text-white font-display text-xs uppercase font-bold rounded transition-colors shadow-sm"
              >
                Shop Jerseys
              </Link>
              <span className="text-on-primary-container text-xs hidden sm:inline">
                Cash on delivery available nationwide
              </span>
            </div>
          </div>
          <div className="w-full md:w-1/2 relative min-h-[160px] md:min-h-[200px] bg-primary-container">
            <Image
              src="https://lh3.googleusercontent.com/aida/AEtjO1XtRs88VSBzdbMWQYRQuAY8CMk93-FpKuVlyb4a4idBDt95ROa-QuuKBaeOYjyhts6byy9S6RakXa0MkP45VJRbQ2P5ixraZTP7wBi2v4OfPwjYGUGEM0LLf24iv1Tpqz9ttMJnPF8M7Ka-yBomlyibQgY5rAYEVXaEn_pW9_nDIrkpdg5QXdDvVKNk968t2nuHE0zqs7YctPeS0kASeelv_7Pw3pI9gAFWPOAfM88aUoQ_7RVNdLPX6cs"
              alt="Official Match Edition Jersey"
              fill
              sizes="(max-width: 767px) 100vw, 50vw"
              className="object-cover opacity-90 hover:scale-105 transition-transform duration-700"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-primary-container via-transparent to-transparent hidden md:block" />
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

              <div className="text-xs text-text-muted hidden sm:block">
                Page <strong className="text-primary font-bold">{page}</strong> of{" "}
                <strong className="text-primary font-bold">{totalPages}</strong>
              </div>

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

            {filteredProducts.length === 0 ? (
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
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-space-sm sm:gap-space-md">
                  {filteredProducts.map((product) => (
                    <ProductCard key={product.id} product={product} />
                  ))}
                </div>

                {/* Pagination. Rendered from the server's total, so the last
                    page disappears exactly when the catalogue shrinks. */}
                {totalPages > 1 && (
                  <nav
                    className="flex items-center justify-center gap-2 pt-space-xl"
                    aria-label="Pagination"
                  >
                    <button
                      onClick={() => applyParams({ page: String(page - 1) }, false)}
                      disabled={page <= 1}
                      className="px-3 py-2 text-xs font-bold uppercase rounded-md border border-border-light bg-surface-card hover:bg-surface-subtle disabled:opacity-40 disabled:hover:bg-surface-card"
                    >
                      Previous
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter(
                        (p) =>
                          p === 1 ||
                          p === totalPages ||
                          Math.abs(p - page) <= 1
                      )
                      .map((p, i, arr) => (
                        <React.Fragment key={p}>
                          {i > 0 && arr[i - 1] !== p - 1 && (
                            <span className="px-1 text-text-muted">…</span>
                          )}
                          <button
                            onClick={() => applyParams({ page: String(p) }, false)}
                            aria-current={p === page ? "page" : undefined}
                            className={`w-9 h-9 text-xs font-bold rounded-md border transition-colors ${
                              p === page
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-surface-card border-border-light hover:bg-surface-subtle"
                            }`}
                          >
                            {p}
                          </button>
                        </React.Fragment>
                      ))}
                    <button
                      onClick={() => applyParams({ page: String(page + 1) }, false)}
                      disabled={page >= totalPages}
                      className="px-3 py-2 text-xs font-bold uppercase rounded-md border border-border-light bg-surface-card hover:bg-surface-subtle disabled:opacity-40 disabled:hover:bg-surface-card"
                    >
                      Next
                    </button>
                  </nav>
                )}
              </>
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
