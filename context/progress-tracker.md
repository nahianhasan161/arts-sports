# Progress Tracker

Update this file after every meaningful change. Newest notes on top in Session Notes.
Detailed phase plans and status boxes: `docs/roadmap.md` (Bangla).

## Current Phase

- Alpha. Phases 0–4 built on branch `cloudflare-migration`; Phase 5/6 not started.

## Current Goal

- Custom jersey design gallery categories + "our designs" picker (online form and POS custom register).

## Completed

- **Phase 0**: payment layer (UnivaPayment + state machine), phone-as-identity, roles, option system
- **Phase 1**: one-page checkout, leads, risk score, courier adapters, tracking, catalogue feed (keys pending)
- **Phase 2**: categories, filters, teams/collections, social proof, reviews. Missing: 2.2 variant picker, 2.4 bundles
- **Phase 3**: custom jersey (form, estimate, token page, admin board, prices, roster import, fit measurements)
- **Phase 4**: POS register, receipts, returns, cash drawer, stock + history, staff permissions, CRM, branches
- Supplier purchases, supplier payments, corrections with reason; audit actor tracking
- Admin split into `/admin/online` and `/admin/offline`; lazy-loaded POS, thumbnails, skeletons
- Migrations live: everything up to `20261117130000`, plus `20261118100000` (roster fit/measurements)

## In Progress (uncommitted)

- **Fabric price by quantity** (migration `20261119100000_fabric_price_tiers.sql`, applied live 2026-11-19): `custom_fabrics.price_tiers` JSONB `[{min, price}]`. Edited on the fabric stock page form (add/delete rows). `estimate()` takes `fabricTiers`: highest tier with min ≤ qty sets the price per piece, below the first tier = `price_per_piece`; a fabric with tiers skips the general % discount tiers. Helpers `normalizeFabricTiers`/`fabricTierPrice` in `lib/custom-jersey/pricing.ts`; passed in all 6 estimate callers; customer form fabric card lists the tiers. Text `shop.fabricStock.tier*`, `customJersey.fabric.tier`.
- **POS catalogue on the device** (no migration): `lib/pos/catalog-store.ts` (Zustand persist on IndexedDB `artssports-pos`; hooks `useCatalogIndex(showroomId)` = catalogue + shop stock + polling, `useCatalog()` = catalogue only; `buildIndex`/`searchLocal` mirror `pos_register_grid` rules),
  server `lib/pos/catalog.ts` (`buildCatalog`: products, prices via `get_effective_prices`, variants, categories, published designs + design categories; `version` = hash of the content, so deletes/promo clock changes count), APIs `api/admin/pos/catalog?have=<version>` (`{same:true}` when unchanged) and `api/admin/pos/stock?showroom_id=`.
  Used by: register grid/search/scan/copy-past-sale, purchase screen grid/search/scan, design picker (designs + products tabs). Stock refresh: open, every 45 s, tab focus, online, after a sale/purchase; catalogue check at most every 2 min (30 s on focus). Before the copy arrives (first open on a device) screens fall back to `/api/admin/pos/products` as before. Each check still builds the full catalogue on the server (fine at shop size; add a cheap `updated_at` pre-check if it gets slow). Not clicked through in a browser yet.
- Search-as-you-type pickers: `components/admin/pickers.tsx` (`CustomerInput` → `/api/admin/pos/customer?q=`, now allowed for pos.use OR customers.view OR orders.manage via `requireAnyPermission`; `SupplierPicker` filters a loaded list by name/phone). Used in POS custom register + NewCustomOrder (phone & name), manual online order (name & phone, fills email), fabric/accessory purchase, production print/garments supplier, stock receive worksheet. POS bill and purchase screen already had their own. Text `shop.picker.*`.
- **Custom jersey making cost** (migration `20261118150000_production_costing.sql`, applied live 2026-11-19):
  accessories stock in pieces (`custom_accessories`, `accessory_moves`, view `accessory_stock`, `accessory_purchase()`), production batches
  `PB-1001` (`production_batches` + `production_batch_lines` (order, pieces, sleeve/collar, shorts, garments rate) + `production_costs`
  (travel/transport/labour/food/other)), `fabric_moves.batch_id`, `production_use()` (fabric/accessory out of stock at average cost, optional order tag),
  `production_batch_save()`, `production_batch_status()` (done locks; void needs reason, returns stock, clears the dues).
  Views `production_batch_totals`, `production_line_costs` (per line: own garments + material tagged to the order + shared costs split by pieces).
  `supplier_balances` now also adds accessory purchases, printing (`print_supplier_id`, per kg / per piece / lump) and garments charges while the batch is not void.
  Garments rate card by style in `app_settings.garment_rates` (JSON). Pages `/admin/{online,offline}/accessory-stock` and `/production`
  (`components/admin/production/{AccessoryStock,Production}.tsx`, APIs `api/admin/accessory-stock`, `api/admin/production`, types `lib/custom-jersey/production.ts`,
  text `shop.accessoryStock.*`, `shop.production.*`, nav `accessoryStock`/`production`, perm `inventory.manage`). Batch page shows cost per jersey and per order with price/profit.
  Not done: supplier detail page doesn't list fabric/accessory/printing/garments rows (the due includes them); custom order board doesn't show the cost yet; not clicked through in a browser.
