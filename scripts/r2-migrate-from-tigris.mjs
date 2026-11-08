/**
 * Copies every media object from the old Tigris bucket into Cloudflare R2.
 *
 *   node scripts/r2-migrate-from-tigris.mjs          dry run: report what would move
 *   node scripts/r2-migrate-from-tigris.mjs --run    copy, then verify
 *
 * Source: TIGRIS_STORAGE_ENDPOINT / _ACCESS_KEY_ID / _SECRET_ACCESS_KEY / _BUCKET
 * Target: R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET
 *
 * Idempotent: an object already in R2 with the same size is skipped, so an
 * interrupted run can simply be repeated. Nothing in Tigris is deleted, and the
 * database is not touched -- object paths are identical in both buckets, so the
 * rows stay valid. Only after this reports zero failures and zero missing paths
 * should the app (and the Tigris credentials) be switched off.
 *
 * Verification checks every storage_path the database references, when
 * SUPABASE_ACCESS_TOKEN is available, because those are the objects whose
 * absence would be a broken image on the storefront.
 */

import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { readFileSync, existsSync } from "fs";
import { r2Client, r2Missing, listObjects, R2_BUCKET } from "./r2-helpers.mjs";

const RUN = process.argv.includes("--run");

const tigrisRequired = ["TIGRIS_STORAGE_ENDPOINT", "TIGRIS_STORAGE_ACCESS_KEY_ID", "TIGRIS_STORAGE_SECRET_ACCESS_KEY"];
const missing = [...tigrisRequired.filter((k) => !process.env[k]?.trim()), ...r2Missing()];
if (missing.length > 0) {
  console.error(`Missing ${missing.join(", ")}.`);
  process.exit(1);
}

const TIGRIS_BUCKET = process.env.TIGRIS_STORAGE_BUCKET || "artsfashion-media";
const tigris = new S3Client({
  region: "auto",
  endpoint: process.env.TIGRIS_STORAGE_ENDPOINT.replace(/\/+$/, ""),
  credentials: {
    accessKeyId: process.env.TIGRIS_STORAGE_ACCESS_KEY_ID,
    secretAccessKey: process.env.TIGRIS_STORAGE_SECRET_ACCESS_KEY,
  },
});
const r2 = r2Client();

const say = (l, v) => console.log(`  ${l.padEnd(64)} ${v}`);

console.log(`\nMigrate media: ${TIGRIS_BUCKET} (Tigris) -> ${R2_BUCKET} (R2)`);
console.log(`  mode: ${RUN ? "RUN -- objects will be copied" : "dry run (use --run to copy)"}\n`);

const source = await listObjects(tigris, TIGRIS_BUCKET);
const target = new Map((await listObjects(r2, R2_BUCKET)).map((o) => [o.key, o.size]));
console.log(`  objects in Tigris: ${source.length}   already in R2: ${target.size}\n`);

let copied = 0;
let skipped = 0;
let failed = 0;
let bytes = 0;

for (const obj of source) {
  if (target.get(obj.key) === obj.size) {
    skipped++;
    continue;
  }
  if (!RUN) {
    say(obj.key, `would copy ${obj.size} bytes`);
    bytes += obj.size;
    continue;
  }
  try {
    const got = await tigris.send(new GetObjectCommand({ Bucket: TIGRIS_BUCKET, Key: obj.key }));
    const body = Buffer.from(await got.Body.transformToByteArray());
    await r2.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: obj.key,
        Body: body,
        ContentType: got.ContentType || "application/octet-stream",
        CacheControl: got.CacheControl || "public, max-age=31536000, immutable",
      }),
    );
    say(obj.key, `copied ${body.length} bytes`);
    copied++;
    bytes += body.length;
  } catch (e) {
    say(obj.key, `FAILED ${e?.name}: ${String(e?.message).slice(0, 80)}`);
    failed++;
  }
}

console.log(`\n  ${RUN ? "copied" : "would copy"}: ${RUN ? copied : source.length - skipped} (${(bytes / 1024 / 1024).toFixed(1)} MB)`);
console.log(`  already present: ${skipped}`);
console.log(`  failed: ${failed}`);

// Verify against the database: every referenced path must now be in R2.
async function referencedPaths() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const refFile = new URL("../supabase/.temp/project-ref", import.meta.url);
  const ref = process.env.SUPABASE_PROJECT_REF || (existsSync(refFile) ? readFileSync(refFile, "utf8").trim() : "");
  if (!token || !ref) return null;
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      query:
        "SELECT storage_path FROM public.product_images UNION SELECT storage_path FROM public.media_attachments",
    }),
  });
  if (!r.ok) throw new Error(`SQL failed: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()).map((row) => row.storage_path).filter(Boolean);
}

if (RUN) {
  const nowInR2 = new Set((await listObjects(r2, R2_BUCKET)).map((o) => o.key));
  const sourceMissing = source.filter((o) => !nowInR2.has(o.key)).length;
  console.log(`\n  Tigris objects missing from R2: ${sourceMissing}`);
  try {
    const paths = await referencedPaths();
    if (paths) {
      const lost = paths.filter((p) => !nowInR2.has(p));
      console.log(`  database paths checked: ${paths.length}, missing from R2: ${lost.length}`);
      for (const p of lost.slice(0, 20)) console.log(`    - ${p}`);
      if (lost.length > 0) failed++;
    } else {
      console.log("  database check skipped (no SUPABASE_ACCESS_TOKEN / project ref)");
    }
  } catch (e) {
    console.log(`  database check failed: ${e.message}`);
    failed++;
  }
  if (failed > 0 || sourceMissing > 0) {
    console.log(`\nNot complete. Re-run with --run; nothing is lost by repeating it.\n`);
    process.exit(1);
  }
  console.log(`\nAll media is in R2. Next: apply the media_url_prefix migration (see docs/cloudflare.md).\n`);
} else {
  console.log(`\nRe-run with --run to copy.\n`);
}
