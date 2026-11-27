import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/permissions";
import { AdminAuthError } from "@/lib/admin/auth";
import { getServiceSupabase } from "@/lib/supabase/service";
import { variantCombosFrom } from "@/lib/services/products";
import { asHtml, loadContext } from "@/lib/products/page-data";
import { buildProductSeo } from "@/lib/seo/product-seo";
import { sortSizes } from "@/lib/size-order";
import { roundPercent } from "@/lib/pricing";
import { getApprovedQuestions, getApprovedReviews, getRatingSummary, getTerms } from "@/lib/services/catalog";
import { ProductReviews } from "@/components/product/ProductReviews";
import { EditionCompare } from "@/components/product/EditionCompare";
import { ProductDetailClient } from "@/app/products/[slug]/ProductDetailClient";
import type { Product } from "@/types";
import { PreviewBar } from "./PreviewBar";

/**
 * Staff preview of a product page: `/preview/product/<id>`.
 *
 * The public page (`/products/[slug]`) is a 404 for drafts and is cached for
 * 60 s, so staff could not see a product before publishing it, nor a fresh
 * edit right after saving. This page reads the product by id with the
 * service client (any status except removed), never caches, is never indexed,
 * and renders the same ProductDetailClient the customer page renders.
 * Needs the `products.manage` permission. No JSON-LD, related products or
 * tracking, so a preview is not counted as a customer view.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Product preview",
  robots: { index: false, follow: false },
};

export default async function ProductPreviewPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;

  try {
    await requirePermission("products.manage");
  } catch (error) {
    if (error instanceof AdminAuthError && error.status === 401) {
      redirect(`/sign-in?next=${encodeURIComponent(`/preview/product/${id}`)}`);
    }
    notFound();
  }

  const supabase = getServiceSupabase();
  const { data } = await supabase.from("products").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!data) notFound();
  const { cost_price: _cost, ...product } = data as Product;
  void _cost;

  const discountPercent = roundPercent(
    product.discount_percent ??
      (product.original_price && product.price && product.original_price > product.price
        ? ((product.original_price - product.price) / product.original_price) * 100
        : 0)
  );

  const [summary, reviews, questions, context, editions, combos] = await Promise.all([
    getRatingSummary(product.id),
    getApprovedReviews(product.id),
    getApprovedQuestions(product.id),
    loadContext(product),
    getTerms("edition"),
    variantCombosFrom(supabase, product.id),
  ]);
  const { terms: productTerms, found, sub, ctx } = context;
  const seo = buildProductSeo(product, ctx);

  return (
    <>
      <PreviewBar status={product.status ?? "draft"} slug={product.slug} />
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
    </>
  );
}
