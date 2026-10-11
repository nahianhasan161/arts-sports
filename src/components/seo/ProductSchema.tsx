import type { Product } from "@/types";
import { getServerUrl } from "@/lib/config";

interface ProductSchemaProps {
  product: Product;
}

/**
 * Product structured data for a detail page.
 *
 * Two changes from the previous version, both policy-facing:
 *
 * 1. aggregateRating is gone. products.rating and products.reviews_count are
 *    numbers on the row, but the store has no reviews table, no review form
 *    and no review display — nothing produces or backs those figures.
 *    Google's policy requires structured review data to reflect real reviews,
 *    and a manual action for misleading markup is exactly the kind of penalty
 *    a young storefront cannot recover its search traffic from. Emitting no
 *    rating is always safe; emitting an invented one is not.
 *
 * 2. availability is derived from the stock that actually exists rather than
 *    being hardcoded InStock. Claiming in-stock on an out-of-stock product
 *    produces a rich result for something a shopper cannot buy.
 */
export function ProductSchema({ product }: ProductSchemaProps) {
  const inStock = product.sizes?.some((s) => (s.stock ?? 0) > 0) || (product.stock ?? 0) > 0;

  const schema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    image: product.images?.[0] && product.images[0].startsWith("http")
      ? product.images[0]
      : product.images?.[0]
        ? `${getServerUrl()}${product.images[0]}`
        : `${getServerUrl()}/og-cover.jpg`,
    description:
      product.short_description ??
      product.description?.replace(/<[^>]*>/g, "").slice(0, 160),
    brand: {
      "@type": "Brand",
      name: "Arts Fashion",
    },
    offers: {
      "@type": "Offer",
      url: `${getServerUrl()}/products/${product.slug}`,
      priceCurrency: "BDT",
      price: product.price,
      availability: inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      seller: {
        "@type": "Organization",
        name: "Arts Fashion",
      },
      itemCondition: "https://schema.org/NewCondition",
    },
    ...(product.category && {
      category: product.category,
    }),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}