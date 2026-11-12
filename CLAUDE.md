# Arts Sports — Claude quick context

Bangladesh sports e-commerce + (planned) offline POS. Custom jersey is the key product.
**Read only what the task needs.** This file is the map; don't re-explore the repo.

## Stack
- Next.js 16 App Router (webpack mode), React 19, TS, Tailwind 3, shadcn/base-ui, Zustand, TipTap
- Supabase = DB + auth. Images = Cloudflare R2 (falls back to Tigris if R2 keys unset)
- Hosting: Cloudflare Workers via OpenNext (`wrangler.jsonc`, `open-next.config.ts`)
- Next 16 differs from training data: if unsure about an API, read only the matching file
  under `node_modules/next/dist/docs/01-app/` (see AGENTS.md). Uses `src/middleware.ts`.

## Commands
- `npm run dev` / `npm run build` / `npm run lint` / `npx tsc --noEmit` (typecheck)
- `npm run deploy` (Cloudflare) — only when asked
- Migrations: `node scripts/apply-sql.mjs` (pending) or `--only <timestamp>`; needs
  `SUPABASE_ACCESS_TOKEN`. Supabase CLI can't reach the DB here. Never `--force`.
  **Ask before applying any migration to the live DB.**

## Layout (where to look)
- `src/app/` pages; `src/app/admin/*` admin pages; `src/app/api/*` route handlers
- `src/lib/admin/auth.ts` — `requireAdmin`, `requireSuperAdmin`, `requireUser`, `handleAdminError`
- `src/lib/auth/permissions.ts` — `requirePermission("orders.manage")` etc. (codes mirror `permissions` table)
- Supabase clients: `lib/supabase/client.ts` (browser, `getSupabaseBrowserClient`),
  `server.ts` (`getSupabaseServerClient`), `service.ts` (`getServiceSupabase`, bypasses RLS, server only),
  `lib/admin/supabase.ts` (`getAdminSupabase`)
- Payments: `lib/payments/` (gateway interface in `gateway/`, UnivaPayment impl, `state-machine.ts`)
- Courier: `lib/courier/` (Steadfast, Pathao). Tracking: `lib/tracking/` (Meta Pixel/CAPI, GA4)
- Pricing: `lib/pricing.ts` (must match the order RPC in SQL; `scripts/test-pricing-parity.mjs`)
- i18n: `src/i18n/` + `messages/{en,bn}.ts`; new UI text goes through `t()`. DB has `*_bn` columns.
- Types: `src/types/index.ts` (large — grep for the type you need)
- Catalogue (Phase 2): `lib/services/catalog.ts` (terms, collections, reviews reads), pages `/team/[slug]`, `/collection/[slug]`,
  admin `/admin/catalog` + `/admin/reviews`; SQL `20261111100000_catalog_phase2.sql` (needs `20261108200000` first)
- Custom jersey (Phase 3): `lib/custom-jersey/` (`pricing.ts` shared estimate, `server.ts` status moves/payments/notify,
  `roster.ts` CSV/xlsx import), `components/custom-jersey/`, pages `/custom-jersey`, `/custom-jersey/order/[token]`,
  admin `/admin/custom-orders` (board) + `/admin/custom-jersey` (prices); SQL `20261113100000_custom_jersey.sql`.
  Its payments are in `custom_order_payments`, not `payments`. Customer access = `access_token` in the URL, no login.
- Client i18n: `useT()` from `src/i18n/client.ts` (reads the `lang` cookie)
- Stores: `lib/store/` (cart, wishlist)
- DB schema: `supabase/migrations/*.sql` is the truth. `supabase/schema.sql` is old/legacy.
- `scripts/` = one-off diag/test scripts; ignore unless relevant.

## Big files — grep/read ranges, don't read whole
`components/admin/products/ProductFormModal.tsx` (1.5k lines), `types/index.ts` (1.1k),
`app/admin/users/page.tsx` (1k), `app/admin/products/page.tsx`, `app/admin/sizes/page.tsx`,
`app/checkout/page.tsx`, `docs/roadmap.md` (Bangla, 400 lines), `docs/3d-store-and-app.md`.
For docs, `grep -n '^#'` first and read just the relevant section.

## Conventions
- Phone = customer identity, format `01XXXXXXXXX` (`lib/phone.ts`)
- Currency BDT (৳). Delivery: Dhaka ৳60, outside ৳120
- Features turn on only when their env keys are set (see `.env.example`); keep that pattern
- Migrations must be safely re-runnable (drop-if-exists before create)
- Never read or print `.env*` secrets; use `.env.example` for key names
- Don't touch `.next/`, `.open-next/`, `.wrangler/`, `node_modules/` (except Next docs)

## Current state
- Branch `cloudflare-migration`. Phase 0 and 1 built (keys/migration pending, see roadmap "পরে করার কাজ"). Phase 2 built except 2.2 picker + 2.4 bundles; its migration is NOT applied live.
- Phase 3 (custom jersey) built; its migration is NOT applied live and has never been run against a Postgres, and the seeded prices are placeholders. See the status box under Phase 3 in the roadmap.
- Plans: `docs/roadmap.md` (phases), `docs/3d-store-and-app.md` (3D/360°/Flutter), `docs/cloudflare.md` (deploy/R2)
