/**
 * Browser-side image optimisation for admin uploads.
 *
 * The site runs on Cloudflare Workers, where native image libraries such as
 * sharp cannot run, so the admin's browser does the work before the file is
 * sent: the image is scaled to fit inside 1920x1080 (never enlarged) and
 * re-encoded as WebP at quality 0.8 -- the same result the server used to
 * produce.
 *
 * The original file is returned untouched whenever optimisation is not
 * possible or not worth it: the browser cannot decode or encode the format,
 * the encoder silently fell back to PNG (older Safari), or the WebP came out
 * larger than the input. The server still sniffs every file, so a fallback is
 * never a way to store something that is not an image.
 */

export interface ClientOptimizeOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
}

const DEFAULTS: Required<ClientOptimizeOptions> = {
  maxWidth: 1920,
  maxHeight: 1080,
  quality: 0.8,
};

export async function optimizeImageFile(file: File, options: ClientOptimizeOptions = {}): Promise<File> {
  const { maxWidth, maxHeight, quality } = { ...DEFAULTS, ...options };
  if (typeof window === "undefined" || !file.type.startsWith("image/")) return file;

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxWidth / bitmap.width, maxHeight / bitmap.height);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
    if (!blob || blob.type !== "image/webp") return file;
    if (blob.size >= file.size && scale === 1) return file;

    const base = (file.name || "upload").replace(/\.[^./\\]+$/, "");
    return new File([blob], `${base}.webp`, { type: "image/webp", lastModified: Date.now() });
  } catch {
    return file;
  } finally {
    bitmap?.close();
  }
}

/** Optimises several files in sequence, keeping memory use to one image at a time. */
export async function optimizeImageFiles(files: File[], options?: ClientOptimizeOptions): Promise<File[]> {
  const out: File[] = [];
  for (const f of files) out.push(await optimizeImageFile(f, options));
  return out;
}
