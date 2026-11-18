import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DESIGN_SLUG, OTHER_CATEGORY, type DesignCategoryRow, type DesignRow } from "./designs";

const CATEGORY_COLS = "slug, name_en, name_bn, image_url, display_order, is_active";

/** Design categories in menu order. `all` includes switched-off ones (admin). Empty when the migration is missing. */
export async function loadDesignCategories(db: SupabaseClient, all = false): Promise<DesignCategoryRow[]> {
  let query = db.from("custom_design_categories").select(CATEGORY_COLS).order("display_order").order("name_en");
  if (!all) query = query.eq("is_active", true);
  const { data, error } = await query;
  return error ? [] : ((data ?? []) as DesignCategoryRow[]);
}

/**
 * One page of designs. `category` = a slug ("other" also returns rows with no category).
 * `all` includes hidden designs (admin).
 */
export async function listDesigns(
  db: SupabaseClient,
  opts: { category?: string | null; q?: string | null; ids?: string[]; offset?: number; limit?: number; all?: boolean }
): Promise<{ designs: DesignRow[]; has_more: boolean; error?: string }> {
  const limit = Math.min(100, Math.max(1, opts.limit ?? 40));
  const offset = Math.max(0, opts.offset ?? 0);
  const q = (opts.q ?? "").replace(/[%,()*]/g, " ").trim().slice(0, 60);
  const category = opts.category && DESIGN_SLUG.test(opts.category) ? opts.category : null;

  const build = (withImages: boolean) => {
    const cols = `id, image_url, ${withImages ? "images, " : ""}title, caption, category${opts.all ? ", is_published, display_order, custom_order_id" : ""}`;
    let query = db
      .from("custom_gallery")
      .select(cols)
      .order("display_order")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit);
    if (!opts.all) query = query.eq("is_published", true);
    if (opts.ids?.length) query = query.in("id", opts.ids);
    else if (category === OTHER_CATEGORY) query = query.or(`category.is.null,category.eq.${OTHER_CATEGORY}`);
    else if (category) query = query.eq("category", category);
    if (q) query = query.or(`title.ilike.%${q}%,caption.ilike.%${q}%`);
    return query;
  };

  let { data, error } = await build(true);
  // Before migration 20261118130000 there is no `images` column: fall back to the cover only.
  if (error && /images/.test(error.message)) ({ data, error } = await build(false));
  if (error) return { designs: [], has_more: false, error: error.message };
  const rows = (data ?? []) as unknown as DesignRow[];
  return { designs: rows.slice(0, limit), has_more: rows.length > limit };
}
