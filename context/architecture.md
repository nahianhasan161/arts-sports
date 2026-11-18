# Architecture Context

## Stack

| Layer      | Technology                                            | Role |
| ---------- | ----------------------------------------------------- | ---- |
| Framework  | Next.js 16 App Router (webpack), React 19, TypeScript | Pages, route handlers, middleware (`src/middleware.ts`) |
| UI         | Tailwind 3, shadcn on base-ui, lucide-react, TipTap   | Components, rich text in admin |
| State      | Zustand (`lib/store/`)                                 | Cart, wishlist on the client |
| Auth       | Supabase Auth                                          | Customers + staff; permissions in DB |
| Database   | Supabase Postgres (+ RLS, SQL functions/RPCs)          | All business data and money logic |
| Files      | Cloudflare R2 (falls back to Tigris if R2 keys unset)  | Product/design images, thumbnails |
| Hosting    | Cloudflare Workers via OpenNext                        | `wrangler.jsonc`, `open-next.config.ts`, ISR cache in R2 |
| Payments   | UnivaPayment (bKash, Nagad), `lib/payments/`           | Gateway interface + state machine |
| Courier    | Steadfast, Pathao, `lib/courier/`                      | Booking, tracking webhooks |
| Analytics  | Meta Pixel/CAPI, GA4, `lib/tracking/`                  | Conversion tracking |

## System Boundaries

- `src/app/` — public pages; `src/app/admin/online/*` (website admin, sidebar shell) and
  `src/app/admin/offline/*` (shop admin, top-menu shell); `/admin` is the app chooser
- `src/app/api/*` — route handlers; each checks auth itself (`sessionUser()`, `requireAdmin`, `requirePermission`)
- `src/lib/` — server and shared logic: `supabase/`, `admin/`, `auth/`, `payments/`, `courier/`, `tracking/`,
  `custom-jersey/`, `pos/`, `services/`, `media/`, `pricing.ts`, `phone.ts`
- `src/components/` — UI; `components/ui/` = base primitives; `components/admin/*` per admin area
- `src/i18n/` — locales, `t()` / `useT()`, message files per area
- `supabase/migrations/` — **source of truth for the schema** (`supabase/schema.sql` is legacy)
- `scripts/` — one-off maintenance/diagnostic scripts (`apply-sql.mjs`, `demo-data.mjs`, parity tests)

## Storage Model

- **Postgres (Supabase)**: products, variants, stock + stock history, orders, payments, custom orders and
  their payments, POS sales/payments, suppliers, customers, permissions, audit log, settings.
  Separate tables per channel: `orders`/`payments` (online), `pos_sales`/`pos_sale_items`/`pos_payments`
  (shop), `custom_order_payments` (custom jersey).
- **R2**: images. Each image has a `<uuid>-thumb.webp` thumbnail made in the browser on upload (`appendImageFiles`);
  grids show `thumbUrl()`.
- **R2 (`NEXT_INC_CACHE_R2_BUCKET`)**: OpenNext incremental/ISR cache.
- **Browser**: cart/wishlist (Zustand), `lang` and theme cookies.

## Auth and Access Model

- Customers are identified by **phone** (`01XXXXXXXXX`); login is optional for buying.
- Custom jersey customers reach their order through an `access_token` in the URL, with no login.
- Staff log in with Supabase Auth and enter `/admin`. `app/admin/layout.tsx` gates auth and loads permissions,
  `components/admin/access.tsx` supplies them as context, and the menus filter by permission.
- Server checks: `requireAdmin` / `requireSuperAdmin` / `requireUser` (`lib/admin/auth.ts`),
  `requirePermission("orders.manage")` (`lib/auth/permissions.ts`; codes mirror the `permissions` table).
- Middleware handles auth only for `/admin` and `/account` pages, plus old `/admin/<page>` redirects (`lib/admin/paths.ts`).
- `getServiceSupabase()` bypasses RLS and is server-only. Writes use `getServiceSupabase(user)` so the audit log records the actor.

## Invariants

1. **Money is decided on the server**: order RPC, `pos_create_sale`, custom-jersey `estimate()`, gateway webhooks.
   Client totals are for display only. `lib/pricing.ts` must match the SQL order RPC (`scripts/test-pricing-parity.mjs`).
2. **Stock changes only through `stock_apply()`** (or SQL functions that wrap it, e.g. `supplier_purchase()`).
3. **Public pages stay cacheable**: they read with `getPublicSupabase()` and never read cookies/headers;
   home/product/team/collection use `revalidate = 60`.
4. **Audited writes carry the actor**: `getServiceSupabase(user)` → `x-actor-id`; SQL can set `app.actor_id` / `app.audit_reason`.
   Corrections (purchase edit, payment void) need a reason.
5. **Migrations can be re-run safely** (drop-if-exists before create) and are applied to the live DB only after the user says yes.
6. **Features turn on through env keys**: a feature with missing keys switches itself off, it never crashes (see `.env.example`).
7. Business logic lives in SQL functions + APIs so that the future Flutter app can reuse it.
