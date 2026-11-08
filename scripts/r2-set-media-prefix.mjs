/**
 * Points the database's image URLs at the R2 public URL (or back at the proxy).
 *
 *   node scripts/r2-set-media-prefix.mjs            use R2_PUBLIC_URL from .env
 *   node scripts/r2-set-media-prefix.mjs --proxy    use /api/media (private bucket)
 *   node scripts/r2-set-media-prefix.mjs --show     print the current prefix only
 *
 * The database builds every image URL as media_url_prefix + "/" + path (see
 * migration 20260927120000), and products.images is a materialised copy, so
 * this updates the setting and rebuilds that copy in one statement batch.
 *
 * Run it whenever the public address changes: r2.dev before launch, the
 * custom domain (e.g. https://media.artssports.com) after. Set R2_PUBLIC_URL
 * to the same value in the Worker so new uploads match. Only switch to a
 * public URL after r2-migrate-from-tigris.mjs --run reported zero missing.
 */

import { readFileSync, existsSync } from "fs";
import { R2_PUBLIC_URL } from "./r2-helpers.mjs";

const token = process.env.SUPABASE_ACCESS_TOKEN;
const refFile = new URL("../supabase/.temp/project-ref", import.meta.url);
const ref = process.env.SUPABASE_PROJECT_REF || (existsSync(refFile) ? readFileSync(refFile, "utf8").trim() : "");
if (!token || !ref) {
  console.error("Missing SUPABASE_ACCESS_TOKEN or the Supabase project ref.");
  process.exit(1);
}

async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`SQL failed: ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
}

const current = await sql("SELECT value FROM public.app_settings WHERE key = 'media_url_prefix'");
console.log(`current media_url_prefix: ${current?.[0]?.value ?? "(unset)"}`);
if (process.argv.includes("--show")) process.exit(0);

const next = process.argv.includes("--proxy") ? "/api/media" : R2_PUBLIC_URL;
if (!next) {
  console.error("R2_PUBLIC_URL is not set. Set it in .env, or pass --proxy.");
  process.exit(1);
}
if (!/^(\/api\/media|https:\/\/[^\s'"]+)$/.test(next)) {
  console.error(`Refusing unexpected prefix: ${next}`);
  process.exit(1);
}

const literal = next.replace(/'/g, "''");
await sql(`
  BEGIN;
  INSERT INTO public.app_settings (key, value, updated_at)
  VALUES ('media_url_prefix', '${literal}', now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  UPDATE public.products p
  SET images = (
      SELECT COALESCE(jsonb_agg(
          public.storage_public_url('r2', pi.storage_path)
          ORDER BY pi.is_primary DESC, pi.sort_order ASC, pi.created_at ASC
      ), '[]'::JSONB)
      FROM public.product_images pi
      WHERE pi.product_id = p.id
  )
  WHERE EXISTS (SELECT 1 FROM public.product_images pi WHERE pi.product_id = p.id);
  COMMIT;
`);

const after = await sql("SELECT value FROM public.app_settings WHERE key = 'media_url_prefix'");
const sample = await sql("SELECT images->>0 AS url FROM public.products WHERE jsonb_array_length(images) > 0 LIMIT 1");
console.log(`new media_url_prefix:     ${after?.[0]?.value}`);
console.log(`sample product image:     ${sample?.[0]?.url ?? "(no products with images)"}`);
