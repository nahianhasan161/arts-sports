import { cache } from "react";
import { getCategories } from "@/lib/services/products";
import { findCategory } from "@/lib/services/shop-query";
import { getProductTerms } from "@/lib/services/catalog";
import { sanitizeProductHtml } from "@/lib/admin/rich-text";
import type { SeoContext } from "@/lib/seo/product-seo";
import type { Product } from "@/types";

/**
 * Shared by the product page (`/products/[slug]`) and the staff preview
 * (`/preview/product/[id]`), so the preview shows what the page will show.
 */

/** Brand, category and sub-category of a product, read once per request (metadata + page). */
export const loadContext = cache(async (product: Product) => {
  const [terms, tree] = await Promise.all([getProductTerms(product.id), getCategories()]);
  const found = findCategory(tree, product.category ?? "");
  const sub = found?.parent.children?.find((c) => c.name === product.sub_category);
  const brand = terms.find((t) => t.type === "brand")?.name_en ?? null;
  const ctx: SeoContext = {
    brand,
    category: found?.parent.name ?? product.category ?? null,
    categoryBn: found?.parent.name_bn ?? null,
    subCategory: sub?.name ?? product.sub_category ?? null,
  };
  return { terms, found, sub, ctx };
});

/** Descriptions are stored as cleaned HTML, older ones as plain text. Cleaned again here, where they are shown. */
export function asHtml(value: string | null | undefined): string {
  const text = value?.trim() ?? "";
  if (!text) return "";
  return sanitizeProductHtml(/<(p|br|ul|ol|li|strong|em|b|i|u|a)\b/i.test(text) ? text : `<p>${text.replace(/\n+/g, "</p><p>")}</p>`);
}
