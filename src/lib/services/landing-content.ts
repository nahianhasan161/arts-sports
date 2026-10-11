import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Landing-page content, read server-side.
 *
 * The FAB editor writes rows into `site_content` as an admin edits the page,
 * so the page has to read them back on every render or an edit only survives
 * until the next navigation. Previously nothing read them, which is why a
 * replaced image showed correctly in the editor and then reverted to the
 * hardcoded file on reload.
 */

export interface LandingContentRow {
  key: string;
  area: string;
  content: string | null;
  image_url: string | null;
}

export async function getLandingContent(area = "landing-page"): Promise<Map<string, LandingContentRow>> {
  const map = new Map<string, LandingContentRow>();
  const supabase = await getSupabaseServerClient();
  if (!supabase) return map;

  const { data, error } = await supabase
    .from("site_content")
    .select("key, area, content, image_url")
    .eq("area", area);

  if (error) {
    // A missing or unreadable table must not take the landing page down: the
    // defaults below are the page's own copy, so the storefront still renders.
    console.error("Failed to load landing content:", error.message);
    return map;
  }

  for (const row of data ?? []) {
    map.set(row.key, row as LandingContentRow);
  }
  return map;
}

/**
 * The saved text for a key, or the page's own copy when there is none.
 *
 * A row with a null or blank content means the admin cleared the field; that
 * is a legitimate edit and is returned as-is rather than falling back, so a
 * deliberately emptied section stays empty.
 */
export function savedText(
  content: Map<string, LandingContentRow>,
  key: string,
  fallback: string
): string {
  const row = content.get(key);
  if (row && typeof row.content === "string" && row.content.trim() !== "") {
    return row.content;
  }
  return fallback;
}

/** The saved image URL for a key, or the page's own file when there is none. */
export function savedImage(
  content: Map<string, LandingContentRow>,
  key: string,
  fallback: string
): string {
  const url = content.get(key)?.image_url;
  return typeof url === "string" && url.trim() !== "" ? url : fallback;
}
