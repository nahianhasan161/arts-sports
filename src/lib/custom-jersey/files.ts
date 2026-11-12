import { sniffImage, type SniffResult } from "@/lib/media/validate";

/**
 * Design files a customer may send: the usual images, plus PDF and
 * Illustrator / EPS artwork. Decided from the first bytes, never the name.
 *
 * These are stored under custom-designs/ and are never served by the public
 * media route (which only serves images): /api/custom-jersey/file streams
 * them to staff or to the order's owner, always as a download.
 */
export const MAX_DESIGN_BYTES = 15 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export const DESIGN_ACCEPT = "image/jpeg,image/png,image/webp,application/pdf,.ai,.eps,.pdf";

const starts = (b: Uint8Array, text: string, from = 0) => {
  for (let i = 0; i < text.length; i++) if (b[from + i] !== text.charCodeAt(i)) return false;
  return true;
};

export function sniffDesignFile(bytes: Uint8Array): SniffResult {
  if (bytes.length === 0) return { ok: false, reason: "File is empty" };
  const image = sniffImage(bytes);
  if (image.ok) return image;
  // Modern .ai files are PDF inside, so they sniff as PDF; that is fine.
  if (starts(bytes, "%PDF-")) return { ok: true, mime: "application/pdf", ext: "pdf" };
  if (starts(bytes, "%!PS-Adobe")) return { ok: true, mime: "application/postscript", ext: "eps" };
  // EPS with a binary preview header.
  if (bytes[0] === 0xc5 && bytes[1] === 0xd0 && bytes[2] === 0xd3 && bytes[3] === 0xc6) {
    return { ok: true, mime: "application/postscript", ext: "eps" };
  }
  return { ok: false, reason: "Use an image (JPG, PNG, WebP), a PDF or an AI/EPS file" };
}

const DESIGN_PATH = /^custom-designs\/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|avif|pdf|eps)$/;
const PREVIEW_PATH = /^custom-previews\/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|avif)$/;
const STAFF_IMAGE_PATH = /^custom-(mockups|gallery|previews)\/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|avif)$/;

/** A path this app generated for a private design file. */
export function isDesignPath(path: unknown): path is string {
  return typeof path === "string" && DESIGN_PATH.test(path);
}
export function isPreviewPath(path: unknown): path is string {
  return typeof path === "string" && PREVIEW_PATH.test(path);
}
export function isStaffImagePath(path: unknown): path is string {
  return typeof path === "string" && STAFF_IMAGE_PATH.test(path);
}
