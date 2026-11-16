/**
 * Makes grid thumbnails for images uploaded before thumbnails existed.
 *
 *   node scripts/backfill-thumbs.mjs          list what is missing (no writes)
 *   node scripts/backfill-thumbs.mjs --run    create the missing thumbnails
 *
 * For every stored image `<folder>/<uuid>.<ext>` without a
 * `<folder>/<uuid>-thumb.webp` next to it, the image is downloaded, scaled to
 * fit 600x800 (never enlarged) and saved as WebP at quality 75: the same thing
 * the admin's browser now does on upload (src/lib/media/thumb.ts). Uses the
 * active storage provider, R2 or Tigris, like the app. Safe to run again: it
 * only touches images that still have no thumbnail.
 */

import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { listKeys, storageClient, storageReady, STORAGE_BUCKET, STORAGE_PROVIDER } from "./r2-helpers.mjs";

const RUN = process.argv.includes("--run");
const IMAGE = /^[A-Za-z0-9_-]{1,64}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpe?g|png|avif)$/i;
const thumbKey = (key) => key.replace(/\.[A-Za-z0-9]+$/, "-thumb.webp");

if (!storageReady()) {
  console.error("Storage credentials are missing (R2_* or TIGRIS_STORAGE_* in .env.local).");
  process.exit(1);
}

const client = storageClient();
const keys = await listKeys([""]);
const have = new Set(keys);
const todo = keys.filter((k) => IMAGE.test(k) && !have.has(thumbKey(k)));

console.log(`${STORAGE_PROVIDER} bucket ${STORAGE_BUCKET}: ${keys.length} objects, ${todo.length} images without a thumbnail.`);
if (!RUN) {
  for (const k of todo.slice(0, 20)) console.log("  " + k);
  if (todo.length > 20) console.log(`  ... and ${todo.length - 20} more`);
  console.log(todo.length ? "Dry run. Add --run to create them." : "Nothing to do.");
  process.exit(0);
}

let done = 0;
let failed = 0;
let saved = 0;
for (const key of todo) {
  try {
    const obj = await client.send(new GetObjectCommand({ Bucket: STORAGE_BUCKET, Key: key }));
    const input = Buffer.from(await obj.Body.transformToByteArray());
    const thumb = await sharp(input).rotate().resize(600, 800, { fit: "inside", withoutEnlargement: true }).webp({ quality: 75 }).toBuffer();
    await client.send(
      new PutObjectCommand({
        Bucket: STORAGE_BUCKET,
        Key: thumbKey(key),
        Body: thumb,
        ContentType: "image/webp",
        CacheControl: obj.CacheControl ?? "public, max-age=31536000, immutable",
      }),
    );
    done++;
    saved += input.length - thumb.length;
    if (done % 25 === 0) console.log(`  ${done}/${todo.length}`);
  } catch (error) {
    failed++;
    console.warn(`  failed ${key}: ${error instanceof Error ? error.message : error}`);
  }
}
console.log(`Created ${done} thumbnails, ${failed} failed. Grid images are ${(saved / 1024 / 1024).toFixed(1)} MB smaller in total.`);
