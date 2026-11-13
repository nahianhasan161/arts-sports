import { readFileSync } from "fs";

/**
 * Adds or removes the demo data (supabase/demo/*.sql) through the Supabase
 * Management API, the same way scripts/apply-sql.mjs applies migrations.
 *
 *   node --env-file=.env.local scripts/demo-data.mjs seed --dry-run   # try it, change nothing
 *   node --env-file=.env.local scripts/demo-data.mjs seed             # add the demo rows
 *   node --env-file=.env.local scripts/demo-data.mjs remove           # delete them again
 *
 * Everything runs in one transaction: if any statement fails, nothing is
 * changed. --dry-run rolls back at the end even when it all works.
 * Every demo row's id starts with "demo-", so real data is never touched.
 *
 * Requires SUPABASE_ACCESS_TOKEN in the environment.
 */
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = process.env.SUPABASE_PROJECT_REF ?? "khebwqdhucrdfpfadxry";
const action = process.argv[2];
const dryRun = process.argv.includes("--dry-run");

if (action !== "seed" && action !== "remove") {
  console.error("Usage: node scripts/demo-data.mjs <seed|remove> [--dry-run]");
  process.exit(1);
}
if (!accessToken) {
  console.error("SUPABASE_ACCESS_TOKEN is not set. Export it and try again.");
  process.exit(1);
}

const remove = readFileSync("supabase/demo/remove.sql", "utf8");
const seed = action === "seed" ? readFileSync("supabase/demo/seed.sql", "utf8") : "";
const sql = `BEGIN;
${remove}
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
console.log(dryRun ? `Dry run OK: the ${action} script runs without errors. Nothing was changed.` : action === "seed" ? "Demo data added." : "Demo data removed.");
if (!dryRun && action === "seed") console.log("Open /admin to look around. Remove it later with: node --env-file=.env.local scripts/demo-data.mjs remove");
