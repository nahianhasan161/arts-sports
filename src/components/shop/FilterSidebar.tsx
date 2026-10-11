"use client";

import React, { useState } from "react";
import { Filter, X, ChevronUp, ChevronDown } from "lucide-react";
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

const PRICE_MIN = 150;
const PRICE_MAX = 5500;

const SIZES = ["XS", "S", "M", "L", "XL", "XXL", "3XL"];

interface FilterSidebarProps {
  categories: Category[];
  category: string;
  subCategory: string;
  sizes: string[];
  inStockOnly: boolean;
  priceMin?: number;
  priceMax?: number;
  onCategory: (category: string) => void;
  onSubCategory: (subCategory: string) => void;
  onToggleSize: (size: string) => void;
  onToggleInStock: () => void;
  onPriceRange: (min: number, max: number) => void;
  onReset: () => void;
  onCloseMobile?: () => void;
}

export function FilterSidebar({
  categories,
  category,
  subCategory,
  sizes,
  inStockOnly,
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
  const [categoryOpen, setCategoryOpen] = useState(true);
  const [priceOpen, setPriceOpen] = useState(true);
  const [sizeOpen, setSizeOpen] = useState(true);

  const min = priceMin ?? PRICE_MIN;
  const max = priceMax ?? PRICE_MAX;

  // The tree's top level is the parent categories; the currently selected
  // parent's children are the sub-categories offered as checkboxes.
  const parents = categories;
  const children = categories.find((c) => c.slug === category || c.id === category)?.children ?? [];

  const hasActiveFilters =
    (category !== "all" && category !== "") ||
    subCategory !== "" ||
    sizes.length > 0 ||
    max < PRICE_MAX ||
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
                Active Filters
              </span>
            </div>
            <button
              onClick={onReset}
              className="text-[11px] font-bold text-badge-discount hover:underline uppercase"
            >
              Clear All
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5 pt-1">
            {category && category !== "all" && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-surface-subtle text-primary border border-border-light rounded text-xs">
                <span>Category</span>
                <button onClick={() => onCategory("all")} aria-label="Clear category filter">
                  <X className="w-3 h-3 hover:text-badge-discount" />
                </button>
              </span>
            )}

            {subCategory && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-surface-subtle text-primary border border-border-light rounded text-xs">
                <span>{subCategory}</span>
                <button onClick={() => onSubCategory("")} aria-label="Clear sub-category filter">
                  <X className="w-3 h-3 hover:text-badge-discount" />
                </button>
              </span>
            )}

            {sizes.map((s) => (
              <span
                key={s}
                className="inline-flex items-center gap-1 px-2 py-1 bg-surface-subtle text-primary border border-border-light rounded text-xs"
              >
                <span>Size: {s}</span>
                <button onClick={() => onToggleSize(s)} aria-label={`Clear size ${s}`}>
                  <X className="w-3 h-3 hover:text-badge-discount" />
                </button>
              </span>
            ))}

            {max < PRICE_MAX && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-surface-subtle text-primary border border-border-light rounded text-xs">
                <span>Up to ৳ {max}</span>
                <button onClick={() => onPriceRange(PRICE_MIN, PRICE_MAX)} aria-label="Clear price filter">
                  <X className="w-3 h-3 hover:text-badge-discount" />
                </button>
              </span>
            )}

            {inStockOnly && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-secondary-fixed text-on-surface rounded text-xs font-medium">
                <span>In Stock Only</span>
                <button onClick={onToggleInStock} aria-label="Clear stock filter">
                  <X className="w-3 h-3 hover:text-badge-discount" />
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
          <span>Category Tree</span>
          {categoryOpen ? (
            <ChevronUp className="w-4 h-4 text-text-muted" />
          ) : (
            <ChevronDown className="w-4 h-4 text-text-muted" />
          )}
        </button>

        {categoryOpen && (
          <div className="flex flex-col gap-2 pt-2 text-xs">
            <button
              onClick={() => onCategory("all")}
              className={`flex items-center justify-between py-1.5 px-2 rounded transition-colors text-left ${
                !category || category === "all"
                  ? "bg-primary/10 text-primary font-bold"
                  : "hover:bg-surface-subtle text-on-surface-variant"
              }`}
            >
              <span>All Categories</span>
            </button>
            {parents.map((item) => (
              <button
                key={item.id}
                onClick={() => onCategory(item.slug || item.id)}
                className={`flex items-center justify-between py-1.5 px-2 rounded transition-colors text-left ${
                  category === item.slug || category === item.id
                    ? "bg-primary/10 text-primary font-bold"
                    : "hover:bg-surface-subtle text-on-surface-variant"
                }`}
              >
                <span>{item.name}</span>
                {item.children && item.children.length > 0 && (
                  <span className="text-[10px] text-text-muted">{item.children.length}</span>
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
            Sub-Category
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
                <span>{item.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* 4. Price Range (BDT) Slider */}
      <div className="bg-surface-card p-space-base rounded-lg border border-border-light shadow-sm flex flex-col gap-2">
        <button
          onClick={() => setPriceOpen(!priceOpen)}
          className="w-full flex items-center justify-between font-display text-xs font-bold uppercase tracking-wider text-primary"
        >
          <span>Price Range (BDT)</span>
          {priceOpen ? (
            <ChevronUp className="w-4 h-4 text-text-muted" />
          ) : (
            <ChevronDown className="w-4 h-4 text-text-muted" />
          )}
        </button>

        {priceOpen && (
          <div className="pt-2">
            <div className="flex justify-between text-xs font-semibold text-secondary mb-2">
              <span>৳ {PRICE_MIN}</span>
              <span className="font-bold text-primary">৳ {max.toLocaleString()}</span>
              <span>৳ {PRICE_MAX.toLocaleString()}</span>
            </div>

            <input
              type="range"
              min={PRICE_MIN}
              max={PRICE_MAX}
              step={50}
              value={max}
              onChange={(e) => onPriceRange(min, Number(e.target.value))}
              aria-label="Maximum price"
              className="w-full h-1.5 bg-surface-container rounded-lg appearance-none cursor-pointer accent-primary"
            />

            <input
              type="range"
              min={PRICE_MIN}
              max={PRICE_MAX}
              step={50}
              value={min}
              onChange={(e) =>
                onPriceRange(
                  Math.min(Number(e.target.value), max - 50),
                  max
                )
              }
              aria-label="Minimum price"
              className="w-full h-1.5 bg-surface-container rounded-lg appearance-none cursor-pointer accent-primary mt-2"
            />

            <div className="flex items-center justify-between gap-2 mt-3 text-xs">
              <div className="flex-1 bg-surface-subtle px-2 py-1.5 rounded border border-border-light">
                <span className="text-[10px] text-text-muted block">Min</span>
                <span className="font-bold text-primary">৳ {min.toLocaleString()}</span>
              </div>
              <span className="text-text-muted">-</span>
              <div className="flex-1 bg-surface-subtle px-2 py-1.5 rounded border border-border-light">
                <span className="text-[10px] text-text-muted block">Max</span>
                <span className="font-bold text-primary">৳ {max.toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 5. Filter by Size */}
      <div className="bg-surface-card p-space-base rounded-lg border border-border-light shadow-sm flex flex-col gap-2">
        <button
          onClick={() => setSizeOpen(!sizeOpen)}
          className="w-full flex items-center justify-between font-display text-xs font-bold uppercase tracking-wider text-primary"
        >
          <span>Filter by Size</span>
          {sizeOpen ? (
            <ChevronUp className="w-4 h-4 text-text-muted" />
          ) : (
            <ChevronDown className="w-4 h-4 text-text-muted" />
          )}
        </button>

        {sizeOpen && (
          <div className="grid grid-cols-4 gap-1.5 pt-2">
            {SIZES.map((size) => {
              const active = sizes.includes(size);
              return (
                <button
                  key={size}
                  onClick={() => onToggleSize(size)}
                  aria-pressed={active}
                  className={`py-2 rounded text-xs font-bold transition-all text-center border ${
                    active
                      ? "bg-primary text-white border-primary shadow-sm"
                      : "bg-surface-subtle hover:bg-surface-container text-on-surface border-border-light"
                  }`}
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
          In Stock Only
        </span>
        <button
          onClick={onToggleInStock}
          role="switch"
          aria-checked={inStockOnly}
          aria-label="In stock only"
          className={`w-10 h-5 rounded-full p-0.5 transition-colors ${
            inStockOnly ? "bg-primary" : "bg-surface-container"
          }`}
        >
          <div
            className={`w-4 h-4 rounded-full bg-white transition-transform ${
              inStockOnly ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {onCloseMobile && (
        <button
          onClick={onCloseMobile}
          className="lg:hidden w-full py-3 bg-primary text-white font-display uppercase tracking-wider text-xs font-bold rounded-lg mt-2"
        >
          Show Results
        </button>
      )}
    </aside>
  );
}
