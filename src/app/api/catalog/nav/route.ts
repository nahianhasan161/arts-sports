import { NextResponse } from "next/server";
import { getCollections } from "@/lib/services/catalog";
import { getCategories } from "@/lib/services/products";

/**
 * GET /api/catalog/nav
 * The header menu: sports (top-level categories, as the admin created them)
 * and collections marked "show in menu". Cached for five minutes.
 */
export async function GET() {
  const [categories, collections] = await Promise.all([getCategories(), getCollections({ menuOnly: true })]);
  const body = {
    sports: categories.map((c) => ({
      name: c.name,
      name_bn: c.name_bn ?? null,
      slug: c.slug,
      href: `/shop?category=${encodeURIComponent(c.name)}`,
      children: (c.children ?? []).map((s) => ({
        name: s.name,
        href: `/shop?category=${encodeURIComponent(c.name)}&sub=${encodeURIComponent(s.name)}`,
      })),
    })),
    collections: collections.map((c) => ({ name: c.title_en, name_bn: c.title_bn, slug: c.slug, href: `/collection/${c.slug}` })),
  };
  return NextResponse.json(body, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } });
}
