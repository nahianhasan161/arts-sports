/**
 * Grid thumbnails. Every product image uploaded from the admin gets a small
 * WebP next to it, `<folder>/<uuid>-thumb.webp` (one dot, so the media proxy's
 * path rule accepts it). Grids show the thumbnail; the product page shows the
 * original. Images uploaded before thumbnails existed have none until
 * `scripts/backfill-thumbs.mjs` is run, so a grid falls back to the original
 * when the thumbnail fails to load.
 *
 * Safe on both server and client.
 */

/** Largest thumbnail box: sharp on a 2x phone and on desktop 4-column grids. */
export const THUMB_MAX = { width: 600, height: 800 } as const;

const OWN_OBJECT = /([A-Za-z0-9_-]{1,64})\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(webp|jpe?g|png|avif)(?=$|[?#])/i;

/** Storage path of the thumbnail for a stored image path. */
export function thumbPath(path: string): string {
  return path.replace(/\.[A-Za-z0-9]+$/, "-thumb.webp");
}

/**
 * The thumbnail URL for an image URL we stored, or the URL unchanged for
 * anything else (external hosts, mock images, already a thumbnail).
 */
export function thumbUrl(url: string | null | undefined): string {
  if (!url) return "";
  return OWN_OBJECT.test(url) ? url.replace(OWN_OBJECT, (_m, folder: string, id: string) => `${folder}/${id}-thumb.webp`) : url;
}
