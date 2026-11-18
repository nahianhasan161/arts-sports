# Arts Sports — Claude quick context

Bangladesh sports e-commerce + (planned) offline POS. Custom jersey is the key product.
**Read only what the task needs.** This file is the map; don't re-explore the repo.

## Context files (read at session start)
Always read `context/progress-tracker.md` first (current goal, in-progress work, open questions).
Read the others when the task touches them:
- `context/project-overview.md`: what the product is, user flows, scope
- `context/architecture.md`: stack, boundaries, storage, auth, **invariants** (new routes, tables, features)
- `context/code-standards.md`: TS/Next/i18n/API/migration conventions
- `context/ui-context.md`: colour tokens, fonts, radius, layouts, icons (any UI work)
- `context/ai-workflow-rules.md`: scoping, what to ask before doing, definition of done
After meaningful work, update `context/progress-tracker.md` (and the other context files if a decision changed).

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
  admin `/admin/online/catalog` + `/admin/online/reviews`; SQL `20261111100000_catalog_phase2.sql` (needs `20261108200000` first)
- Custom jersey (Phase 3): `lib/custom-jersey/` (`pricing.ts` shared estimate, `server.ts` status moves/payments/notify,
  `roster.ts` CSV/xlsx import), `components/custom-jersey/`, pages `/custom-jersey`, `/custom-jersey/order/[token]`,
  admin `/admin/online/custom-orders` (board) + `/admin/online/custom-jersey` (prices); SQL `20261113100000_custom_jersey.sql`.
  Its payments are in `custom_order_payments`, not `payments`. Customer access = `access_token` in the URL, no login.
  Design catalogue: admin `/admin/{online,offline}/designs` (`components/admin/designs/DesignCatalog.tsx`, API `api/admin/custom-jersey/designs`);
  categories are rows in `custom_design_categories` (staff add them), designs are `custom_gallery`; helpers `lib/custom-jersey/designs{,-server}.ts`.
  Fabric stock (kg): `/admin/{online,offline}/fabric-stock`, API `api/admin/fabric-stock`, `lib/custom-jersey/fabric-stock.ts`,
  table `fabric_moves` + view `fabric_stock` + `fabric_purchase()`, SQL `20261118140000_fabric_stock.sql` (applied live 2026-11-18).
  Making cost: accessories stock (pcs) `/admin/{online,offline}/accessory-stock` + production batches `/production`
  (`components/admin/production/`, APIs `api/admin/{accessory-stock,production}`, `lib/custom-jersey/production.ts`; garments rate card
  in `app_settings.garment_rates`). SQL `20261118150000_production_costing.sql` (applied live 2026-11-19): batch = many orders, print shop +
  garments are suppliers (their charges go into `supplier_balances`), cost views `production_batch_totals` / `production_line_costs`.
- Shop (Phase 4): `lib/pos/` (`server.ts` helpers + error text, `codes.ts` Code128/QR, `types.ts`), `components/admin/pos/` +
  `components/admin/inventory/`, pages under `/admin/offline` (see below), `/admin/online/inventory`, `/admin/online/customers`;
  APIs `api/admin/{pos,inventory,customers}`; SQL `20261114100000_pos_stock_crm.sql` (needs `20261113100000` first).
  Shop sales are in `pos_sales`/`pos_sale_items`/`pos_payments`, not `orders`. Stock changes go through `stock_apply()`.
  Register catalogue is cached on the device: `lib/pos/catalog-store.ts` (IndexedDB) + `lib/pos/catalog.ts`, APIs `api/admin/pos/{catalog,stock}`.
  POS catalogue is kept on the device: `lib/pos/catalog-store.ts` (+ `catalog.ts`, APIs `pos/catalog`, `pos/stock`); screens search it locally.
  Text for these screens: `i18n/messages/shop.{en,bn}.ts`. Staff accounts enter `/admin`; the menus filter by permission.
- Supplier purchases: pages `/admin/{online,offline}/purchases` (POS-style buy screen) and `/suppliers`, `/suppliers/[id]`
  (details, bought/paid/due, pay form); `components/admin/purchases/`, `lib/pos/purchases.ts` + `purchase-types.ts`,
  API `api/admin/purchases` + `api/admin/inventory/suppliers?id=`. SQL `20261117120000_supplier_purchases.sql`
  (`supplier_purchase()` wraps `inventory_receive`, `supplier_pay()`, `supplier_payments`, view `supplier_balances`).
  Corrections: `supplier_purchase_edit()` / `supplier_payment_void()` (reason required, kept in `stock_receipt_edits`),
  SQL `20261117130000_audit_actor_and_corrections.sql`.
- Audit "who": routes that write must call `getServiceSupabase(user)` (sends `x-actor-id`; `audit_row_change` records
  that person). A bare `getServiceSupabase()` write is logged as "system". SQL fns can also `set_config('app.actor_id')`
  and `app.audit_reason`. History UI: `components/admin/purchases/History.tsx`, Stock row history `inventory/ItemHistory.tsx`.
- Client i18n: `useT()` from `src/i18n/client.ts` (reads the `lang` cookie). **Bangla is the default locale**; English is the switch.
  Header/footer text: `i18n/messages/site.{en,bn}.ts`. Admin menu, dashboards, branches: `admin.{en,bn}.ts`.
- Theme: light/dark via the `dark` class on `<html>` (`lib/theme.ts`, toggles in `components/layout/Preferences.tsx`).
  Brand colours are CSS variables in `globals.css` (`--c-*`), mapped in `tailwind.config.ts`. Use the token classes
  (`bg-surface-card`, `text-on-surface`, `border-border-light`...), not `bg-white`/hex, or dark mode breaks.
