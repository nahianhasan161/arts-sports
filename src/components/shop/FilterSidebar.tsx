"use client";

import { useT } from "@/i18n/client";
import { PriceFilter } from "@/components/shop/PriceFilter";
import { CategoryTree, BrandList, cardClass, headingClass, type ShopBrand } from "@/components/shop/CategoryTree";
import type { ShopFacets } from "@/lib/services/shop-query";

/**
 * The shop's filters, top to bottom in the order a shopper narrows down:
 * category → sub-category, brand, price, size, in stock. Each list only
 * appears when it has a choice to make. Driven by props: the page owns the
 * URL, this only reports what was tapped. What is switched on is shown as
 * chips above the grid, not here.
 */
interface FilterSidebarProps {
  facets: ShopFacets;
  /** Active category slug ("all" for none) and sub-category slug. */
  category: string;
  subCategory: string;
  onPickCategory: (category: string, sub: string) => void;
  brands: ShopBrand[];
  chosenBrands: string[];
  onToggleBrand: (slug: string) => void;
  sizes: string[];
  inStockOnly: boolean;
  priceMin?: number;
  priceMax?: number;
  onToggleSize: (size: string) => void;
  onToggleInStock: () => void;
  onPriceRange: (min: number | null, max: number | null) => void;
}

export function FilterSidebar({
  facets,
  category,
  subCategory,
  onPickCategory,
  brands,
  chosenBrands,
  onToggleBrand,
  sizes,
  inStockOnly,
  priceMin,
  priceMax,
  onToggleSize,
  onToggleInStock,
  onPriceRange,
}: FilterSidebarProps) {
  const { t } = useT();
  const priceOn = priceMin !== undefined || priceMax !== undefined;

  return (
    <aside className="w-full flex flex-col gap-space-base">
      <CategoryTree items={facets.categories} all={facets.all} active={category} activeSub={subCategory} onPick={onPickCategory} />

      <BrandList items={brands} chosen={chosenBrands} onToggle={onToggleBrand} />

      {(facets.priceBands.length > 0 || priceOn) && (
        <div className={cardClass}>
          <h2 className={headingClass}>{t("store.shop.ui.price")}</h2>
          <PriceFilter bands={facets.priceBands} min={priceMin} max={priceMax} onChange={onPriceRange} />
        </div>
      )}

      {/* Sizes or options, only those the products here come in */}
      {facets.sizes && (
        <div className={cardClass}>
          <h2 className={headingClass}>
            {t(facets.sizes.kind === "size" ? "store.shop.ui.size" : "store.shop.ui.option")}
          </h2>
          <div className={facets.sizes.kind === "size" ? "grid grid-cols-4 gap-x-1.5 gap-y-3 pt-1" : "flex flex-wrap gap-2 pt-1"}>
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
        </div>
      )}

      {/* In stock, when something here is sold out */}
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
            <span className={`sp-switch w-10 h-5 rounded-full p-0.5 transition-colors ${inStockOnly ? "bg-primary" : "bg-surface-container"}`}>
              <span className={`sp-knob block w-4 h-4 rounded-full transition-transform ${inStockOnly ? "translate-x-5" : "translate-x-0"}`} />
            </span>
          </button>
        </div>
      )}
    </aside>
  );
}
