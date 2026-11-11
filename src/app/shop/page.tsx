import { Suspense } from "react";
import type { Metadata } from "next";
import { getProducts, getProductsCount, getCategories } from "@/lib/services/products";
import { getTerms, resolveTermProductIds, TERM_TYPES, type TermType } from "@/lib/services/catalog";
import { ShopContent } from "./ShopContent";

/**
 * The catalogue page.
 *
 * This used to import PRODUCTS from mock-data and filter in the browser, so
 * the page showed the same 12 sample rows no matter what an admin published,
 * priced, or removed. Every product the admin panel manages was invisible
 * here, and a shopper who added one of the mock items to a bag reached a
 * checkout that resolved no matching stock row and dead-ended.
 *
 * It is now a server component: the URL is the filter state, getProducts()
 * reads the database, and the client receives only the rows it renders.
 */

const PAGE_SIZE = 24;

const SORTS = new Set(["newest", "popular", "price_asc", "price_desc"]);

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

function first(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" ? v : Array.isArray(v) ? v[0] : undefined;
}

export default async function ShopPage(props: ShopPageProps) {
  const searchParams = await props.searchParams;
  const category = first(searchParams.category) ?? "all";
  const query = first(searchParams.q) ?? first(searchParams.search) ?? "";
  const subCategory = first(searchParams.sub) ?? "";
  const sortBy = SORTS.has(first(searchParams.sort) ?? "")
    ? (first(searchParams.sort) as string)
    : "newest";
  const inStockOnly = first(searchParams.stock) === "in";
  const dealsOnly = first(searchParams.deals) === "true";
  const priceMin = first(searchParams.price_min);
  const priceMax = first(searchParams.price_max);
  const sizes = first(searchParams.sizes)
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const page = Math.max(1, Number(first(searchParams.page) ?? "1") || 1);

  // Team / league / season / edition / brand / player filters: comma-separated
  // slugs per type in the URL, resolved to the product ids they match.
  const termSelection: Partial<Record<TermType, string[]>> = {};
  for (const type of TERM_TYPES) {
    const slugs = first(searchParams[type])
      ?.split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (slugs && slugs.length > 0) termSelection[type] = slugs;
  }
  const [productIds, terms] = await Promise.all([resolveTermProductIds(termSelection), getTerms()]);

  const [products, total, categories] = await Promise.all([
    getProducts({
      category,
      subCategory: subCategory || undefined,
      search: query || undefined,
      sizes: sizes && sizes.length > 0 ? sizes : undefined,
      sortBy,
      productIds: productIds ?? undefined,
      // The grid applies the size, price and stock predicates the query
      // builder does not understand, so fetch a generous page and filter
      // it. The count below is the authoritative total.
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    getProductsCount({
      category,
      subCategory: subCategory || undefined,
      search: query || undefined,
      productIds: productIds ?? undefined,
    }),
    getCategories(),
  ]);

  const parent =
    category && category !== "all"
      ? categories.find((c) => c.slug === category || c.id === category)
      : undefined;

  return (
    <Suspense
      fallback={
        <div className="max-w-container-max mx-auto px-space-base py-24 text-center">
          <div className="inline-block w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="mt-3 text-xs text-text-muted font-display uppercase tracking-wider">
            Loading collection...
          </p>
        </div>
      }
    >
      <ShopContent
        products={products}
        total={total}
        categories={categories}
        terms={terms}
        termSelection={termSelection}
        parentName={parent?.name}
        category={category}
        subCategory={subCategory}
        query={query}
        sortBy={sortBy}
        inStockOnly={inStockOnly}
        dealsOnly={dealsOnly}
        sizes={sizes ?? []}
        priceMin={priceMin ? Number(priceMin) : undefined}
        priceMax={priceMax ? Number(priceMax) : undefined}
        page={page}
        pageSize={PAGE_SIZE}
      />
    </Suspense>
  );
}
