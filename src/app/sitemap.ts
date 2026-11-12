import type { MetadataRoute } from "next";
import { getProducts, getCategories } from "@/lib/services/products";
import { getServerUrl } from "@/lib/config";

/**
 * sitemap.xml
 *
 * There was none, so a crawler had to discover every product by following
 * links from the home page — which for a catalogue means products were only
 * reachable if they happened to be on a listing page the crawler also
 * crawled.
 *
 * Built from the same getProducts() call the shop uses, so the published set
 * and the sitemap can never disagree. Revalidated hourly rather than
 * generated per request, because a catalogue that changes a few times a day
 * does not need a sitemap built on every hit.
 */

const SITE_URL = getServerUrl();

export const revalidate = 3600;

/** Pages that are marketing or legal surfaces, not catalogue. */
const STATIC_ROUTES: { path: string; priority: number; changeFrequency: "daily" | "weekly" | "monthly" }[] = [
  { path: "/", priority: 1.0, changeFrequency: "daily" },
  { path: "/shop", priority: 0.9, changeFrequency: "daily" },
  { path: "/custom-jersey", priority: 0.9, changeFrequency: "weekly" },
  { path: "/custom-jersey/gallery", priority: 0.6, changeFrequency: "weekly" },
  { path: "/returns", priority: 0.6, changeFrequency: "monthly" },
  { path: "/refund-policy", priority: 0.5, changeFrequency: "monthly" },
  { path: "/shipping-policy", priority: 0.6, changeFrequency: "monthly" },
  { path: "/privacy-policy", priority: 0.4, changeFrequency: "monthly" },
  { path: "/terms", priority: 0.4, changeFrequency: "monthly" },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = STATIC_ROUTES.map((route) => ({
    url: `${SITE_URL}${route.path}`,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  // Category listings. Sourced from the same tree the shop page navigates.
  const categories = await getCategories();
  for (const parent of categories) {
    entries.push({
      url: `${SITE_URL}/shop?category=${encodeURIComponent(parent.slug)}`,
      changeFrequency: "daily",
      priority: 0.8,
    });
    for (const child of parent.children ?? []) {
      entries.push({
        url: `${SITE_URL}/shop?category=${encodeURIComponent(parent.slug)}&sub=${encodeURIComponent(child.name)}`,
        changeFrequency: "weekly",
        priority: 0.7,
      });
    }
  }

  // Products. The full published set, not just the first page.
  const products = await getProducts({ limit: 5000 });
  for (const product of products) {
    entries.push({
      url: `${SITE_URL}/products/${encodeURIComponent(product.slug)}`,
      lastModified: product.published_at
        ? new Date(product.published_at)
        : product.updated_at
          ? new Date(product.updated_at)
          : undefined,
      changeFrequency: "weekly",
      priority: 0.7,
    });
  }

  return entries;
}
