import type { MetadataRoute } from "next";
import { getProducts, getCategories } from "@/lib/services/products";
import { getCollections, getTerms } from "@/lib/services/catalog";
import { getServerUrl } from "@/lib/config";

/**
 * sitemap.xml: every page a shopper (or a search engine / AI crawler)
 * should find.
 *
 * Built from the same reads the shop uses, so the published set and the
 * sitemap can never disagree: a product appears here as soon as it is
 * published (within the 15-minute rebuild), and drafts never do. Category
 * links use the same slugs as the category pages' canonical address.
 * Product entries carry their pictures (Google Images reads them).
 */

const SITE_URL = getServerUrl().replace(/\/+$/, "");

export const revalidate = 900;

/** Pages that are marketing or legal surfaces, not catalogue. */
const STATIC_ROUTES: { path: string; priority: number; changeFrequency: "daily" | "weekly" | "monthly" }[] = [
  { path: "/", priority: 1.0, changeFrequency: "daily" },
  { path: "/shop", priority: 0.9, changeFrequency: "daily" },
  { path: "/custom-jersey", priority: 0.9, changeFrequency: "weekly" },
  { path: "/custom-jersey/gallery", priority: 0.7, changeFrequency: "weekly" },
  { path: "/shop?deals=true", priority: 0.6, changeFrequency: "daily" },
  { path: "/returns", priority: 0.5, changeFrequency: "monthly" },
  { path: "/refund-policy", priority: 0.4, changeFrequency: "monthly" },
  { path: "/shipping-policy", priority: 0.5, changeFrequency: "monthly" },
  { path: "/privacy-policy", priority: 0.3, changeFrequency: "monthly" },
  { path: "/terms", priority: 0.3, changeFrequency: "monthly" },
];

const abs = (u: string) => (u.startsWith("http") ? u : `${SITE_URL}${u.startsWith("/") ? "" : "/"}${u}`);

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = STATIC_ROUTES.map((route) => ({
    url: `${SITE_URL}${route.path}`,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  const [categories, products, teams, collections] = await Promise.all([
    getCategories(),
    getProducts({ limit: 5000 }),
    getTerms("team").catch(() => []),
    getCollections().catch(() => []),
  ]);

  // Category and sub-category pages, at the address their canonical names.
  for (const parent of categories) {
    const slug = parent.slug || parent.id;
    entries.push({
      url: `${SITE_URL}/shop?category=${encodeURIComponent(slug)}`,
      changeFrequency: "daily",
      priority: 0.8,
    });
    for (const child of parent.children ?? []) {
      entries.push({
        url: `${SITE_URL}/shop?category=${encodeURIComponent(slug)}&sub=${encodeURIComponent(child.slug || child.id)}`,
        changeFrequency: "weekly",
        priority: 0.7,
      });
    }
  }

  for (const team of teams) {
    entries.push({ url: `${SITE_URL}/team/${encodeURIComponent(team.slug)}`, changeFrequency: "weekly", priority: 0.6 });
  }
  for (const c of collections) {
    entries.push({ url: `${SITE_URL}/collection/${encodeURIComponent(c.slug)}`, changeFrequency: "weekly", priority: 0.6 });
  }

  // Products: the full published set, with their pictures.
  for (const product of products) {
    const changed = product.updated_at ?? product.published_at;
    entries.push({
      url: `${SITE_URL}/products/${encodeURIComponent(product.slug)}`,
      lastModified: changed ? new Date(changed) : undefined,
      changeFrequency: "weekly",
      priority: 0.8,
      images: (product.images ?? []).filter(Boolean).slice(0, 5).map(abs),
    });
  }

  return entries;
}
