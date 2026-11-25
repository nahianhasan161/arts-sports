import "server-only";
import { getPublicSupabase } from "@/lib/supabase/public";

/**
 * Accessories by sport for the home page. An accessory is an ordinary product
 * in the top-level category whose slug contains "accessories"; that category's
 * sub-categories are the sports (Football, Cricket, ...). Staff manage both on
 * the Categories page. Cookie-free, so the home page stays cacheable.
 */

export interface AccessorySport {
  id: string;
  slug: string;
  name: string;
  name_bn: string | null;
}

export interface AccessoryItem {
  id: string;
  slug: string;
  title: string;
  title_bn: string | null;
  price: number;
  original_price: number | null;
  images: string[];
  stock: number;
  sport_id: string | null;
}

export interface AccessoryShowcaseData {
  categorySlug: string;
  sports: AccessorySport[];
  items: AccessoryItem[];
}

/** Cards shown per sport tab (and in the "all" tab). */
const PER_SPORT = 8;

export async function getAccessoryShowcase(): Promise<AccessoryShowcaseData | null> {
  const db = getPublicSupabase();
  if (!db) return null;
  const { data: parents } = await db
    .from("categories")
    .select("id, slug")
    .is("parent_id", null)
    .eq("is_active", true)
    .ilike("slug", "%accessories%");
  // The exact slug wins over e.g. "demo-accessories".
  const parent = parents?.find((c) => c.slug === "accessories") ?? parents?.[0];
  if (!parent) return null;

  const { data: sportRows } = await db
    .from("categories")
    .select("id, slug, name, name_bn")
    .eq("parent_id", parent.id)
    .eq("is_active", true)
    .order("display_order")
    .order("name");
  const sports = (sportRows ?? []) as AccessorySport[];

  const read = async (sportId: string | null) => {
    let q = db
      .from("products")
      .select("id, slug, title, title_bn, price, original_price, images, stock, sport_id:sub_category_id")
      .is("deleted_at", null)
      .eq("status", "published")
      .eq("category_id", parent.id);
    q = sportId ? q.eq("sub_category_id", sportId) : q.is("sub_category_id", null);
    const { data } = await q.order("published_at", { ascending: false, nullsFirst: false }).limit(PER_SPORT);
    return (data ?? []) as AccessoryItem[];
  };
  // One read per sport, so a sport with many products cannot push out the others.
  const items = (await Promise.all([...sports.map((s) => read(s.id)), read(null)])).flat();
  return items.length ? { categorySlug: parent.slug, sports, items } : null;
}
