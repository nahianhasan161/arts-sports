# Arts Sports

## Overview

Arts Sports is a Bangladesh sports-goods business (football, cricket, badminton,
gym/running) that sells online and from a physical shop. This app runs both in one
system: the public website, with its catalogue, cart and checkout, and an admin
area. The admin area has two apps: **online** (website orders, catalogue, custom jersey
board) and **offline** (POS register, cash drawer, branches). Stock, customers and
products are shared between them. Most buyers come from Facebook and Instagram on
mobile and pay with bKash/Nagad or cash on delivery. The headline product is the
**custom jersey**: you can order just one, it takes 5–7 days to make, 30% is paid in
advance, and our own designer makes the mockup.

## Goals

1. A buyer arriving from Facebook/Instagram can buy in a few steps on one checkout page,
   with no OTP and no account needed.
2. Online store and offline shop run on one system: one stock, one customer list (by phone),
   one product catalogue.
3. Custom jersey orders (online or at the shop counter) move through a tracked workflow
   from estimate → advance payment → design → production → delivery.
4. Staff (1–3 people) can work the shop with permission-limited accounts.

## Core User Flows

**Online buyer**
1. Lands on a product / team / collection page (usually from a social link).
2. Picks a size/variant and adds it to the cart (or uses Buy now).
3. Checkout: phone number (`01XXXXXXXXX`), address, delivery zone (Dhaka / outside).
4. Pays through UnivaPayment (bKash/Nagad) or chooses COD. The server works out the total.
5. Admin confirms, books a courier (Steadfast/Pathao), and the customer tracks the order.

**Custom jersey**
1. Customer fills `/custom-jersey` (fabric, design reference or one of our designs, roster).
2. Gets a link `/custom-jersey/order/[token]` (no login) to see the estimate and pay the advance.
3. Admin moves the order across the board in `/admin/online/custom-orders`.

**Shop (offline)**
1. Staff opens `/admin/offline/pos`, scans or taps products, takes payment, and prints a receipt.
2. Returns, cash drawer, and custom-jersey orders taken at the counter all happen in the same app.

## Features

### Storefront
- Catalogue with categories, filters, teams (`/team/[slug]`) and collections, plus reviews
- Cart, wishlist, one-page checkout, free fake-order checks (risk score, Turnstile)
- Bangla (default) / English switch; light/dark theme
- Tracking: Meta Pixel + CAPI, GA4; Facebook/Instagram catalogue feed

### Custom jersey
- Shared price estimate (`lib/custom-jersey/pricing.ts`), roster CSV/xlsx import, fit measurements
- Design gallery grouped by category (club/country/designer/special/other)
- Status board, advance/balance payments (`custom_order_payments`), notifications

### Shop / back office
- POS register (bill, numpad, product grid, payment screen), receipts, returns, cash drawer
- Stock with history (`stock_apply()`), suppliers, supplier purchases & payments, corrections with reason
- Customer list (CRM) keyed by phone; staff roles and permissions; audit log of who changed what

## Scope

### In Scope
- Next.js website + admin (online and offline apps) on Cloudflare Workers
- Phases 0–4 of `docs/roadmap.md`; Phase 5 (loyalty, affiliate, reminders) and Phase 6 (reports) are next

### Out of Scope (for now)
- Native mobile app. It will be a separate Flutter project later, which is why the business logic
  lives in SQL functions and APIs
- Online card payments (later), paid anti-fraud services, OTP
- 3D store / 360° images: planned only, see `docs/3d-store-and-app.md`

## Success Criteria

1. A guest can order from a product page to a paid or COD order on a phone in under a minute.
2. A shop sale lowers the same stock that the website shows.
3. A custom jersey order can be created, paid in advance, and tracked to delivery without the customer logging in.
4. Every money figure (price, total, payment status) is decided on the server.
