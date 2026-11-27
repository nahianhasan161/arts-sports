import type { Product } from "@/types";
import type { PublicReview } from "@/lib/services/catalog";
import type { ProductSeo } from "@/lib/seo/product-seo";
import { plainText } from "@/lib/seo/product-seo";
import { returnPolicy, shippingDetails, type StoreFacts } from "@/lib/seo/store-facts";

interface ProductSchemaProps {
  product: Product;
  seo: ProductSeo;
  facts: StoreFacts;
  /** Approved customer reviews only. aggregateRating is emitted only when there are some. */
  rating?: { count: number; average: number | null };
  reviews?: PublicReview[];
  brand?: string | null;
  /** "Football > Jersey" */
  categoryPath?: string;
  /** Switched-on variations; when given, stock is read from them. */
  inStock: boolean;
}

/**
 * Product structured data: what Google Shopping, rich results and AI
 * shopping answers read. Only true things:
 * - ratings and reviews from approved product_reviews, never products.rating;
 * - availability from the stock that exists;
 * - delivery fees from the admin settings the order RPC charges, delivery
 *   times and the return window from the policy pages (lib/seo/store-facts.ts).
 */
export function ProductSchema({ product, seo, facts, rating, reviews = [], brand, categoryPath, inStock }: ProductSchemaProps) {
  const abs = (u: string) => (u.startsWith("http") ? u : `${facts.url}${u.startsWith("/") ? "" : "/"}${u}`);
  const images = (product.images ?? []).filter(Boolean).slice(0, 10).map(abs);
  const url = `${facts.url}/products/${encodeURIComponent(product.slug)}`;
  const sku = product.variants?.find((v) => v.sku)?.sku ?? product.id;
  const original = Number(product.original_price) || 0;
  const onSale = original > product.price;
  const description = plainText(product.description) || plainText(product.short_description) || seo.description;

  const schema = {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${url}#product`,
    name: product.title,
    ...(product.title_bn && product.title_bn !== product.title && { alternateName: product.title_bn }),
    url,
    sku,
    productID: product.id,
    image: images.length > 0 ? images : [`${facts.url}/og-cover.jpg`],
    description: description.slice(0, 5000),
    brand: { "@type": "Brand", name: brand || facts.name },
    ...(categoryPath && { category: categoryPath }),
    ...(product.colors?.length && { color: product.colors.map((c) => c.name).join(", ") }),
    ...(product.sizes?.length && { size: product.sizes.map((s) => s.size.toUpperCase()).join(", ") }),
    ...(product.gender && {
      audience:
        product.gender === "kids"
          ? { "@type": "PeopleAudience", suggestedMaxAge: 13 }
          : { "@type": "PeopleAudience", suggestedGender: product.gender === "men" ? "male" : "female" },
    }),
    ...(seo.keywords.length > 0 && { keywords: seo.keywords.join(", ") }),
    ...(product.specs &&
      Object.keys(product.specs).length > 0 && {
        additionalProperty: Object.entries(product.specs).map(([name, value]) => ({
          "@type": "PropertyValue",
          name,
          value,
        })),
      }),
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: "BDT",
      price: product.price,
      ...(onSale && {
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          priceType: "https://schema.org/StrikethroughPrice",
          price: original,
          priceCurrency: "BDT",
        },
      }),
      availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@type": "Organization", name: facts.name, url: facts.url },
      acceptedPaymentMethod: ["http://purl.org/goodrelations/v1#COD", "http://purl.org/goodrelations/v1#ByBankTransferInAdvance"],
      shippingDetails: shippingDetails(facts),
      hasMerchantReturnPolicy: returnPolicy(facts),
    },
    ...(rating &&
      rating.count > 0 &&
      rating.average !== null && {
        aggregateRating: {
          "@type": "AggregateRating",
          ratingValue: rating.average,
          reviewCount: rating.count,
          bestRating: 5,
          worstRating: 1,
        },
      }),
    ...(reviews.length > 0 && {
      review: reviews.slice(0, 5).map((r) => ({
        "@type": "Review",
        author: { "@type": "Person", name: r.author_name || "Customer" },
        datePublished: r.created_at?.slice(0, 10),
        reviewRating: { "@type": "Rating", ratingValue: r.rating, bestRating: 5, worstRating: 1 },
        ...(r.title && { name: r.title }),
        reviewBody: r.body,
      })),
    }),
  };

  return (
    <script
      type="application/ld+json"
      // "<" escaped so a review or description can never close the script tag.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }}
    />
  );
}
