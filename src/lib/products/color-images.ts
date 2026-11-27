import type { ProductVideo } from "@/lib/media/video";

/**
 * Pictures and videos per colour (`products.color_images`, JSONB):
 *   { "<colour name, lower case>": ["<image url>", "video:<video key>", ...] }
 *
 * An image entry is one of the product's own `images`, matched on its file name
 * (`<uuid>.webp`), so a change of storage prefix (R2 / Tigris / /api/media)
 * does not break it. A video entry is `video:` + `videoKey()` of one of the
 * product's `videos`. Media that was deleted is just skipped.
 *
 * On the product page a colour that has media shows its own media first, then
 * the media no colour claims; media that belongs only to other colours is hidden.
 */
export type ColorMedia = Record<string, string[]>;

export const colorKey = (name: string) => name.trim().toLowerCase();
export const VIDEO_PREFIX = "video:";

/** Same key the videos API uses to tell videos apart. */
export function videoKey(v: Pick<ProductVideo, "kind" | "id" | "url" | "storage_path">): string {
  return v.kind === "file" ? `file:${v.storage_path}` : `${v.kind}:${v.id ?? v.url}`;
}
export const videoEntry = (v: Pick<ProductVideo, "kind" | "id" | "url" | "storage_path">) => VIDEO_PREFIX + videoKey(v);

/** File name of an image url, without query and without the `-thumb` part. */
export function imageFileKey(url: string): string {
  const path = url.split(/[?#]/)[0];
  const last = path.slice(path.lastIndexOf("/") + 1);
  return decodeURIComponent(last).replace(/-thumb(\.[a-z0-9]+)$/i, "$1").toLowerCase();
}

/** Comparable form of an entry: video key, or the image's file name. */
export const entryKey = (entry: string) => (entry.startsWith(VIDEO_PREFIX) ? entry : imageFileKey(entry));

/** Reads the stored value. A single string (older shape) becomes a one-item list. */
export function readColorMedia(raw: unknown): ColorMedia {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: ColorMedia = {};
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    const list = (Array.isArray(value) ? value : [value])
      .filter((x): x is string => typeof x === "string" && x.trim() !== "")
      .map((x) => x.trim());
    if (name.trim() && list.length) out[colorKey(name)] = [...new Set(list)];
  }
  return out;
}

/** A colour's own images (from `images`) and videos, in the order staff chose them. */
export function mediaForColor(images: string[], videos: ProductVideo[], map: ColorMedia, color: string) {
  const imgBy = new Map(images.map((img) => [imageFileKey(img), img]));
  const vidBy = new Map(videos.map((v) => [videoEntry(v), v]));
  const out = { images: [] as string[], videos: [] as ProductVideo[] };
  for (const entry of map[colorKey(color)] ?? []) {
    const k = entryKey(entry);
    const img = imgBy.get(k);
    const vid = vidBy.get(k);
    if (img && !out.images.includes(img)) out.images.push(img);
    else if (vid && !out.videos.includes(vid)) out.videos.push(vid);
  }
  return out;
}

/**
 * What the gallery shows for a colour: its own media, then media no colour
 * claims. A colour with no media of its own sees everything.
 */
export function galleryForColor(images: string[], videos: ProductVideo[], map: ColorMedia, color: string | null) {
  const own = color ? mediaForColor(images, videos, map, color) : { images: [], videos: [] };
  if (own.images.length + own.videos.length === 0) return { images, videos };
  const claimed = new Set(Object.values(map).flat().map(entryKey));
  return {
    images: [...own.images, ...images.filter((img) => !claimed.has(imageFileKey(img)))],
    videos: [...own.videos, ...videos.filter((v) => !claimed.has(videoEntry(v)))],
  };
}

/** First picture of a colour (colour button, cart line), or null. */
export function colorCover(images: string[], map: ColorMedia, color: string): string | null {
  return mediaForColor(images, [], map, color).images[0] ?? null;
}

/**
 * The variation the shop shows first (`products.default_variant`, JSONB):
 * { color?: "<colour name, lower case>", size?: "<size label, lower case>" }.
 * Empty = the first colour/size that is in stock, as before.
 */
export interface DefaultVariant {
  color?: string;
  size?: string;
}

export function readDefaultVariant(raw: unknown): DefaultVariant {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const r = raw as Record<string, unknown>;
  const out: DefaultVariant = {};
  if (typeof r.color === "string" && r.color.trim()) out.color = colorKey(r.color);
  if (typeof r.size === "string" && r.size.trim()) out.size = r.size.trim().toLowerCase();
  return out;
}

/** The picture a product card shows: the default colour's first picture, else the main one. */
export function frontImage(p: { images: string[]; color_images?: unknown; default_variant?: unknown }): string | undefined {
  const color = readDefaultVariant(p.default_variant).color;
  return (color && colorCover(p.images, readColorMedia(p.color_images), color)) || p.images[0];
}
