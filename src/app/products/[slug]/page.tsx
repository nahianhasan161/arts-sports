import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCategories, getProductBySlug } from "@/lib/services/products";
import { findCategory } from "@/lib/services/shop-query";
import { sanitizeProductHtml } from "@/lib/admin/rich-text";
import { roundPercent } from "@/lib/pricing";
import { getServerUrl } from "@/lib/config";
import {
  getApprovedQuestions,
  getApprovedReviews,
  getProductTerms,
  getRatingSummary,
  getTerms,
} from "@/lib/services/catalog";
import { ProductReviews } from "@/components/product/ProductReviews";
import { EditionCompare } from "@/components/product/EditionCompare";
import { ProductSchema } from "@/components/seo/ProductSchema";
import { ProductDetailClient } from "./ProductDetailClient";

/**
 * Server half of the product detail page.
 *
 * The page used to be a single "use client" file, which meant three things
 * that were costing the store its search traffic:
 *
 *   1. No generateMetadata. Every product page shipped the site-wide root
 *      title and description, so hundreds of pages competed on identical
 *      metadata and none of them said what the product was.
 *   2. No notFound(). A URL for a product that does not exist rendered an
 *      empty shell with a 200, so Google indexed an unbounded number of
 *      thin pages.
 *   3. No structured data. The landing page emits Product JSON-LD, but the
 *      product pages — the ones that actually sell — emitted none, so no
 *      price, availability or rich snippet was available for the catalogue.
 *
 * This component fetches the product on the server, so the HTML that arrives
 * is the product, and the interactive parts (gallery, size picker, add to
 * cart) move into ProductDetailClient unchanged.
 */

interface ProductPageProps {
  params: Promise<{ slug: string }>;
}

/**
 * ISR: each page is rendered on its first visit, kept in the cache, and
 * rebuilt in the background at most once a minute. Nothing is prerendered at
 * build time (the empty list), so builds don't query the DB. Price and stock
 * shown here can be up to ~60 s old; checkout re-checks both on the server.
 */
export const revalidate = 60;
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata(props: ProductPageProps): Promise<Metadata> {
  const params = await props.params;
  const product = await getProductBySlug(params.slug);

  if (!product) {
    return {
      title: "Product not found",
      robots: { index: false, follow: false },
    };
  }

  // short_description is plain text by design; `description` is rich HTML and
  // would put markup into a meta tag.
  const description =
    (product.short_description || "")
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 300) ||
    `${product.title}. Buy online from Arts Sports, with delivery all over Bangladesh.`;

  const title = `${product.title} | Buy Online`;
  const canonical = `/products/${encodeURIComponent(product.slug)}`;
  const ogImage = product.images?.[0]?.startsWith("http")
    ? product.images[0]
    : product.images?.[0]
      ? `${getServerUrl()}${product.images[0]}`
      : "/og-cover.jpg";

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      type: "website",
      images: [{ url: ogImage, alt: product.title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

/** Descriptions are stored as cleaned HTML, older ones as plain text. Cleaned again here, where they are shown. */
function asHtml(value: string | null | undefined): string {
  const text = value?.trim() ?? "";
  if (!text) return "";
  return sanitizeProductHtml(/<(p|br|ul|ol|li|strong|em|b|i|u|a)\b/i.test(text) ? text : `<p>${text.replace(/\n+/g, "</p><p>")}</p>`);
}

export default async function ProductDetailPage(props: ProductPageProps) {
  const params = await props.params;
  const product = await getProductBySlug(params.slug);

  // A product that does not exist, is a draft, or was retired must be a real
  // 404 rather than a 200 empty shell.
  if (!product) notFound();

  // Discount, recomputed for display. The badge beside it says the same
  // percentage rounded the same way, so the two can never disagree.
  const discountPercent = roundPercent(
    product.discount_percent ??
      (product.original_price && product.price && product.original_price > product.price
        ? ((product.original_price - product.price) / product.original_price) * 100
        : 0)
  );

  const [summary, reviews, questions, productTerms, editions, tree] = await Promise.all([
    getRatingSummary(product.id),
    getApprovedReviews(product.id),
    getApprovedQuestions(product.id),
    getProductTerms(product.id),
    getTerms("edition"),
    getCategories(),
  ]);

  const found = findCategory(tree, product.category ?? "");
  const sub = found?.parent.children?.find((c) => c.name === product.sub_category);

  return (
    <>
      {/* Price, currency and availability for rich results. Only emitted for
          a real published product, and only with in-stock availability, so
          the markup can never claim stock the database does not have. */}
      <ProductSchema product={product} rating={summary} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: getServerUrl() },
              { "@type": "ListItem", position: 2, name: "Shop", item: `${getServerUrl()}/shop` },
              {
                "@type": "ListItem",
                position: 3,
                name: product.category ?? "Products",
                item: `${getServerUrl()}/shop?category=${encodeURIComponent(product.category ?? "")}`,
              },
              {
                "@type": "ListItem",
                position: 4,
                name: product.title,
                item: `${getServerUrl()}/products/${encodeURIComponent(product.slug)}`,
              },
            ],
          }),
        }}
      />
      <ProductDetailClient
        product={{ ...product, description: "" }}
        discountPercent={discountPercent}
        category={found ? { name: found.parent.name, name_bn: found.parent.name_bn, slug: found.parent.slug || found.parent.id } : null}
        subCategory={sub ? { name: sub.name, name_bn: sub.name_bn } : null}
        details={{ en: asHtml(product.description), bn: asHtml(product.description_bn) }}
      />
      <EditionCompare editions={editions} current={productTerms.map((t) => t.id)} />
      <ProductReviews productId={product.id} summary={summary} reviews={reviews} questions={questions} />
    </>
  );
}