- Receipt "Copy as image" button (both receipt pages): `components/admin/pos/CopyImageButton.tsx` (lib `modern-screenshot`), copies the customer copy as PNG to the clipboard for pasting in Messenger/WhatsApp; falls back to downloading the PNG. Separate "Download image" button (same component, `mode="download"`). Text `shop.receipt.copy*`, `downloadImage*`.
- Receipt settings: page `/admin/offline/receipt-settings` (nav `receiptSettings`, perm `settings.manage`), API `api/admin/pos/receipt-settings` (GET pos.use / PUT settings.manage), stored as JSON in `app_settings.receipt_settings` (no migration). Shop name, address, phone, email, website, logo (uploaded via custom-jersey upload kind `gallery`), sale terms, custom-jersey terms, last line. Both receipt pages use `components/admin/pos/ReceiptShop.tsx`; empty fields fall back to config/i18n defaults.
- Fabric CRUD on the fabric stock page (no migration): "Add fabric" form + edit (name en/bn, kg per piece, warn at, "show to customers" = `is_active`, customer price per piece) + delete on each card. API `api/admin/fabric-stock` actions `fabric` / `delete_fabric`. Delete is refused when the fabric has any `fabric_moves` (the FK cascades and would wipe stock history + supplier due); the Jersey prices page delete got the same guard. A fabric that is off (stock only) is still offered in the production material picker. Not clicked through in a browser.
- Fabric stock (raw material, kg): migration `20261118140000_fabric_stock.sql` (applied live 2026-11-18): `custom_fabrics.kg_per_piece/low_stock_kg`, table `fabric_moves` (purchase/used/wastage/adjust, void with reason), view `fabric_stock`, `fabric_purchase()` (optional payment via `supplier_pay`), `supplier_balances` now adds fabric purchases to the supplier's due. Page `/admin/{online,offline}/fabric-stock` (`components/admin/fabric-stock/FabricStock.tsx`, API `api/admin/fabric-stock`, text `shop.fabricStock.*`). Not done: the supplier detail page lists only goods purchases (the due includes fabric); no auto-deduct when an order goes into production
- List filters: shared `components/admin/filters/period.tsx` (`PeriodSelect`, `periodRange`, `inPeriod`; Dhaka days; text `shop.filters.*`).
  `/api/admin/pos/sales` now takes `from`/`to`/`status`/`staff`. Added to: POS register Orders + offline orders (date, status, total shown),
  online orders (date, payment method, phone search; "Call to confirm"/"Awaiting payment" options now work), payments/returns/cancellations (date),
  purchase lists (search, date, due only), custom orders (date, urgent), leads (search, date), catalogue/categories/reviews (search; reviews stars).
  Payments/returns/cancellations are paged by the server, so their date filter only covers the loaded page.

- `20261118120000_custom_gallery_categories.sql`: adds `category`/`title` to `custom_gallery` + table `custom_design_categories` (applied live 2026-11-18)
- `20261118130000_custom_gallery_images.sql`: `custom_gallery.images text[]` (all pictures, cover first; `image_url` = cover). Applied live 2026-11-18.
- Design picker: `components/custom-jersey/OurDesignsPicker.tsx`, `usePasteDrop.ts`, POS `register/DesignRefs.tsx`,
  APIs `api/custom-jersey/designs`, `api/admin/pos/designs`; gallery page and admin custom-jersey page updates
- URL state for screens/modals: `lib/url-state.ts` (`useUrlState`, `writeUrlParams`). POS `?type=custom-jersey|orders`, `?popup=`; designs `?category=`, `?design=<id>`, `?edit_category=<slug|new>`. Other admin modals not done yet
- Designs catalogue: tick designs → "Make custom jersey" opens `/admin/offline/custom-jersey?designs=id,id` with them on the slip (max 10)

## Next Up

- Finish and commit the gallery categories work (migration `20261118120000` applied live 2026-11-18); click through /admin/online/designs
- Click through the Phase 4 screens with real data (so far only the SQL was smoke-tested)
- Phase 2b: 2.2 variant picker, 2.4 kit/bundle
- Phase 4 gaps: supplier stock in online checkout, shop pickup, gateway QR at POS
- Then Phase 5 (loyalty, affiliate, referral, reminders) → Phase 6 (reports)

## Open Questions

