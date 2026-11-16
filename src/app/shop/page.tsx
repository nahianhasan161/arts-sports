import { Suspense } from "react";
import type { Metadata } from "next";
import { getCategories } from "@/lib/services/products";
import { getTerms } from "@/lib/services/catalog";
import { parseShopFilters, loadShopProducts } from "@/lib/services/shop-query";
import { ShopContent } from "./ShopContent";
import { ProductGridSkeleton } from "@/components/shop/Skeletons";

/**
 * The catalogue page. The URL is the filter state. Only the first screenful
 * of products (and of categories) is rendered on the server; the rest load
 * from /api/shop/* as the shopper scrolls.
 */

/** About one screen: 4 columns x 3 rows on desktop, 2 x 6 on a phone. */
const PAGE_SIZE = 12;
const CATEGORY_PAGE = 10;

/** The published catalogue is public, so this page is indexed. */
export const metadata: Metadata = {
  title: "Shop All Collections",
  description:
    "Browse the full Arts Sports catalogue — men's polos, t-shirts and trousers, women's kurti and tops, kids' apparel, and sports jersey editions. Combed compact cotton, made for daylong comfort.",
  alternates: { canonical: "/shop" },
  openGraph: {
    title: "Shop All Collections | Arts Sports",
    description:
      "Browse the full Arts Sports catalogue — polos, t-shirts, trousers, kurti, kids' apparel and sports editions.",
    url: "/shop",
    type: "website",
  },
};

interface ShopPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function ShopPage(props: ShopPageProps) {
  const filters = parseShopFilters(await props.searchParams);
  const [{ products, total }, terms, categories] = await Promise.all([
    loadShopProducts(filters, 0, PAGE_SIZE, true),
    getTerms(),
    getCategories(),
  ]);
  const parent =
    filters.category !== "all"
      ? categories.find((c) => c.slug === filters.category || c.id === filters.category)
      : undefined;

  return (
    <Suspense
      fallback={
        <div className="max-w-container-max mx-auto px-space-base py-space-lg grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-space-sm sm:gap-space-md">
          <ProductGridSkeleton count={8} />
        </div>
      }
    >
      <ShopContent
        products={products}
        total={total ?? products.length}
        categories={categories}
        categoryStrip={categories.slice(0, CATEGORY_PAGE).map(({ id, slug, name }) => ({ id, slug, name }))}
        categoryHasMore={categories.length > CATEGORY_PAGE}
        terms={terms}
        termSelection={filters.termSelection}
        parentName={parent?.name}
        category={filters.category}
        subCategory={filters.subCategory}
        query={filters.query}
        sortBy={filters.sortBy}
        inStockOnly={filters.inStockOnly}
        dealsOnly={filters.dealsOnly}
        sizes={filters.sizes}
        priceMin={filters.priceMin}
        priceMax={filters.priceMax}
        pageSize={PAGE_SIZE}
      />
    </Suspense>
  );
}
