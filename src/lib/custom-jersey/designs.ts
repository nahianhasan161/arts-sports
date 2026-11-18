/**
 * Design catalogue (custom_gallery rows grouped by custom_design_categories).
 * Shared by the browser and the server; no server imports here.
 */

export interface DesignCategoryRow {
  slug: string;
  name_en: string;
  name_bn: string | null;
  image_url: string | null;
  display_order: number;
  is_active: boolean;
  /** Admin listing only: designs in this category (hidden ones included). */
  count?: number;
}

export interface DesignRow {
  id: string;
  image_url: string;
  /** Every picture, cover first (image_url = images[0]). May be empty on rows from before the column. */
  images?: string[];
  title: string | null;
  caption: string | null;
  category: string | null;
  is_published?: boolean;
  display_order?: number;
  custom_order_id?: string | null;
}

/** The fallback group: old photos with no category are shown here too. */
export const OTHER_CATEGORY = "other";

export const DESIGN_SLUG = /^[a-z0-9][a-z0-9-]{0,40}$/;

export const categoryName = (c: Pick<DesignCategoryRow, "name_en" | "name_bn">, locale: string) =>
  (locale === "bn" && c.name_bn) || c.name_en;

export const designSlug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

/** A design's pictures, cover first, never empty. */
export const designImages = (d: Pick<DesignRow, "image_url" | "images">) =>
  d.images?.length ? d.images : [d.image_url];

/** Most pictures one design can hold. */
export const MAX_DESIGN_IMAGES = 12;
