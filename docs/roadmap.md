# Arts Sports — Product Roadmap

শুধু খেলাধুলার জিনিসের, বাংলাদেশ-ভিত্তিক ecommerce + offline store system।
মূল লক্ষ্য দুটো:

1. Facebook আর Instagram থেকে আসা মানুষ যেন অল্প কয়েক ধাপে কিনতে পারে।
2. Offline dokan আর online store এক system-এ চলবে: stock, customer আর order একসাথে।

বিশেষ product: **custom jersey**।

> এই file-টা চলমান plan। কোনো সিদ্ধান্ত বদলালে এখানে update করুন।

> 3D দোকান, 360° ছবি, custom jersey-র live preview আর Flutter অ্যাপের plan আলাদা file-এ: [3d-store-and-app.md](3d-store-and-app.md)।

## নেওয়া সিদ্ধান্ত (2026-11-08)

| বিষয় | সিদ্ধান্ত |
| --- | --- |
| Payment gateway | **UnivaPayment** (নিজেদের, [univapayment-web](https://github.com/nahianhasan161/univapayment-web))। এখন bKash আর Nagad। Card পরে UnivaPayment-এ বা অন্য gateway দিয়ে। |
| Courier | **Steadfast + Pathao**, এলাকা আর খরচ দেখে বাছাই |
| Delivery charge | ঢাকার ভেতরে **৳৬০**, বাইরে **৳১২০** |
| পুরো টাকা আগে দিলে | আলাদা কোনো সুবিধা নেই |
| ভুয়া order আটকানো | **শুধু free উপায়**, কোনো paid service না, OTP না |
| খেলা | Football, Cricket, Badminton, Gym/Running |
| ভাষা | বাংলা + English switch |
| WhatsApp Business | আছে, order confirm আর যোগাযোগে ব্যবহার হবে |
| Custom jersey | ১টা থেকে order, ৫–৭ দিনে তৈরি, ৩০% অগ্রিম, mockup নিজেদের designer বানাবে, design confirm হলে আর ফেরত নেই |
| কাপড় | Mesh, Interlock/PP, Polo pique, Jacquard/premium; admin নতুন কাপড় যোগ করতে পারবে |
| দোকান ও stock | এখন ১টা দোকান (পরে আরো), নিজেদের primary stock, আর supplier-এর secondary stock |
| Hardware | A4 printer আছে, barcode scanner কেনা হবে |
| Staff | ১–৩ জন |
| Card | দোকানে card machine আছে; online card পরে |
| Mobile app | পরে Flutter দিয়ে; এখন মূল কাজ Next.js website |

---

## Phase 0 — ভিত্তি (বাকি সব phase এর উপর দাঁড়াবে)

> **অগ্রগতি (2026-11-08):** ভিত্তি তৈরি হয়েছে, live database-এ migration চালানো হয়েছে
> (`supabase/migrations/20261108*`)। বাকি: UnivaPayment-এর key দিয়ে আসল test, পুরনো admin
> পাতাগুলোকে permission দিয়ে খোলা (staff ঢোকানো Phase 4-এ POS-এর সাথে), product editor-কে
> নতুন option system-এ আনা, আর বাকি পাতার লেখা অনুবাদের file-এ সরানো।

নিচের কাজগুলো একবার ঠিকভাবে করলে পরের phase-গুলো সহজ হয়:

| কাজ | কেন |
| --- | --- |
| **Payment provider layer** | UnivaPayment হবে প্রধান gateway। একটা সাধারণ interface (`createPayment`, `getPayment`, `handleWebhook`) থাকবে, যাতে পরে card-এর জন্য অন্য gateway যোগ করতে code বদলাতে না হয়। Online checkout, COD-এর delivery charge, custom jersey-র অগ্রিম আর POS সব জায়গায় এটাই ব্যবহার হবে। নিচে UnivaPayment-এর বিস্তারিত। |
| **Phone নম্বর দিয়ে customer চেনা** | একজন customer = একটা phone নম্বর (`01XXXXXXXXX` format-এ)। Google sign-in, guest order আর dokan-এর বিক্রি সব একই customer profile-এ জমা হবে। |
| **Role ও permission system** | এখন শুধু admin আছে। এর বদলে role অনুযায়ী permission থাকবে (Phase 4-এ বিস্তারিত)। POS আর custom jersey-র কাজ শুরুর আগে এটা লাগবে। |
| **Product option system** | এখন size আর color আলাদা table-এ। এর বদলে সাধারণ option system: Jersey-তে size + হাতা + color, racket-এ color + weight + grip, জুতায় EU/UK size। Variant অনুযায়ী দামও আলাদা হতে পারবে (যেমন ফুল হাতা ৳১০০ বেশি)। |
| **Notification layer** | SMS, email আর WhatsApp message পাঠানোর জন্য একটাই function, পেছনে provider বদলানো যাবে। শুরুতে email আর free WhatsApp link, পরে SMS gateway। |
| **Audit log** | কে কখন দাম, stock বা order বদলেছে তার হিসাব। একাধিক staff থাকলে এটা জরুরি। |
| **বাংলা/English** | শুরু থেকেই সব লেখা অনুবাদের file থেকে আসবে (product-এর নাম ও বর্ণনা দুই ভাষায় রাখার জায়গা), যাতে পরে switch যোগ করতে পুরো site বদলাতে না হয়। |

### UnivaPayment integration

UnivaPayment merchant-এর নিজের phone-এ আসা bKash/Nagad SMS পড়ে payment যাচাই করে। টাকা সরাসরি Arts Sports-এর নম্বরে আসে।

1. Server `POST /api/v1/payments` call করবে: `Authorization: Bearer <API key>`, প্রতিটা payment-এ আলাদা `Idempotency-Key` header, body-তে `amount`, `order_id`, `return_url`, `metadata`।
2. Customer-কে উত্তরে আসা `checkout_url`-এ পাঠানো হবে। সেখানে সে নিজের নম্বর দিয়ে টাকা পাঠাবে।
3. Payment-এর অবস্থা জানা যাবে **webhook** (`x-signature: t=…,v1=…`, HMAC-SHA256 দিয়ে যাচাই করতে হবে) আর `GET /api/v1/payments/{id}` দিয়ে।
4. অবস্থা: `initiated → pending → completed`; অথবা `review` (৩ মিনিটে SMS না মিললে merchant নিজে দেখবে), `rejected`, `expired`, `refunded`।

এর ফলে Arts Sports-এ যা মাথায় রাখতে হবে:
- **`review` অবস্থা:** order "payment যাচাই চলছে" অবস্থায় থাকবে। Review-তে approve হলে webhook এলে order নিজে থেকে confirm হবে।
- **Refund:** UnivaPayment টাকা ফেরত পাঠায় না, শুধু অবস্থা `refunded` করে। টাকা দোকানের নম্বর থেকে হাতে পাঠাতে হবে। Arts Sports-এর এখনকার refund system সেই হিসাব রাখবে।
- **API key** শুধু server-এ (Worker secret) থাকবে। Test mode-এর key দিয়ে আগে পরীক্ষা।
- Return URL-এর domain UnivaPayment dashboard-এ allowed domain হিসেবে দিতে হবে (workers.dev আর পরে artssports.com)।

---

## Phase 1 — Social media থেকে বিক্রি

### 1.1 Checkout (এক পাতায়, কম ধাপে)

**পথ:** Facebook ad → product page → **"এখনই কিনুন"** (cart ছাড়াই সরাসরি checkout) → এক পাতার checkout।

Checkout পাতার উপরে:

- **"Google দিয়ে ১ click-এ এগোন"** (Google One Tap)। Sign in করলে নাম আর email নিজে থেকে বসে যাবে, আগের ঠিকানাও দেখাবে।
- পাশে **"Guest হিসেবে order করুন"**। শুধু নাম, phone আর ঠিকানা লাগবে।
- Sign-in করানোর জন্য জোর না করে লাভ দেখাতে হবে: "Sign in করলে order track করা সহজ, point জমবে, পরের বার ঠিকানা লিখতে হবে না।"

**ঠিকানা:**
- বিভাগ → জেলা → থানা/এলাকা dropdown থেকে বাছাই, সাথে বাসা/রোড লেখার ঘর।
- ঢাকার ভেতর না বাইরে, সেটা দেখে delivery charge নিজে বসবে (৳৬০ / ৳১২০, admin বদলাতে পারবে)।
- Delivery-র আনুমানিক তারিখ দেখাবে ("রবিবার–মঙ্গলবারের মধ্যে পৌঁছাবে")।

**Payment option (UnivaPayment দিয়ে, bKash/Nagad):**

| Option | কী হবে |
| --- | --- |
| **পুরো টাকা এখন দিন** | আলাদা ছাড় নেই। Payment completed হলে order সাথে সাথে confirmed। |
| **Cash on delivery (delivery charge আগে)** | শুধু delivery charge (৳৬০/৳১২০) UnivaPayment-এ নেওয়া হবে, বাকি টাকা পণ্য হাতে পেয়ে। Order confirmed। Checkout-এ এটাকেই COD-এর প্রধান option হিসেবে দেখানো হবে। |
| **Cash on delivery (কিছুই আগে না)** | Order যাবে **"Call করে confirm করতে হবে"** অবস্থায়। Customer-এর সব তথ্য save থাকবে, staff call করবে। |

**অসমাপ্ত checkout ধরে রাখা (lead):**
- Customer phone নম্বর লেখার সাথে সাথে checkout-এর তথ্য save হবে, payment না করলেও।
- Admin-এ একটা **"Leads / Follow-up"** পাতা থাকবে: নাম, phone, কোন product, কখন ছেড়ে গেছে, call-এর অবস্থা (call হয়নি / ধরেনি / পরে call / বিক্রি হয়েছে / আগ্রহ নেই) আর note।
- এক click-এ call করার আর WhatsApp খোলার button থাকবে।
- এই phone নম্বর কেন রাখা হচ্ছে, privacy policy-তে সেটা লিখে দিতে হবে।

**আরো ছোট উন্নতি:**
- Product page-এ নিচে আটকে থাকা "এখনই কিনুন" button (mobile-এ)।
- Cart-এ "আর ৳৩০০ কিনলে free delivery" progress bar।
- আগের order এক click-এ আবার করা (reorder)।
- Variant link: ad-এর link-এ সরাসরি নির্দিষ্ট color বা size খুলবে (`?color=blue&size=L`)।

### 1.2 OTP ছাড়া ভুয়া order আটকানো

SMS OTP আর paid fraud-check service ব্যবহার হবে না। শুধু free উপায় একসাথে মিলিয়ে প্রতিটা order-এর একটা **risk score** বের হবে:

| সংকেত | কীভাবে |
| --- | --- |
| **Courier history (free হলে)** | Steadfast বা Pathao-এর merchant API phone নম্বরের delivery history free-তে দিলে সেটা ব্যবহার হবে (API key পাওয়ার পর যাচাই করতে হবে)। না দিলে এই সংকেত বাদ। |
| **নিজেদের history** | এই নম্বরে আগে কোনো order ফেরত এসেছে কিনা। Admin চাইলে নম্বর **blacklist** করতে পারবে। |
| **Google sign-in** | Sign-in করা customer বেশি বিশ্বাসযোগ্য। |
| **WhatsApp দিয়ে confirm** | Order-এর পর "WhatsApp-এ confirm করুন" button। চাপলে আগে থেকে লেখা message ("Order #1234 confirm করছি") আমাদের নম্বরে যাবে। Customer-এর খরচ নেই, WhatsApp Business app-এ আমাদেরও খরচ নেই। Message এলে staff order confirm করবে। |
| **Bot আটকানো** | Cloudflare Turnstile (free, CAPTCHA ছাড়াই), একই device বা IP থেকে বারবার order-এ সীমা, phone নম্বরের format যাচাই। |
| **Duplicate** | একই নম্বর থেকে অল্প সময়ে একই product-এর order হলে একসাথে দেখাবে। |
| **Order-এর দাম** | নতুন customer আর বেশি দামের COD order (যেমন ৳৫,০০০-এর বেশি) হলে delivery charge বা কিছু অগ্রিম বাধ্যতামূলক। |

**Score অনুযায়ী নিয়ম (admin বদলাতে পারবে):**
- 🟢 কম risk → নিজে থেকে confirmed।
- 🟡 মাঝারি → "Call করে confirm" তালিকায়।
- 🔴 বেশি risk → delivery charge অগ্রিম ছাড়া order হবে না।

### 1.3 Courier

- Admin panel থেকে এক click-এ **Steadfast বা Pathao**-তে parcel book হবে। কোন এলাকায় কোন courier, সেই নিয়ম রাখা যাবে (যেমন ঢাকায় Pathao, বাইরে Steadfast)। পরে RedX যোগ করা সহজ হবে।
- Courier-এর webhook থেকে parcel-এর অবস্থা নিজে থেকে update হবে।
- Customer-এর জন্য tracking পাতা: order নম্বর + phone দিয়ে।
- প্রতিটা ধাপে notification যাবে: confirmed, courier-এ দেওয়া হয়েছে, পৌঁছেছে।
- COD-এর টাকা courier থেকে ফেরত এলো কিনা, তার হিসাব (reconciliation)।

### 1.4 Tracking (প্রথমে এই তিনটা)

- **Meta Pixel + Conversions API:** browser আর server দুই দিক থেকে event যাবে, একই `event_id` দিয়ে যাতে দুবার গোনা না হয়। Event: ViewContent, AddToCart, InitiateCheckout, AddPaymentInfo, Purchase, Lead (COD-তে payment না করলে)।
- **GA4:** ecommerce event (`view_item`, `add_to_cart`, `begin_checkout`, `purchase`)।
- **UTM:** প্রতিটা order-এ কোথা থেকে এসেছে (source, campaign, ad) save হবে, যাতে report-এ দেখা যায় কোন post বা ad থেকে বিক্রি হলো।
- TikTok ও অন্য pixel পরে। Code এমনভাবে লেখা হবে যাতে নতুন pixel যোগ করা সহজ হয়।

### 1.5 Facebook ও Instagram catalog

- Site থেকে নিজে থেকে update হওয়া product feed (`/api/feeds/meta`)। প্রতিটা variant আলাদা item হিসেবে যাবে, একই product-এর variant একসাথে group হবে (`item_group_id`)।
- Feed-এ থাকবে দাম, ছাড়, stock, ছবি, ব্র্যান্ড আর category।
- Meta Commerce Manager-এ catalog যুক্ত করে ব্যবহার হবে:
  - catalog ads,
  - একবার দেখে চলে যাওয়া মানুষকে আবার ad দেখানো (dynamic retargeting),
  - post-এ product tag (বাংলাদেশে কোন feature চালু আছে, Commerce Manager-এ যাচাই করতে হবে)।

### 1.6 Share

- প্রতিটা product-এর নিজস্ব share ছবি (দাম আর logo সহ) নিজে থেকে তৈরি হবে।
- Share button: Facebook, Messenger, WhatsApp আর link copy। Mobile-এ phone-এর নিজের share menu।
- "Messenger/WhatsApp-এ জিজ্ঞেস করুন" button, product-এর link সহ।

**কাজ শুরুর আগে যা লাগবে:**
- UnivaPayment-এর test আর live API key, আর webhook secret।
- Steadfast আর Pathao merchant account-এর API key।
- Meta Business Manager-এ Pixel ID আর Conversions API token; GA4 measurement ID।

---

## পরে করার কাজ (Phase 1-এর বাকি, 2026-11-11)

Phase 1-এর code সব তৈরি। নিচেরগুলো করতে আপনার সিদ্ধান্ত বা key লাগবে, তাই পরে:

| কাজ | কী লাগবে |
| --- | --- |
| Migration `20261108200000_social_selling.sql` live DB-তে apply | আপনার অনুমতি; `node scripts/apply-sql.mjs --only 20261108200000` |
| Google login ঠিক করা | Supabase Auth এখনও পুরনো Vercel URL-এ। অনুমতি দিলে `node scripts/fix-auth-redirects.mjs` চালানো হবে। Custom domain পেলে আবার |
| Courier | Steadfast আর Pathao-র API key ও webhook secret। আগে sandbox-এ booking test (adapter এখনও আসল API-তে চেষ্টা হয়নি) |
| Tracking | Meta Pixel ID + CAPI token, GA4 measurement ID |
| Bot check | Turnstile site key + secret |
| Google One Tap | Google client ID |
| Contact link | `NEXT_PUBLIC_STORE_WHATSAPP`, `NEXT_PUBLIC_MESSENGER_PAGE` |
| UnivaPayment | একটা ছোট আসল payment test |
| Product share ছবি (1.6) | আলাদা Worker বা paid Cloudflare plan (Worker এখন 3 MiB সীমার কাছে) |
| Commit | uncommitted auth fix, 3D doc, roadmap |

---

## Phase 2 — Sports store-এর মতো catalog

> **অবস্থা (2026-11-11):** 2.1, 2.3, 2.5, 2.6 তৈরি। Migration `20261111100000_catalog_phase2.sql` লেখা আছে কিন্তু **live DB-তে apply করা হয়নি**; apply না হলে নতুন অংশগুলো খালি দেখাবে বা লুকানো থাকবে, site ভাঙবে না।
> **বাকি (Phase 2b):** 2.2 variant-এর storefront picker (হাতা, kit, weight, grip) আর product editor, 2.4 bundle। দুটোতেই order RPC আর `lib/pricing.ts` বদলাতে হয় (দাম মিলিয়ে), তাই আলাদা করে।
> "২৪ ঘণ্টায় কতজন কিনেছে" ও live viewer চালু; "wishlist-এ রেখেছে" বাকি, কারণ wishlist এখন শুধু browser-এ থাকে, database-এ নয়।

### 2.1 Category, filter আর collection

তিনটা জিনিস আলাদা রাখলে catalog পরিষ্কার থাকে:

| জিনিস | কাজ | উদাহরণ |
| --- | --- | --- |
| **Category (গাছের মতো, sub-category সহ)** | পণ্যটা কী | Football → Jersey → Player Edition / Fan Edition; Cricket → Bat; Badminton → Racket |
| **Attribute / filter** | পণ্যের বৈশিষ্ট্য | দল (Argentina, Barcelona, Bangladesh), লিগ, খেলোয়াড়, season (2026/27), home/away, ব্র্যান্ড |
| **Collection** | Campaign বা বাছাই করা তালিকা | "BPL 2027", "Eid offer", "নতুন এসেছে", "Bestseller" |

দলকে category না বানিয়ে **filter** রাখলে একই দল সব খেলায় খোঁজা যায়, আর category-র গাছ ছোট থাকে। প্রতিটা দলের নিজের পাতাও থাকবে (`/team/argentina`)।

**Menu:** খেলা অনুযায়ী। শুরুতে চারটা: **Football, Cricket, Badminton, Gym/Running**। ভেতরে category আর জনপ্রিয় দল। নতুন খেলা admin থেকে যোগ করা যাবে।

### 2.2 Variant

| পণ্য | Option |
| --- | --- |
| Jersey | Size (S–3XL, বাচ্চাদের size), হাতা (হাফ/ফুল), color/kit (home/away) |
| Racket | Color, weight (3U/4U), grip size |
| জুতা | Size (EU/UK/BD) |
| Ball, অন্যান্য | Color, size নম্বর |

- প্রতিটা variant-এর আলাদা SKU, barcode, stock আর দরকার হলে আলাদা দাম।
- Variant বাছাই করলে সেই variant-এর ছবি দেখাবে।

### 2.3 Size guide আর edition-এর পার্থক্য

- প্রতিটা category-র জন্য size chart (এখন `size_measurements` table আছে, সেটাই ব্যবহার হবে)।
- Player Edition আর Fan Edition-এর পার্থক্য ছবি দিয়ে বোঝানো: কাপড়, fit, logo-র ধরন, দাম।

### 2.4 Kit / bundle

- জার্সি + শর্টস + মোজা একসাথে কিনলে ছাড়। Bundle-এর প্রতিটা অংশের size আলাদা বাছাই করা যাবে।
- Cricket kit, badminton set।

### 2.5 Scarcity আর social proof

**নিয়ম: সব সংখ্যা আসল data থেকে আসবে, বানানো সংখ্যা নয়।** বানানো "১৫ জন দেখছে" ধরা পড়লে বিশ্বাস নষ্ট হয়, আর এটা Meta-র ad নীতি ও ভোক্তা অধিকার আইনের ঝুঁকি। কোনো সংখ্যা ছোট হলে সেটা লুকিয়ে রাখা হবে, বানানো হবে না।

| কী দেখাবে | কোথা থেকে | কখন দেখাবে |
| --- | --- | --- |
| "শুধু ৩টা বাকি" | বাছাই করা variant-এর আসল stock | Stock ≤ ৫ হলে |
| "গত ২৪ ঘণ্টায় ১২ জন কিনেছে" | আসল order | সংখ্যা ≥ ৫ হলে |
| "এখন ৮ জন দেখছে" | Live viewer count (Supabase Realtime presence) | ≥ ৩ জন হলে |
| "৪০ জন wishlist-এ রেখেছে" | Wishlist | ≥ ১০ হলে |
| ছোট popup: "রাজশাহী থেকে একজন Argentina জার্সি কিনেছে" | আসল order (শুধু জেলা, নাম ছাড়া) | Admin চালু করলে |
| "Bestseller", "Trending", "নতুন" badge | বিক্রি আর তারিখ থেকে হিসাব করে | সবসময় |
| Countdown timer | Campaign-এর আসল শেষ সময় | Campaign চলার সময় |
| Pre-order: "৫০ জনের মধ্যে ৩২ জন বুক করেছে" | Pre-order-এর আসল সংখ্যা | নতুন season-এর জার্সিতে |
| ছবি সহ review আর ★ rating | Customer review | সবসময় |

প্রতিটার সীমা (threshold) আর চালু/বন্ধ admin settings থেকে বদলানো যাবে।

### 2.6 Review আর প্রশ্ন-উত্তর

- শুধু যারা কিনেছে তারা review দিতে পারবে ("Verified buyer" লেখা থাকবে)। ছবি দেওয়া যাবে, admin আগে দেখে approve করবে।
- Delivery-র কয়েকদিন পর review চেয়ে message, review দিলে কিছু point।
- Product page-এ প্রশ্ন-উত্তর।

**কাজ শুরুর আগে যা লাগবে:**
- চারটা খেলার ভেতরের category আর sub-category-র তালিকা।
- কোন কোন দল আর লিগ দিয়ে শুরু।

---

## Phase 3 — Custom Jersey (মূল আকর্ষণ)

### 3.1 দুটো পথ

**পথ A — নিজের design upload:**
1. খেলা বাছাই (Football, Cricket, Badminton…)।
2. Design upload: ছবি, PDF বা AI file, সাথে reference ছবি আর কী চায় তা লেখা।
3. কাপড় (fabric) বাছাই: প্রতিটার ছবি, বর্ণনা আর প্রতি পিসের দাম। শুরুতে Mesh, Interlock/PP, Polo pique আর Jacquard/premium; admin নতুন কাপড় যোগ, বন্ধ বা দাম বদল করতে পারবে।
4. হাতা, collar, শর্টস লাগবে কিনা, নাম ও নম্বর লাগবে কিনা।
5. পরিমাণ দিলে **সাথে সাথে আনুমানিক দাম** দেখাবে।
6. কবে লাগবে (তাড়াতাড়ি লাগলে অতিরিক্ত চার্জ)।
7. জমা দেওয়া।

**পথ B — আমাদের catalog থেকে design:**
1. খেলা অনুযায়ী design-এর তালিকা।
2. Design বাছাই করে রং বদলানো, দলের নাম, logo, নাম আর নম্বর বসিয়ে preview দেখা (প্রথমে 2D)।
3. কাপড়, পরিমাণ আর দাম, পথ A-এর মতোই।

**পরে (এখন না):** AI দিয়ে design বানানো। Data এমনভাবে রাখা হবে যাতে পরে যোগ করা যায়।

### 3.2 দাম হিসাব

- দাম = কাপড় অনুযায়ী প্রতি পিসের দাম × পরিমাণ-ভিত্তিক ছাড় + অতিরিক্ত (নাম/নম্বর, logo, ফুল হাতা, শর্টস, তাড়াতাড়ির চার্জ)।
- **১টা থেকেই order নেওয়া যাবে।** পরিমাণের ধাপ উদাহরণ: ১–৪, ৫–১০, ১১–২০, ২১–৫০, ৫০+; কম পরিমাণে প্রতি পিসের দাম বেশি।
- স্বাভাবিক সময় **৫–৭ দিন** (approve আর অগ্রিমের পর)। এর চেয়ে আগে লাগলে অতিরিক্ত চার্জ।
- পুরো দামের table admin থেকে বদলানো যাবে।
- Site-এ দেখানো দাম **"আনুমানিক"**। Design দেখে admin চূড়ান্ত দাম দেবে।

### 3.3 দলের তালিকা (roster)

- একটা table-এ প্রতিটা খেলোয়াড়ের নাম, নম্বর, size আর হাতা। Excel বা CSV upload করা যাবে।
- Size অনুযায়ী মোট হিসাব নিজে থেকে হবে (M: ৫টা, L: ৪টা…)।

### 3.4 কাজের ধাপ

```
জমা দেওয়া
  → Review চলছে
      → বাতিল (কারণসহ: design বাস্তবে সম্ভব না, ছবি অস্পষ্ট, copyright logo …)
      → পরিবর্তন দরকার (customer-কে জানানো হবে কী বদলাতে হবে)
  → নিজেদের designer customer-এর design থেকে print-উপযোগী mockup বানাবে, সাথে চূড়ান্ত দাম
  → Customer approve করবে (অথবা পরিবর্তন চাইবে; ২ বার পর্যন্ত বিনামূল্যে)
  → ৩০% অগ্রিম (UnivaPayment-এ bKash/Nagad, বা দোকানে নগদ/card)
  → Production: কাটিং → প্রিন্টিং → সেলাই → মান যাচাই (QC)
  → Ready
  → Delivery বা dokan থেকে নেওয়া; বাকি ৭০% online, COD বা dokan-এ
```

- **বাতিলের নিয়ম:** design confirm করার পর print শুরু হয়ে যায়, তাই **confirm করার পর order বাতিল বা অগ্রিম ফেরত হবে না।** Approve button-এর পাশে এটা পরিষ্কার লেখা থাকবে, আর customer-কে একটা tick দিয়ে মেনে নিতে হবে। Confirm-এর আগে বাতিল করলে অগ্রিম নেওয়াই হয়নি, তাই ফেরতের প্রশ্ন নেই।
- **Customer-এর পাতা:** নিজের custom order-এর mockup দেখা, মন্তব্য করা, approve করা, অগ্রিম দেওয়া, আর কোন ধাপে আছে দেখা।
- প্রতিটা ধাপে SMS, email বা WhatsApp-এ জানানো।
- **Admin-এর production board:** kanban (কলাম হিসেবে ধাপ), delivery-র তারিখ, দায়িত্বপ্রাপ্ত staff, আর দেরি হলে লাল চিহ্ন।
- Customer অনুমতি দিলে বানানো জার্সির ছবি **gallery**-তে যাবে (social media content-ও হয়)।

**কাজ শুরুর আগে যা লাগবে:**
- প্রতিটা কাপড়ের প্রতি পিসের দাম আর পরিমাণের ধাপ অনুযায়ী ছাড় (admin থেকেও দেওয়া যাবে)।
- নাম/নম্বর, logo, ফুল হাতা, শর্টস আর তাড়াতাড়ির চার্জ কত।
- Catalog-এর জন্য কিছু design template (প্রতিটা খেলার)।

---

## Phase 4 — Dokan (POS), stock, staff আর customer

### 4.1 POS (dokan-এ বিক্রি)

- Laptop বা tablet-এ চলবে। একটা সাধারণ USB barcode scanner কিনলেই হবে: এটা keyboard-এর মতো কাজ করে, তাই আলাদা integration লাগবে না। Scanner না আসা পর্যন্ত নাম বা SKU লিখে খোঁজা যাবে।
- Barcode scan বা নাম লিখে product খোঁজা, পরিমাণ, ছাড়, coupon।
- **Customer:** phone নম্বর দিলে আগের customer খুঁজে বের করবে, না থাকলে নতুন বানাবে। Message পাঠানোর অনুমতি একটা tick দিয়ে নেওয়া হবে।
- **Payment:** নগদ, card (দোকানের card machine-এ নেওয়া হবে, POS-এ শুধু "Card" হিসেবে লেখা থাকবে), UnivaPayment (bKash/Nagad, QR বা link), আর একাধিক method মিলিয়ে (split payment)।
- **Hold/park:** একজন customer-এর বিল রেখে আরেকজনেরটা করা।
- **দিনের শেষে cash হিসাব:** drawer-এ কত টাকা থাকার কথা আর আসলে কত আছে।

### 4.2 Receipt

- দোকানের **A4 printer**-এ (browser-এর print দিয়ে)। একই পাতায় **দুই কপি**: উপরে customer-এর কপি, নিচে dokan-এর কপি, মাঝখানে কাটার দাগ। পরে thermal printer কিনলে ছোট receipt-এর layout-ও থাকবে।
- Receipt-এ থাকবে: receipt নম্বর, তারিখ, staff, product, ছাড়, payment, বাকি টাকা আর একটা **QR code**।
- চাইলে digital receipt SMS বা WhatsApp-এ।
- Receipt-এর QR scan করে ফেরত বা বদল (return/exchange)।

### 4.3 Dokan থেকে custom jersey-র order

- POS-এ "Custom order" বানানো যাবে: design, roster, ৩০% অগ্রিম।
- Receipt-এ থাকবে order নম্বর, QR, সম্ভাব্য তারিখ আর বাকি টাকা।
- Customer receipt নিয়ে এলে (বা phone নম্বর বললে) **scan করেই** দেখা যাবে order কোন ধাপে আর কত বাকি। তারপর বাকি টাকা নিয়ে জিনিস দেওয়া।
- QR scan করে customer নিজেও phone থেকে order-এর অবস্থা দেখতে পারবে।

### 4.4 Stock

- **Stock-এর জায়গা:**
  - **Primary:** নিজেদের stock। এখন ১টা দোকান, পরে আরো দোকান বা গুদাম যোগ করা যাবে।
  - **Secondary:** supplier-এর stock, যেখান থেকে এনে দেওয়া যায়।
  - Site-এ customer দুটোকে **একই রকম "stock আছে"** দেখবে। Admin ভেতরে জানবে কোনটা কোথা থেকে।
  - Order-এ primary stock-এ না থাকলে সেটা secondary থেকে নেওয়া হবে, আর admin-এ **"Supplier থেকে আনতে হবে"** তালিকায় যাবে (কোন supplier, কয়টা, কবে আসবে)। মাল এলে order এগোবে।
  - Supplier-এর stock-এর সংখ্যা admin হাতে update করবে বা Excel দিয়ে upload করবে।
- প্রতিটা variant-এর জন্য barcode label print (Code128)। এখন A4 sticker sheet-এ, পরে চাইলে label printer।
- **মাল আসা (stock in):** supplier, কেনা দাম, পরিমাণ। কেনা দাম থাকলে লাভের report-ও পাওয়া যাবে।
- **Stock গোনা আর ঠিক করা:** কারণসহ (নষ্ট, হারানো, গোনায় ভুল)।
- একাধিক dokan বা গুদাম থাকলে **transfer** (এখন showroom আর stock-এর হিসাব এমনিতেই আছে)।
- Stock কমে গেলে alert।
- প্রতিটা stock পরিবর্তনের হিসাব (`inventory_movements` আগে থেকেই আছে)।
- Product page-এ "Dokan-এ আছে" লেখা, আর "dokan থেকে নিয়ে যান" option।

### 4.5 Staff role

| Role | কী করতে পারবে |
| --- | --- |
| **Owner / Super admin** | সবকিছু, staff আর role ঠিক করা সহ |
| **Manager** | সব কাজ, শুধু staff আর payment-এর setting ছাড়া |
| **Cashier** | শুধু POS, নিজের বিক্রি আর দিনের হিসাব |
| **Inventory** | Product, stock, barcode, মাল আসা আর transfer |
| **Order / fulfillment** | Online order, courier booking, return |
| **Designer / production** | Custom jersey-র review, mockup আর production board |
| **Marketing** | Product content, coupon, campaign, landing page; টাকার হিসাব দেখবে না |
| **Support / caller** | Lead তালিকা, call-এর note, order confirm |

Role কোড-এ বাঁধা থাকবে না। Owner নতুন role বানিয়ে permission বেছে দিতে পারবে।
এখন staff ১–৩ জন, তাই শুরুতে **Owner, Manager আর Cashier** দিয়েই চলবে; একজনকে একাধিক role দেওয়া যাবে। বাকি role দল বড় হলে।

### 4.6 Customer তালিকা (CRM)

- Online আর dokan দুই জায়গার customer একসাথে, phone নম্বর দিয়ে।
- প্রতিজন customer-এর পাতায়: কেনাকাটার history, মোট খরচ, শেষ কবে কিনেছে, custom order, আর note।
- **Tag:** offline, online, custom team, VIP, আর নিজের বানানো tag।
- **Segment:** যেমন "৩ মাস কিছু কেনেনি", "Argentina জার্সি কিনেছে", "দলের order দিয়েছে"।
- **যোগাযোগ:**
  - এক click-এ call বা WhatsApp chat (free)।
  - Segment ধরে একসাথে SMS (BD SMS gateway, প্রতি SMS-এ অল্প খরচ)। পরে WhatsApp Business API (প্রতি conversation-এ খরচ)।
  - শুধু যারা অনুমতি দিয়েছে তাদের promotional message। "আর message চাই না" বললে বন্ধ।
- Excel export।

**কাজ শুরুর আগে যা লাগবে:**
- একটা USB barcode scanner।
- Supplier-দের তালিকা।

---

## Phase 5 — Customer ফিরিয়ে আনা

- **Loyalty point:** online আর dokan দুই জায়গাতেই জমবে আর খরচ করা যাবে। Level থাকবে (Bronze/Silver/Gold)।
- **Influencer ও affiliate code:** প্রতিজনের আলাদা coupon আর link। কার code থেকে কত বিক্রি আর কত commission, তার report।
- **Referral:** বন্ধুকে আনলে দুজনেই ছাড় পাবে।
- **মনে করিয়ে দেওয়া:**
  - cart বা checkout ছেড়ে চলে গেলে,
  - stock আবার এলে,
  - wishlist-এর product-এর দাম কমলে,
  - জন্মদিনে।
- **Facebook Live-এ বিক্রি:** live-এ product-এর ছোট code (যেমন `AS12`)। Site-এ code দিলে সরাসরি সেই product খুলবে।
- **বাংলা/English switch** আর বাংলায় buying guide (SEO-র জন্য)।
- **Mobile app:** পরে আলাদা project হিসেবে Flutter দিয়ে বানানো হবে; এখন মূল কাজ website। তাই এই site-এর business logic (দাম, stock, order, payment) database function আর API-তে রাখা হবে, যাতে app একই জিনিস ব্যবহার করতে পারে। PWA লাগবে না।

---

## Phase 6 — Report আর dashboard

- আজকের, সপ্তাহের আর মাসের বিক্রি; online আর dokan আলাদা করে।
- কোন channel থেকে কত বিক্রি (Facebook, Instagram, influencer code, সরাসরি, dokan)।
- লাভের হিসাব (কেনা দাম থাকলে)।
- সবচেয়ে বেশি আর সবচেয়ে কম বিক্রি হওয়া product; stock কমে যাওয়া product।
- Return আর COD ফেরত আসার হার, courier অনুযায়ী।
- Lead থেকে কতগুলো বিক্রি হলো (caller অনুযায়ী)।
- Custom jersey: কতগুলো চলছে, কতগুলো দেরিতে, কত টাকা অগ্রিম নেওয়া হয়েছে আর কত বাকি।
- Cashier অনুযায়ী দিনের হিসাব।

---

## কাজের ক্রম (প্রস্তাব)

1. **Phase 0:** payment layer (UnivaPayment), phone দিয়ে customer, role, option system।
2. **Phase 1:** checkout, lead, risk score, courier, tracking, catalog feed।
3. **Phase 3:** custom jersey (আগে পথ A আর admin workflow, তারপর পথ B-এর preview)।
4. **Phase 2:** category, filter, social proof, review।
5. **Phase 4:** POS, receipt, stock, CRM। Offline product site-এ তোলার সময় থেকেই।
6. **Phase 5 আর Phase 6:** ধাপে ধাপে।

Phase 2-এর category আর filter-এর কাঠামো Phase 1-এর catalog feed-এর সাথে মিলিয়ে আগে ঠিক করে নেওয়া ভালো, কারণ feed-এ category যায়।
