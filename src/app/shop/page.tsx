import { Suspense } from "react";
import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import { getTerms } from "@/lib/services/catalog";
import { parseShopFilters, loadShop, termIdsOf } from "@/lib/services/shop-query";
import { ShopContent } from "./ShopContent";

/**
 * The catalogue page. The URL is the filter state. The first screenful of
 * products is rendered on the server; the rest load from /api/shop/products
 * as the shopper scrolls.
 */

/** About one screen: 4 columns x 3 rows on desktop, 2 x 6 on a phone. */
const PAGE_SIZE = 12;

/** Links of the old menu. There are no such categories any more, so they open the whole shop. */
const OLD_CATEGORIES = new Set(["men", "women", "kids", "sports"]);

type SearchParams = { [key: string]: string | string[] | undefined };

const SPORT_NAMES = { football: "Football", cricket: "Cricket", badminton: "Badminton" };

/** The published catalogue is public, so this page is indexed. */
export async function generateMetadata({ searchParams }: ShopPageProps): Promise<Metadata> {
  const { sport, dealsOnly } = parseShopFilters(await searchParams);
  const title = sport ? `${SPORT_NAMES[sport]} gear and jerseys` : dealsOnly ? "Offers" : "All products";
  return {
    title,
    description: sport
      ? `${SPORT_NAMES[sport]} jerseys and gear from Arts Sports. Delivery all over Bangladesh, cash on delivery.`
      : "Jerseys, sportswear and gear for football, cricket and badminton. Delivery all over Bangladesh, cash on delivery.",
    alternates: { canonical: sport ? `/shop?sport=${sport}` : dealsOnly ? "/shop?deals=true" : "/shop" },
  };
}

interface ShopPageProps {
  searchParams: Promise<SearchParams>;
}

export default async function ShopPage(props: ShopPageProps) {
  const params = await props.searchParams;
  const filters = parseShopFilters(params);
  const [shop, allTerms] = await Promise.all([loadShop(filters, PAGE_SIZE), getTerms()]);

  if (!shop.category && OLD_CATEGORIES.has(filters.category.toLowerCase())) {
    const keep = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (typeof v === "string" && k !== "category" && k !== "sub") keep.set(k, v);
    permanentRedirect(keep.size ? `/shop?${keep}` : "/shop");
  }

  const ids = await termIdsOf(shop.facets.productIds);
  const chosen = new Set(Object.values(filters.termSelection).flat());
  const terms = allTerms.filter((x) => ids.has(x.id) || chosen.has(x.slug));

  return (
    <Suspense fallback={null}>
      <ShopContent
        products={shop.products}
        total={shop.total}
        facets={{ ...shop.facets, productIds: [] }}
        terms={terms}
        termSelection={filters.termSelection}
        parent={shop.category ? { name: shop.category.name, name_bn: shop.category.name_bn } : null}
        category={shop.category ? shop.category.slug || shop.category.id : filters.category}
        subCategory={shop.subCategory}
        sport={filters.sport}
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
