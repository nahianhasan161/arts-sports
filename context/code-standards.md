# Code Standards

## General

- Fix root causes; don't stack workarounds. Keep a module to one job.
- Reuse what exists before adding something new (helpers in `lib/`, primitives in `components/ui/`).
- Big files (`ProductFormModal.tsx`, `types/index.ts`, `admin/online/users/page.tsx`, `checkout/page.tsx`,
  admin products/sizes pages, `docs/roadmap.md`): grep and read line ranges, not the whole file.
- Next 16 differs from training data: if unsure about an API, read the matching file under
  `node_modules/next/dist/docs/01-app/`.

## TypeScript

- `npx tsc --noEmit` must pass. Avoid `any`; shared types go in `src/types/index.ts` or the feature's `types.ts`
  (e.g. `lib/custom-jersey/types.ts`, `lib/pos/types.ts`).
- Check all outside input (request bodies, query params, webhooks, CSV/xlsx imports) before using it.
- Normalise and validate phone numbers with `lib/phone.ts`.

## Next.js

- Server components by default; add `"use client"` only for interactivity.
- Public pages: `getPublicSupabase()`, no `cookies()`/`headers()`, `revalidate = 60` where it applies.
- Heavy client UI (POS grid, shop) is lazy-loaded and has a loading skeleton (`components/ui/PageSkeleton.tsx`, `skeleton.tsx`).
- A new admin page needs: a nav entry (`NAV` or `OFFLINE_NAV` in `components/admin/nav.ts`), the
  `admin.nav.<id>.{name,desc}` text in both locales, and a permission check.

## Styling

- Use the token classes only (`bg-surface-card`, `text-on-surface`, `border-border-light`, `text-text-muted`, `bg-accent-gold`, `bg-surface-container-low`…);
  never `bg-white`, `text-black` or hex values, or dark mode breaks. Tokens: see `ui-context.md`.
- Radius scale and layout patterns: `ui-context.md`.

## i18n

- All new UI text goes through `t()` (server) / `useT()` (client) and is added to **both** `bn` and `en` files.
- Bangla is the default locale. Pick the message file by area: `messages/{en,bn}.ts` (storefront),
  `site.*` (header/footer), `admin.*` (admin menu/dashboards), `shop.*` (POS/stock/purchases).
- Database text with a translation has `*_bn` columns; show the `_bn` value when the locale is Bangla.

## API Routes

- Check auth first (`sessionUser()` / `requireAdmin` / `requirePermission`), then validate input, then act.
- Wrap admin handlers with `handleAdminError` for consistent error responses.
- Writes go through `getServiceSupabase(user)` (audit actor). Multi-step money/stock changes run in one SQL function, not several client calls.

## Data and Storage

- Schema changes = a new file in `supabase/migrations/` named `YYYYMMDDHHMMSS_name.sql`, safe to re-run.
  Note its dependency migrations in a comment at the top.
- Never edit an already-applied migration; add a new one.
- Images go to R2 with a thumbnail; the DB stores only URLs/keys.
- Demo rows use ids starting with `demo-` (`supabase/demo/`).

## File Organization

- `src/app/` — routes; `src/app/api/` — route handlers
- `src/components/ui/` — primitives; `src/components/<feature>/` — feature UI; `src/components/admin/<area>/` — admin UI
- `src/lib/<feature>/` — feature logic (`server.ts` for server-only helpers, `types.ts`, pure shared helpers)
- `src/i18n/messages/` — text
- `supabase/migrations/` — SQL; `scripts/` — one-off tools; `docs/` — plans; `context/` — AI context files
