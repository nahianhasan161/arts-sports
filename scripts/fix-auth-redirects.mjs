// Points Supabase Auth at the Cloudflare site: sets site_url and ADDS the
// workers.dev + localhost callback patterns to the redirect allow-list
// (existing entries are kept). Without this, Google sign-in on the Worker
// falls back to site_url, which was still the old Vercel app.
//
// Run: node --env-file=.env.local scripts/fix-auth-redirects.mjs
// Override the site with SITE=https://example.com when the domain changes.
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error("SUPABASE_ACCESS_TOKEN is not set.");
  process.exit(1);
}
const ref = process.env.SUPABASE_PROJECT_REF ?? "khebwqdhucrdfpfadxry";
const site = (process.env.SITE ?? "https://arts-sports.arts-sports.workers.dev").replace(/\/$/, "");
const api = `https://api.supabase.com/v1/projects/${ref}/config/auth`;
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

const current = await (await fetch(api, { headers })).json();
const list = new Set(
  (current.uri_allow_list || "").split(",").map((s) => s.trim()).filter(Boolean)
);
// `**` also matches the ?next=... query string the Google button adds.
[`${site}/**`, "http://localhost:3000/**"].forEach((u) => list.add(u));

const res = await fetch(api, {
  method: "PATCH",
  headers,
  body: JSON.stringify({ site_url: site, uri_allow_list: [...list].join(",") }),
});
const body = await res.json();
if (!res.ok) {
  console.error(res.status, body.message);
  process.exit(1);
}
console.log("site_url =", body.site_url);
console.log("uri_allow_list =", body.uri_allow_list);
