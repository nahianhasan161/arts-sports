import type { Product } from "@/types";
import { getServerUrl } from "@/lib/config";

interface ProductSchemaProps {
  product: Product;
}

export function ProductSchema({ product }: ProductSchemaProps) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    image: product.images?.[0] ?? `${getServerUrl()}/og-cover.jpg`,
    description: product.short_description ?? product.description?.replace(/<[^>]*>/g, "").slice(0, 160),
    brand: {
      "@type": "Brand",
      name: "Arts Fashion",
    },
    offers: {
      "@type": "Offer",
      url: `${getServerUrl()}/products/${product.slug}`,
      priceCurrency: "BDT",
      price: product.price,
      availability: "https://schema.org/InStock",
      seller: {
        "@type": "Organization",
        name: "Arts Fashion",
      },
      itemCondition: "https://schema.org/NewCondition",
    },
    ...(product.rating && {
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: product.rating,
        reviewCount: product.reviews_count ?? 0,
        bestRating: 5,
        worstRating: 1,
      },
    }),
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