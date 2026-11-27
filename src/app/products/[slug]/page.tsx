import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getProductBySlug, getProducts, getVariantCombos } from "@/lib/services/products";
import { sortSizes } from "@/lib/size-order";
import type { Product } from "@/types";
import { asHtml, loadContext } from "@/lib/products/page-data";
import { roundPercent } from "@/lib/pricing";
import { getServerUrl } from "@/lib/config";
import {
  getApprovedQuestions,
  getApprovedReviews,
  getRatingSummary,
  getTerms,
} from "@/lib/services/catalog";
import { ProductReviews } from "@/components/product/ProductReviews";
import { EditionCompare } from "@/components/product/EditionCompare";
import { ProductSchema } from "@/components/seo/ProductSchema";
import { buildProductSeo } from "@/lib/seo/product-seo";
import { getStoreFacts } from "@/lib/seo/store-facts";
import { RelatedProducts } from "@/components/product/RelatedProducts";
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

function absoluteImage(src: string | undefined): string {
  if (!src) return "/og-cover.jpg";
  return src.startsWith("http") ? src : `${getServerUrl()}${src.startsWith("/") ? "" : "/"}${src}`;
}

function hasStock(product: Product, combos: { stock: number }[]): boolean {
  if (combos.length > 0) return combos.some((c) => c.stock > 0);
  return product.sizes?.some((s) => (s.stock ?? 0) > 0) || (product.stock ?? 0) > 0;
}

/**
 * Title, description, keywords and share cards from lib/seo/product-seo.ts:
 * the product's own search text when staff or the AI wrote one, otherwise
 * built from its name, category, brand, price, colours and sizes.
 */
export async function generateMetadata(props: ProductPageProps): Promise<Metadata> {
  const params = await props.params;
  const product = await getProductBySlug(params.slug);

  if (!product) {
    return {
      title: "Product not found",
      robots: { index: false, follow: false },
    };
  }

  const { ctx } = await loadContext(product);
  const seo = buildProductSeo(product, ctx);
  const canonical = `/products/${encodeURIComponent(product.slug)}`;
  const images = (product.images ?? []).filter(Boolean).slice(0, 4).map((src, i) => ({
    url: absoluteImage(src),
    alt: i === 0 ? seo.imageAlt : `${product.title} – ${i + 1}`,
  }));
  if (images.length === 0) images.push({ url: absoluteImage(undefined), alt: product.title });

  return {
    title: seo.title,
    description: seo.description,
    keywords: seo.keywords,
    alternates: { canonical },
    openGraph: {
      title: seo.title,
      description: seo.description,
      url: canonical,
      type: "website",
      locale: "bn_BD",
      alternateLocale: ["en_US"],
      images,
    },
    twitter: {
      card: "summary_large_image",
      title: seo.title,
      description: seo.description,
      images: images.map((i) => i.url),
    },
  };
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

  const [summary, reviews, questions, context, editions, combos, facts] = await Promise.all([
    getRatingSummary(product.id),
    getApprovedReviews(product.id),
    getApprovedQuestions(product.id),
    loadContext(product),
    getTerms("edition"),
    getVariantCombos(product.id),
    getStoreFacts(),
  ]);
  const { terms: productTerms, found, sub, ctx } = context;
  const seo = buildProductSeo(product, ctx);
  const site = getServerUrl();
  const categorySlug = found ? found.parent.slug || found.parent.id : null;
  const crumbs = [
    { name: "Home", item: site },
    { name: "Shop", item: `${site}/shop` },
    ...(found && categorySlug ? [{ name: found.parent.name, item: `${site}/shop?category=${encodeURIComponent(categorySlug)}` }] : []),
    ...(found && categorySlug && sub
      ? [{ name: sub.name, item: `${site}/shop?category=${encodeURIComponent(categorySlug)}&sub=${encodeURIComponent(sub.slug || sub.id)}` }]
      : []),
    { name: product.title, item: `${site}/products/${encodeURIComponent(product.slug)}` },
  ];
  const related = await relatedProducts(product);
  const inStock = hasStock(product, combos);

  return (
    <>
      {/* Price, currency and availability for rich results. Only emitted for
          a real published product, and only with in-stock availability, so
          the markup can never claim stock the database does not have. */}
      <ProductSchema
        product={product}
        seo={seo}
        facts={facts}
        rating={summary}
        reviews={reviews}
        brand={ctx.brand}
        categoryPath={[ctx.category, ctx.subCategory].filter(Boolean).join(" > ") || undefined}
        inStock={inStock}
      />
      {/* Open Graph product tags (Facebook / Pinterest product pins and catalogues).
          Written here because they need property=, which metadata.other does not write.
          React moves them into <head>. */}
      <meta property="product:price:amount" content={String(product.price)} />
      <meta property="product:price:currency" content="BDT" />
      <meta property="product:availability" content={inStock ? "in stock" : "out of stock"} />
      <meta property="product:condition" content="new" />
      <meta property="product:retailer_item_id" content={product.id} />
      <meta property="product:brand" content={ctx.brand || "Arts Sports"} />
      {ctx.category && <meta property="product:category" content={ctx.category} />}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: c.item })),
          }).replace(/</g, "\\u003c"),
        }}
      />
      <ProductDetailClient
        product={{ ...product, description: "", seo: undefined, sizes: sortSizes(product.sizes ?? [], (x) => x.size) }}
        discountPercent={discountPercent}
        category={found ? { name: found.parent.name, name_bn: found.parent.name_bn, slug: found.parent.slug || found.parent.id } : null}
        subCategory={sub ? { name: sub.name, name_bn: sub.name_bn, slug: sub.slug || sub.id } : null}
        details={{ en: asHtml(product.description), bn: asHtml(product.description_bn) }}
        combos={combos}
        imageAlt={{ en: seo.imageAlt, bn: seo.imageAltBn }}
      />
      <EditionCompare editions={editions} current={productTerms.map((t) => t.id)} />
      <ProductReviews productId={product.id} summary={summary} reviews={reviews} questions={questions} />
      <RelatedProducts current={card(product)} related={related.map(card)} />
    </>
  );
}

/** A product without the heavy text, for cards. */
const card = (p: Product): Product => ({ ...p, description: "", description_bn: null, short_description: null, specs: undefined, cost_price: undefined });

/**
 * Up to 8 products to show under this one: same sub-category first, then the
 * same category, then the newest, never this product or a sold-out one.
 */
async function relatedProducts(product: Product): Promise<Product[]> {
  const out: Product[] = [];
  const seen = new Set<string>([product.id]);
  const add = (list: Product[]) => {
    for (const p of list) {
      if (out.length >= 8 || seen.has(p.id) || (p.stock ?? 0) <= 0) continue;
      seen.add(p.id);
      out.push(p);
    }
  };
  if (product.sub_category && product.category) {
    add(await getProducts({ category: product.category, subCategory: product.sub_category, excludeIds: [product.id], limit: 12 }));
  }
  if (out.length < 8 && product.category) add(await getProducts({ category: product.category, excludeIds: [...seen], limit: 12 }));
  if (out.length < 4) add(await getProducts({ excludeIds: [...seen], limit: 12, sortBy: "newest" }));
  return out;
}