- Admin = two apps under one gate (`app/admin/layout.tsx`: auth + permissions, context in `components/admin/access.tsx`):
  **`/admin/online`** (website; sidebar shell `online/layout.tsx`, menu `NAV` in `components/admin/nav.ts`) and
  **`/admin/offline`** (shop; top-menu shell `offline/layout.tsx`, menu `OFFLINE_NAV`). `/admin` is the app chooser.
  Products, stock, customers are shared: the offline pages re-export the online ones. Old `/admin/<page>` URLs are
  redirected in `middleware.ts` via `lib/admin/paths.ts`. A new page needs a nav entry and `admin.nav.<id>.{name,desc}` text.
  The site header/footer are hidden under `/admin` (`components/layout/SiteChrome.tsx`).
- Offline app: `/admin/offline` (shop cards, `api/admin/store/overview`), `/admin/offline/pos` = full-screen register
  (`components/admin/pos/register/`: bill + numpad, product grid, payment screen; text `shop.register.*`), `orders` (bills/returns),
  `custom-jersey`, `cash` (drawer), `branches` (= `showrooms` table); receipts at `/admin/offline/pos/{receipt,custom-receipt}/[id]`.
  Online dashboard: `/admin/online` (`api/admin/overview`); guide text in `components/admin/help/guide.ts`.
- Demo data: `supabase/demo/{seed,remove}.sql`, run with `node --env-file=.env.local scripts/demo-data.mjs seed|remove [--dry-run]`.
  All demo ids start with `demo-`. Ask before running it on the live DB.
- Stores: `lib/store/` (cart, wishlist)
- DB schema: `supabase/migrations/*.sql` is the truth. `supabase/schema.sql` is old/legacy.
- `scripts/` = one-off diag/test scripts; ignore unless relevant.

## Big files — grep/read ranges, don't read whole
`components/admin/products/ProductFormModal.tsx` (1.5k lines), `types/index.ts` (1.1k),
`app/admin/online/users/page.tsx` (1k), `app/admin/online/products/page.tsx`, `app/admin/online/sizes/page.tsx`,
`app/checkout/page.tsx`, `docs/roadmap.md` (Bangla, 400 lines), `docs/3d-store-and-app.md`.
For docs, `grep -n '^#'` first and read just the relevant section.

## Conventions
- Phone = customer identity, format `01XXXXXXXXX` (`lib/phone.ts`)
- Currency BDT (৳). Delivery: Dhaka ৳70, outside ৳120 (live values = admin settings `delivery_fee_dhaka`/`_outside`)
- Speed: public pages read through `getPublicSupabase()` (`lib/supabase/public.ts`, no cookies) so they stay ISR-cacheable;
  home/product/team/collection use `revalidate = 60` (R2 cache in `open-next.config.ts`, binding `NEXT_INC_CACHE_R2_BUCKET`).
  Don't read cookies/headers on those pages. Middleware only does auth for `/admin` and `/account` pages; APIs check auth
  themselves (`sessionUser()` = `getClaims()`). Product grids show `thumbUrl()` (`lib/media/thumb.ts`, `<uuid>-thumb.webp`,
  made in the browser via `appendImageFiles`; old images: `node scripts/backfill-thumbs.mjs --run`).
- Features turn on only when their env keys are set (see `.env.example`); keep that pattern
- Migrations must be safely re-runnable (drop-if-exists before create)
- Never read or print `.env*` secrets; use `.env.example` for key names
- Don't touch `.next/`, `.open-next/`, `.wrangler/`, `node_modules/` (except Next docs)

## Current state
(Live detail, in-progress work and next steps: `context/progress-tracker.md`.)
- `20261118120000` (design catalogue: `custom_design_categories` table + `custom_gallery.category/title`) applied live 2026-11-18.
  `20261118130000` (`custom_gallery.images`, several pictures per design) applied live 2026-11-18.
- Branch `cloudflare-migration`. Phase 0 and 1 built (keys pending, see roadmap "পরে করার কাজ"). Phase 2 built except 2.2 picker + 2.4 bundles.
- Phase 3 (custom jersey) built; the seeded prices are placeholders. See the status box under Phase 3 in the roadmap.
- Phase 4 (POS, stock, staff, customers) built. Left out: supplier stock in online checkout, shop pickup, gateway QR at POS.
  See the status box under Phase 4 in the roadmap.
- All migrations up to `20261117120000` (supplier purchases) are applied live (2026-11-17). The Phase 4 SQL functions were smoke-tested in a
  rolled-back transaction; the screens have not been clicked through with real data.
  `20261117130000` (audit actor + purchase corrections) applied live 2026-11-17; `20261118100000` (roster fit/measurements) applied live 2026-11-18; `20261119110000` (custom payment guards) applied live 2026-11-19.
- Plans: `docs/roadmap.md` (phases), `docs/3d-store-and-app.md` (3D/360°/Flutter), `docs/cloudflare.md` (deploy/R2)

## Alpha → live checklist (do once, at launch; ask the user before each step)
Alpha data may be thrown away. Before the first real launch:
1. Remove demo rows: `node --env-file=.env.local scripts/demo-data.mjs remove` (ids `demo-*`).
2. Clear test orders/payments/POS bills made while testing (ask which; don't guess).
3. Apply any pending migrations (`node scripts/apply-sql.mjs`); all up to `20261117120000` are already live.
4. One-time infra: `npx wrangler r2 bucket create artssports-next-cache`; `node scripts/backfill-thumbs.mjs --run`;
   Supabase JWT signing keys on. None of these repeat per deploy.
Money rule: prices, totals and payment status are always decided server-side (order RPC, `pos_create_sale`,
custom-jersey `estimate()`, gateway webhooks). The 60 s page cache only affects what is *shown*.
