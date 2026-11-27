import { existsSync, readdirSync, readFileSync } from "fs";

/**
 * Adds or removes the demo data (supabase/demo/*.sql) through the Supabase
 * Management API, the same way scripts/apply-sql.mjs applies migrations.
 *
 *   node --env-file=.env.local scripts/demo-data.mjs seed --dry-run   # try it, change nothing
 *   node --env-file=.env.local scripts/demo-data.mjs seed             # add the demo rows
 *   node --env-file=.env.local scripts/demo-data.mjs accessories      # add only the demo accessories
 *   node --env-file=.env.local scripts/demo-data.mjs realistic        # re-run only the "real shop" pass + photos
 *   node --env-file=.env.local scripts/demo-data.mjs remove           # delete them again
 *
 * Everything runs in one transaction: if any statement fails, nothing is
 * changed. --dry-run rolls back at the end even when it all works.
 * Every demo row's id starts with "demo-", so real data is never touched.
 *
 * Photos: put files in public/demo/photos/ named after a demo product's slug
 * (kashmir-willow-cricket-bat.jpg, then kashmir-willow-cricket-bat--2.jpg, --3 ...). They
 * replace that product's drawings on the next seed / realistic run.
 *
 * Requires SUPABASE_ACCESS_TOKEN in the environment.
 */
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = process.env.SUPABASE_PROJECT_REF ?? "khebwqdhucrdfpfadxry";
const action = process.argv[2];
const dryRun = process.argv.includes("--dry-run");

if (!["seed", "remove", "accessories", "realistic"].includes(action)) {
  console.error("Usage: node scripts/demo-data.mjs <seed|accessories|realistic|remove> [--dry-run]");
  process.exit(1);
}
if (!accessToken) {
  console.error("SUPABASE_ACCESS_TOKEN is not set. Export it and try again.");
  process.exit(1);
}

const remove = readFileSync("supabase/demo/remove.sql", "utf8");
const files = { seed: ["seed", "seed-extra", "seed-accessories", "seed-realistic"], accessories: ["seed-accessories"], realistic: ["seed-realistic"], remove: [] }[action];
const seed = files.map((f) => readFileSync(`supabase/demo/${f}.sql`, "utf8")).join("\n") + (action === "remove" ? "" : photoSql());
const sql = `BEGIN;
${action === "seed" || action === "remove" ? remove : ""}
${seed}
${dryRun ? "ROLLBACK" : "COMMIT"};
`;

const resp = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: sql }),
});
const text = await resp.text();
if (resp.status >= 400) {
  console.error(`FAILED — nothing was changed.\n${text.substring(0, 1500)}`);
  process.exit(1);
}
console.log(dryRun ? `Dry run OK: the ${action} script runs without errors. Nothing was changed.` : action !== "remove" ? "Demo data added." : "Demo data removed.");
if (!dryRun && action === "seed") console.log("Open /admin to look around. Remove it later with: node --env-file=.env.local scripts/demo-data.mjs remove");

/** UPDATEs that point demo products at real photos in public/demo/photos/ (by slug). */
function photoSql() {
  const dir = "public/demo/photos";
  if (!existsSync(dir)) return "";
  const bySlug = new Map();
  for (const f of readdirSync(dir).sort()) {
    const m = f.match(/^([a-z0-9-]+?)(?:--(\d+))?\.(jpe?g|png|webp|avif)$/i);
    if (!m) continue;
    const list = bySlug.get(m[1]) ?? [];
    list.push({ order: Number(m[2] ?? 1), url: `/demo/photos/${f}` });
    bySlug.set(m[1], list);
  }
  const q = (v) => `'${v.replace(/'/g, "''")}'`;
  return [...bySlug].map(([slug, list]) => {
    const urls = list.sort((a, b) => a.order - b.order).map((x) => x.url);
    return `\nUPDATE public.products SET images = ${q(JSON.stringify(urls))}::jsonb WHERE id LIKE 'demo-%' AND slug = ${q(slug)};`;
  }).join("");
}
