import "server-only";

import sharp from "sharp";

export interface OptimizeOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  progressive?: boolean;
}

export interface OptimizeResult {
  ok: true;
  buffer: Buffer;
  contentType: string;
  size: number;
}

export interface OptimizeError {
  ok: false;
  reason: string;
}

const DEFAULTS: Required<OptimizeOptions> = {
  maxWidth: 1920,
  maxHeight: 1080,
  quality: 80,
  progressive: true,
};

export async function optimizeImage(
  input: Buffer | Uint8Array,
  options: OptimizeOptions = {},
): Promise<OptimizeResult | OptimizeError> {
  const { maxWidth, maxHeight, quality, progressive } = {
    ...DEFAULTS,
    ...options,
  };

  try {
    const pipeline = sharp(Buffer.from(input))
      .resize(maxWidth, maxHeight, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({
        quality,
        ...(progressive ? { smartSubsample: true } : {}),
      });

    const buffer = await pipeline.toBuffer();

    if (buffer.length === 0) {
      return { ok: false, reason: "sharp produced an empty buffer" };
    }

    return {
      ok: true,
      buffer,
      contentType: "image/webp",
      size: buffer.length,
    };
  } catch (error) {
    const e = error as Error;
    return { ok: false, reason: e?.message ?? "Image optimization failed" };
  }
}
