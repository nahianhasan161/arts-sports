import { NextResponse } from "next/server";
import { getPublicSupabase } from "@/lib/supabase/public";
import { searchProductIds } from "@/lib/services/search";
import { thumbUrl } from "@/lib/media/thumb";

/** What the header search shows while a shopper types. Public, cached briefly. */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const db = getPublicSupabase();
  if (!db || q.length < 2) return NextResponse.json({ items: [], total: 0 });

  const ids = await searchProductIds(q);
  const top = ids.slice(0, 6);
  if (top.length === 0) return NextResponse.json({ items: [], total: 0 }, { headers: cache });

  const { data } = await db
    .from("products")
    .select("id, slug, title, title_bn, price, regular_price, images")
    .in("id", top);
  const byId = new Map((data ?? []).map((p) => [p.id as string, p]));
  const items = top
    .map((id) => byId.get(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map((p) => ({
      slug: p.slug as string,
      title: p.title as string,
      title_bn: (p.title_bn as string | null) ?? null,
      price: Number(p.price),
      regular_price: p.regular_price ? Number(p.regular_price) : null,
      image: thumbUrl(Array.isArray(p.images) ? (p.images[0] as string) : null) || null,
      // Older uploads have no thumbnail; the list falls back to this.
      full: Array.isArray(p.images) ? ((p.images[0] as string) ?? null) : null,
    }));
  return NextResponse.json({ items, total: ids.length }, { headers: cache });
}

const cache = { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" };