- Printing/garments charges count toward the supplier due as soon as a batch has them (not only when marked done). Confirm this is how the shop wants it.
- Real garments rates per style (rate card starts at 0)
- Real custom-jersey prices (seeded ones are placeholders)
- Keys still pending: Steadfast/Pathao (sandbox test first), Meta Pixel/CAPI, GA4, Turnstile, Google One Tap,
  WhatsApp/Messenger links; a small real UnivaPayment test
- Product share images (1.6): separate Worker or paid plan (Worker is near the 3 MiB limit)

## Architecture Decisions

- **Delivery fee: Dhaka ৳70, outside ৳120** (confirmed by owner 2026-11-18). Live values are the admin settings
  `delivery_fee_dhaka`/`delivery_fee_outside`; code fallbacks and the manual-order form use the same numbers.

- **Cloudflare Workers + OpenNext** instead of Vercel; ISR cache in R2. Why: cost and edge hosting with R2 images.
- **Separate tables per channel** (`orders`, `pos_sales`, `custom_order_payments`). Why: different lifecycles, simpler queries.
- **Money and stock logic in SQL functions**. Why: one source of truth, atomic, and reusable by the future Flutter app.
- **Phone = customer identity, no OTP**. Why: social buyers; fake orders are stopped with free signals only.
- **Custom jersey access by URL token**. Why: no login friction for teams ordering.
- **Two admin apps behind one gate**. Why: shop staff need a simple POS-first menu; data is still shared.
- **Bangla default locale**. Why: the main audience.

## Session Notes

- 2026-11-18: Custom jersey making cost (accessories stock + production batches). Owner chose: one batch holds many orders; printing by an outside print shop (supplier); garments paid per piece by style; accessories counted in pieces. See In Progress. Migration `20261118150000` applied live 2026-11-19.
- 2026-11-18: POS register speed-up: the catalogue is kept on the device. `lib/pos/catalog-store.ts` (Zustand persist on IndexedDB, `check()`, `loadStock()`, `buildIndex`/`searchLocal`), server `lib/pos/catalog.ts` (`buildCatalog` hashes the content as `version`; `loadShelf`), APIs `GET /api/admin/pos/catalog?have=<version>` (answers `{same:true}` when unchanged) and `GET /api/admin/pos/stock?showroom_id=`. Register opens from the saved copy; the grid, categories, search and scans run locally; stock refreshes on open, after each sale, every 45 s and when the tab comes back; the catalogue is checked every 2 min. Falls back to `/api/admin/pos/products` until the copy and stock are loaded, and for a scan the copy doesn't know. No migration. A content hash is used instead of `updated_at` because promotions start and end on a timer. Not clicked through in a browser yet. Later: Supabase Realtime on stock instead of the timer.
- 2026-11-18: Offline orders page (`components/admin/pos/SalesTab.tsx`) redesigned: date boxes always shown first (default today) with ◀ ▶ and quick chips (`periodDays`/`matchPeriod`/`shiftDays` in `filters/period.tsx`), status/payment/staff filters, totals (bills, sold, returned, net, by method), bills grouped by day, CSV download, filters + open bill kept in the URL (`from`/`to`/`status`/`method`/`staff`/`sale`), bottom sheet on phones. `/api/admin/pos/sales` list now also returns `paid` (by method), `item_count`, `has_more`. Not clicked through in a browser yet.
- 2026-11-18: Bangla custom-jersey text says ফেব্রিক instead of কাপড় (bn.ts, shop.bn.ts, POS guide). Added fabric stock (see In Progress).
- 2026-11-18: Design catalogue page `/admin/{online,offline}/designs` (register-style tiles + cards, add categories, bulk upload/paste, edit, move, hide). Categories moved from a fixed list to table `custom_design_categories` (seeded club/country/designer/player/special/other) in `20261118120000` (applied live 2026-11-18). Gallery page, website picker and POS picker read categories from the DB. Old gallery section removed from the prices page.
- 2026-11-18: Added "player" (Player Edition) to gallery design categories (types, migration CHECK, admin labels, en/bn).
- 2026-11-18: Filled `context/` templates for this project and linked them from `CLAUDE.md`.
  Gallery-categories work above is uncommitted.
- 2026-11-18: Delivery fee set to ৳70 Dhaka in code defaults, manual order form/API and shipping-policy page. Live setting row still needs changing in Admin → Settings if it says 60.
- 2026-11-18: A design can have several pictures (up to 12). Editor: picture strip, add, drag-drop or paste, reorder, make cover, remove. Dropping files on a design card adds them to that design. The gallery page shows the extra pictures as thumbnails. Needs migration `20261118130000`.

- 2026-11-18: Design catalogue full-screen viewer (`components/admin/designs/DesignSlideshow.tsx`): "Show full screen" button on /admin/{online,offline}/designs (published designs of the open category) + button on the design editor picture. Keys ←/→ picture, ↑/↓ design, F, Esc; swipe on touch. Not clicked through in a browser yet.
