# Arts Sports — 3D দোকান আর অ্যাপের Roadmap

ওয়েবসাইটে একটা 3D দোকান হবে: দরজা খুলে ভেতরে ঢোকা, Jersey wall, Accessories wall, ঘোরানো jersey rail আর product stand। পরে একই জিনিস Flutter অ্যাপে আসবে। সাথে থাকবে custom jersey order আর live preview।

> এই file-টা [roadmap.md](roadmap.md)-এর সাথে চলবে। ব্যবসার নিয়ম (দাম, custom jersey-র ধাপ, payment, courier) ওখানেই থাকবে। এখানে শুধু **3D দোকান, 360° ছবি, jersey preview, গতি আর Flutter অ্যাপ**। কোনো সিদ্ধান্ত বদলালে এখানে update করুন।

Design mockup (entrance, shop floor, jersey rail, accessories, product, mobile) বানানো হয়েছে 2026-11-09-এ। বানানোর সময় সেগুলো সামনে রাখুন।

---

## নেওয়া সিদ্ধান্ত (2026-11-09)

| বিষয় | সিদ্ধান্ত |
| --- | --- |
| ওয়েবসাইট | **Next.js 16 + Cloudflare Workers (OpenNext)**, এখন যা আছে |
| Backend | **Supabase** (Database, Auth, RPC), ওয়েব আর অ্যাপ দুটোর জন্য একটাই |
| ছবি রাখা | **Cloudflare R2** (R2 চালু না হওয়া পর্যন্ত Tigris) |
| অ্যাপ | **Flutter**, নিজে বানাবেন |
| ক্রম | **আগে ওয়েব, পরে অ্যাপ** |
| 3D দোকান | **CSS 3D** (ওয়েবে) আর **Flutter `Transform` + `Matrix4`** (অ্যাপে)। আসল ছবি দিয়ে দেয়াল। Three.js, Unity বা 3D model না |
| 360° | **ছবি দিয়ে ঘোরানো** (২৪টা ছবি), শুধু বাছাই করা product-এ, ঐচ্ছিক। সমস্যা হলে বাদ, product সাধারণ ছবিতেই চলবে |
| Custom jersey preview | **সামনে/পেছনে live preview** (2D layer), flip করে দেখা যাবে |
| ধীর নেট | **Lite mode** সবসময় থাকবে। 3D হলো বাড়তি সৌন্দর্য, কেনার জন্য দরকার নেই |

### মূল নিয়ম (সব phase-এ মানতে হবে)

1. **3D ছাড়াও কেনা যাবে।** 3D লোড না হলে, ফোন দুর্বল হলে বা নেট ধীর হলে সাধারণ product list দেখাবে। কোনো ক্রেতা যেন animation-এর জন্য আটকে না থাকে।
2. **আগে কন্টেন্ট, পরে সৌন্দর্য।** প্রথমে product, দাম আর "কিনুন" button আসবে। 3D, 360° আর বড় ছবি আসবে পরে।
3. **ওয়েব আর অ্যাপ একই data থেকে চলবে।** দোকানের দেয়াল, কোন জায়গায় কী আছে, jersey template, সব Supabase-এ JSON হিসেবে থাকবে। তাই একবার বদলালে দুই জায়গাতেই বদলাবে।
4. **দাম সবসময় server হিসাব করবে।** অ্যাপ বা ব্রাউজার যে দাম দেখায় তা শুধু দেখানোর জন্য। Order-এর সময় server আবার হিসাব করবে (বর্তমান `order_pricing_integrity` অনুযায়ী)।

---

## গতির লক্ষ্য (Performance budget)

এগুলো প্রতিটা phase শেষে মেপে দেখতে হবে। কোনোটা পার হলে release হবে না।

**ওয়েব** (Chrome DevTools → Network: "Slow 4G", CPU 4x slowdown, মোবাইল সাইজ):

| মাপ | লক্ষ্য |
| --- | --- |
| প্রথম পাতার মোট JavaScript (gzip) | ≤ ১৫০ KB |
| 3D দোকানের নিজের JavaScript | ≤ ৩০ KB |
| প্রথম স্ক্রিনের সব ছবি মিলিয়ে | ≤ ৩০০ KB |
| LCP (মূল কন্টেন্ট দেখা যাওয়া) | ≤ ২.৫ সেকেন্ড |
| CLS (পাতা লাফানো) | ≤ ০.১ |
| 3D animation | দুর্বল ফোনেও ঝাঁকুনি ছাড়া (৩০fps-এর নিচে না) |
| একটা jersey ছবি (মোবাইল সাইজ) | ৩০–৬০ KB |
| পুরো 360° (২৪টা ছবি) | ≤ ৬০০ KB, প্রথম ৮টা ≤ ২০০ KB |

**অ্যাপ** (একটা সস্তা Android ফোনে, যেমন ৩–৪GB RAM-এর Redmi A বা Walton/Symphony series):

| মাপ | লক্ষ্য |
| --- | --- |
| Play Store download সাইজ | ≤ ২৫ MB |
| অ্যাপ খুলতে (cold start) | ≤ ২.৫ সেকেন্ড |
| আগে দেখা পাতা আবার খুলতে | নেট ছাড়াই, সাথে সাথে (cache থেকে) |
| 3D দোকান | ঝাঁকুনি ছাড়া; Flutter DevTools-এ লাল frame প্রায় নেই |

---

## পুরো কাঠামো

```
                ┌──────────────────────────────┐
                │ Supabase (Singapore)         │
                │ products, variants, media,   │
                │ store_scenes, jersey_templates│
                │ orders, custom_orders, RPC   │
                └──────────────┬───────────────┘
                               │
                ┌──────────────┴───────────────┐
                │ Next.js on Cloudflare        │
                │ - ওয়েবসাইটের পাতা             │
                │ - /api/app/* (অ্যাপের জন্য JSON, │
                │   Cloudflare-এ cache)          │
                │ - checkout, payment, order    │
                └───────┬──────────────┬───────┘
                        │              │
              ┌─────────┴───┐    ┌─────┴─────────┐
              │ ব্রাউজার      │    │ Flutter অ্যাপ   │
              │ CSS 3D       │    │ Transform 3D  │
              └─────────┬───┘    └─────┬─────────┘
                        │              │
                ┌───────┴──────────────┴───────┐
                │ Cloudflare R2 (ছবি)          │
                │ দেয়াল, product, 360° frame,   │
                │ jersey template layer         │
                └──────────────────────────────┘
```

- **Catalog আর দোকানের data** (সবার জন্য একই): Next.js থেকে JSON হিসেবে আসবে, Cloudflare-এর ঢাকার সার্ভারে cache হবে। ব্রাউজার বা অ্যাপ সরাসরি Supabase-এ catalog query করবে না, কারণ Singapore পর্যন্ত যাওয়া-আসা ধীর।
- **ব্যক্তিগত জিনিস** (login, cart, order, custom order): Supabase Auth আর RLS দিয়ে, অথবা Next.js API দিয়ে। Checkout সবসময় server দিয়ে, যাতে দাম, coupon আর risk score একই জায়গায় থাকে।

---

## নতুন data (Supabase)

> শুরু করার আগে বর্তমান `product_media` table (migration `20260926160000_product_media.sql` আর পরেরগুলো) দেখে নিন। যতটা পারা যায় সেটাই বাড়াবেন, নতুন table কম বানাবেন।

### ১. 360° ছবি: `product_media`-তে নতুন ধরন

| Column | উদাহরণ | মানে |
| --- | --- | --- |
| `kind` | `image` / `spin` | সাধারণ ছবি নাকি 360° |
| `frame_count` | `24` | কয়টা frame |
| `frame_path` | `spin/messi-home-26/{size}/{n}.webp` | R2-এ frame-এর ঠিকানার ধরন |
| `sizes` | `[480, 960]` | কোন কোন সাইজ বানানো আছে |

### ২. দোকানের দৃশ্য: `store_scenes`

পুরো দোকানটা একটা JSON। ওয়েব আর অ্যাপ এটা পড়ে একই দোকান বানাবে।

```json
{
  "version": 3,
  "entrance": { "facade": "scene/facade.webp", "tagline_bn": "আপনার স্পোর্টসের বিশ্বস্ত ঠিকানা" },
  "walls": [
    { "id": "jersey", "side": "left",  "image": "scene/jersey-wall.webp", "link": "/shop?category=football-jersey" },
    { "id": "acc",    "side": "right", "image": "scene/accessories-wall.webp", "link": "/shop?category=accessories" },
    { "id": "custom", "side": "back",  "image": "scene/custom-desk.webp", "link": "/custom-jersey" }
  ],
  "hotspots": [
    { "wall": "jersey", "x": 0.32, "y": 0.41, "product": "argentina-home-26" }
  ],
  "rail": { "collection": "featured-jerseys", "max": 11 }
}
```

- `x`, `y` হবে ০ থেকে ১ (দেয়ালের শতাংশ), তাই যেকোনো স্ক্রিন সাইজে ঠিক থাকবে।
- Admin-এ একটা পাতা থাকবে: দেয়ালের ছবি বদলানো আর ছবির উপর ক্লিক করে hotspot বসানো।
- `version` বাড়লে অ্যাপ নতুন দৃশ্য নামাবে, না বাড়লে cache থেকেই চালাবে।

### ৩. Custom jersey template: `jersey_templates`

প্রতিটা design-এর সামনে আর পেছনের layer। ওয়েব আর অ্যাপ দুটোই এটা দিয়ে preview আঁকবে।

```json
{
  "id": "striker-01",
  "sport": "football",
  "front": {
    "base": "jt/striker-01/front-base.png",
    "shade": "jt/striker-01/front-shade.png",
    "colorable": [{ "id": "body", "mask": "jt/striker-01/front-body.png", "default": "#0b3d91" }],
    "slots": [
      { "type": "logo",   "x": 0.62, "y": 0.22, "w": 0.14 },
      { "type": "number", "x": 0.50, "y": 0.45, "size": 0.10, "font": "Anton" }
    ]
  },
  "back": {
    "base": "jt/striker-01/back-base.png",
    "shade": "jt/striker-01/back-shade.png",
    "slots": [
      { "type": "name",   "x": 0.50, "y": 0.20, "size": 0.07, "font": "Anton", "max": 12 },
      { "type": "number", "x": 0.50, "y": 0.45, "size": 0.30, "font": "Anton" }
    ]
  }
}
```

- **কীভাবে আঁকা হবে:** নিচে base ছবি, তার উপর রং (mask দিয়ে), তার উপর নাম, নম্বর আর logo, সবার উপরে `shade` (ভাঁজ আর আলোর ছবি, multiply করে)। তাতে লেখাগুলো কাপড়ের উপর ছাপা মনে হবে।
- নাম আর নম্বরের font (যেমন Anton) ওয়েব আর অ্যাপ দুই জায়গাতেই রাখতে হবে, যাতে preview দুই জায়গায় একরকম দেখায়।
- Preview-এর ছবি order-এর সাথে save হবে (customer যা দেখেছে, designer সেটাই পাবে)। দাম আর ধাপ [roadmap.md](roadmap.md)-এর Phase 3 অনুযায়ী।

---

## ছবি তৈরির কাজ (কোড শুরুর আগে, সমান্তরালে চলবে)

3D দোকান সুন্দর দেখাবে কি না তা অর্ধেক নির্ভর করে ছবির মানের উপর।

### দোকানের দেয়াল

- Jersey wall, Accessories wall, সামনের দিক আর Custom desk-এর ছবি তুলুন: **সোজা সামনে থেকে**, ভালো আলোতে, দোকান বন্ধ থাকা অবস্থায় (মানুষ ছাড়া)।
- প্রতিটা দেয়ালের তিন সাইজ: ৮০০px (মোবাইল), ১৬০০px (ডেস্কটপ), ২৪০০px (বড় স্ক্রিন)। AVIF + WebP। মোবাইল সাইজ ≤ ১২০KB।
- দরকার হলে ছবি সোজা করুন (perspective correction), যাতে দেয়াল আয়তাকার হয়।

### Product ছবি

- সব product: সামনে, পেছনে, কাছ থেকে কাপড়। একই সাদা বা কালো background, একই আলো।
- সাইজ: ৪৮০px, ৯৬০px, ১৪৪০px। **ওয়েবে AVIF (না চললে WebP), অ্যাপে WebP।** Flutter নিজে থেকে AVIF পড়তে পারে না।

### 360° (শুধু বাছাই করা ২০–৩০টা product দিয়ে শুরু)

1. একটা ঘোরানো চাকতি (lazy susan বা turntable) আর tripod-এ ফোন। চাকতিতে ১৫° পরপর দাগ।
2. Jersey mannequin বা hanger-এ, ২৪টা ছবি (প্রতি ১৫°-এ একটা)। আলো আর ফোন একটুও নড়বে না।
3. Background সরানো (batch করে), সব ছবি একই জায়গায় center আর crop।
4. Export: ৪৮০px আর ৯৬০px, প্রতিটা frame ১৫–২৫KB।
5. Script দিয়ে R2-এ upload: `spin/{product-slug}/{size}/{01..24}.webp`, তারপর `product_media`-তে একটা `spin` সারি।
6. Admin-এ পরে: একটা zip upload করলেই ধাপ ৩–৫ নিজে থেকে হবে।

> **কাজটা বেশি ঝামেলার হলে:** 360° বাদ দিন। Product পাতা সামনে/পেছনে/কাছের ছবি আর jersey flip দিয়েই পুরো চলবে, কোড বদলাতে হবে না (`spin` সারি না থাকলে 360° button দেখাবে না)। এজন্যই এটা ঐচ্ছিক রাখা হয়েছে।

---

## ধাপ W1 — ওয়েব: data আর ছবির ব্যবস্থা

**কাজ:**
- [ ] `product_media`-তে `spin` ধরন, `store_scenes`, `jersey_templates` migration।
- [ ] R2 চালু করা আর ছবির URL-এর নিয়ম ঠিক করা (সাইজ অনুযায়ী path)।
- [ ] Upload script: একটা ছবি দিলে তিন সাইজে AVIF + WebP বানিয়ে R2-এ তোলা।
- [ ] `/api/app/scene`, `/api/app/catalog`, `/api/app/product/[slug]`: JSON, Cloudflare-এ cache, data বদলালে cache মুছে যাবে।
- [ ] Hind Siliguri আর Anton `next/font` দিয়ে নিজের সাইটে রাখা, শুধু দরকারি অক্ষর।

**শেষ হয়েছে বোঝা যাবে যখন:** `/api/app/scene` ঢাকা থেকে ১০০ms-এর মধ্যে আসে (দ্বিতীয়বার, cache থেকে), আর একটা ছবি upload করলে তিন সাইজ R2-এ দেখা যায়।

## ধাপ W2 — ওয়েব: 3D দোকান

> কোড লেখার আগে `node_modules/next/dist/docs/` থেকে Server/Client Component, `next/dynamic`, `next/image` আর caching-এর অংশ পড়ে নিন (AGENTS.md অনুযায়ী)।

**কীভাবে বানাবেন:**
- পুরো পাতা Server Component। শুধু `StoreScene` একটা ছোট Client Component, `next/dynamic` দিয়ে পরে লোড হবে।
- `StoreScene`-এর ভেতরে `.scene { perspective }`, `.room { transform-style: preserve-3d }` আর দেয়ালগুলো `rotateY`/`rotateX` + `translateZ` দিয়ে (mockup-এর মতো)।
- নড়াচড়া শুধু `transform` আর `opacity` দিয়ে, যাতে GPU কাজ করে।
- 3D-র ভেতরে `mix-blend-mode`, `backdrop-filter`, `filter` ব্যবহার করবেন না। এগুলো 3D-কে চ্যাপ্টা করে দেয় (mockup বানানোর সময় এই সমস্যা হয়েছিল)।
- প্রতিটা দেয়াল আর jersey একটা আসল `<a>` link। Google পড়তে পারবে, keyboard দিয়েও চলবে।

**পাতাগুলো:**
- [ ] **Entrance (`/`):** বন্ধ দরজা, সাইনবোর্ড, বাংলা tagline। "ভেতরে ঢুকুন" চাপলে দরজা খুলবে আর ক্যামেরা সামনে যাবে। নিচে সবসময় একটা "সরাসরি shop দেখুন" link।
- [ ] **Shop floor:** বামে Jersey wall, ডানে Accessories, পেছনে Custom Jersey Desk। প্রতিটায় ক্লিক করলে সেই অংশে যাবে।
- [ ] **Jersey rail:** বৃত্তাকার rail-এ ১১টা jersey। আঙুল টানলে ঘুরবে (pointer event, `requestAnimationFrame`), থামলে সবচেয়ে কাছেরটায় এসে বসবে। সামনেরটার নাম, দাম আর "দেখুন"। শুধু কাছের ৫টার বড় ছবি লোড হবে, বাকিগুলোর ছোট।
- [ ] **Accessories corner:** তাক, bat stand, দেয়ালের racket। Hotspot-এ ক্লিক করলে product।
- [ ] **Product পাতা (`/products/[slug]`):** ঘোরানো stand-এ ছবি, পাশে size, দাম, "Bag-এ যোগ করুন", WhatsApp। 3D stand শুধু সাজসজ্জা, পাতার মূল অংশ সাধারণ HTML।

**Lite mode (নিজে থেকে চালু হবে যদি):**
- `navigator.connection.saveData` চালু থাকে, অথবা `effectiveType` `2g` বা `3g` হয়
- `prefers-reduced-motion` চালু থাকে
- ফোনের RAM কম হয় (`navigator.deviceMemory` ≤ 2)
- 3D অংশ ৩ সেকেন্ডের মধ্যে লোড না হয়

Lite mode-এ বর্তমান `/shop` grid দেখাবে, সাথে উপরে দোকানের একটা ছবি। ক্রেতা নিজেও "3D বন্ধ/চালু" button দিয়ে বদলাতে পারবে, পছন্দটা মনে রাখা হবে।

**শেষ হয়েছে বোঝা যাবে যখন:** সব budget পূরণ হয় ("Slow 4G" আর একটা সস্তা Android ফোনে), lite mode ঠিকমতো চালু হয়, আর 3D বন্ধ রেখেও পুরো কেনাকাটা করা যায়।

## ধাপ W3 — ওয়েব: 360° viewer

- [ ] Product পাতায় "360°" button, শুধু `spin` থাকলে দেখাবে।
- [ ] চাপলে প্রথমে প্রতি ৩ নম্বর frame (৮টা) লোড হবে, ঘোরানো তখনই শুরু করা যাবে। বাকি ১৬টা পেছনে লোড হয়ে ফাঁক পূরণ করবে।
- [ ] আঙুল টানলে frame বদলাবে (একটা `<img>`-এর `src` বদলানো, অথবা একটা লম্বা sprite)। ছেড়ে দিলে একটু গড়িয়ে থামবে।
- [ ] ভালো নেট আর বড় স্ক্রিনে ৯৬০px, নাহলে ৪৮০px।
- [ ] Lite mode-এ নিজে থেকে লোড হবে না, শুধু চাপলে।

**শেষ হয়েছে বোঝা যাবে যখন:** "Slow 4G"-এ চাপার ১ সেকেন্ডের মধ্যে ঘোরানো যায়।

## ধাপ W4 — ওয়েব: Custom jersey live preview

[roadmap.md](roadmap.md)-এর Phase 3 (পথ B: catalog থেকে design) এর সাথে।

- [ ] `JerseyPreview` component: template JSON পড়ে layer আঁকবে (CSS `mask-image` দিয়ে রং, তার উপর লেখা আর logo, সবার উপরে shade `mix-blend-mode: multiply`; এটা 3D-র বাইরে, তাই এখানে চলবে)।
- [ ] সামনে/পেছনে flip (CSS `rotateY(180deg)` + `backface-visibility: hidden`)।
- [ ] নাম লিখলে সাথে সাথে বদলাবে। লম্বা নাম হলে নিজে থেকে font ছোট হবে, `max` অক্ষরের বেশি নিবে না।
- [ ] রং বাছাই, logo upload (ছবি ছোট করে নিয়ে তারপর upload)।
- [ ] Order-এর সময় preview-কে ছবি বানিয়ে (canvas) R2-এ রাখা আর `custom_orders`-এর সাথে যুক্ত করা।
- [ ] Shop floor-এর Custom Jersey Desk আর rail থেকে এখানে আসার পথ।

**শেষ হয়েছে বোঝা যাবে যখন:** একজন ক্রেতা ফোনে design বেছে, নাম আর নম্বর দিয়ে, preview দেখে order জমা দিতে পারে, আর admin সেই একই preview ছবি দেখতে পায়।

## ধাপ W5 — ওয়েব: মাপা, ঠিক করা, চালু করা

- [ ] Lighthouse (মোবাইল) আর WebPageTest (Mumbai বা Singapore location, "4G" বা "3G Fast")।
- [ ] অন্তত ২টা সস্তা Android ফোনে (Chrome) নিজে হাতে চালানো।
- [ ] PWA: `manifest`, icon, service worker দিয়ে দেখা পাতা আর ছবি cache, "Install" প্রস্তাব।
- [ ] Analytics: কতজন 3D চালু রাখে, কতজন lite mode-এ যায়, 3D থেকে কতজন কেনে। এই সংখ্যা দেখে অ্যাপে কতটা 3D রাখবেন তা ঠিক করবেন।

---

## Flutter শেখা (অ্যাপ শুরুর আগে, W2–W5-এর সময় সমান্তরালে)

নিজে বানাবেন, তাই এই ক্রমে শিখুন। প্রতিটার জন্য একটা ছোট practice অ্যাপ বানান।

1. **Dart-এর মূল বিষয়:** null safety, `async`/`await`, class, `Future`/`Stream`।
2. **Widget:** `StatelessWidget`, `StatefulWidget`, `Row`/`Column`/`Stack`, `ListView`/`GridView`।
3. **নড়াচড়া:** `AnimationController`, `Tween`, `AnimatedBuilder`, `GestureDetector`।
4. **3D:** `Transform` + `Matrix4` (নিচের উদাহরণ)। একটা ঘোরানো কার্ড আর একটা খোলা দরজা বানিয়ে দেখুন।
5. **State management:** Riverpod।
6. **Navigation:** `go_router`।
7. **Backend:** `supabase_flutter` দিয়ে login আর একটা table পড়া।
8. **গতি মাপা:** `flutter run --profile` আর Flutter DevTools (Performance tab)।

Flutter-এ CSS 3D-র মতোই কাজ হয়:

```dart
Transform(
  alignment: Alignment.centerLeft,          // দরজার কব্জা
  transform: Matrix4.identity()
    ..setEntry(3, 2, 0.0012)                // CSS-এর perspective
    ..rotateY(doorAnimation.value * 1.36),  // ০ থেকে ~৭৮°
  child: Image.asset('assets/door-left.webp'),
)
```

---

## ধাপ A1 — অ্যাপ: ভিত্তি

**Package (শুরুর সময় pub.dev-এ সর্বশেষ version আর রক্ষণাবেক্ষণ চলছে কি না দেখে নিন):**

| কাজ | Package |
| --- | --- |
| Backend, login | `supabase_flutter` |
| State | `flutter_riverpod` |
| Navigation, deep link | `go_router` |
| HTTP + cache | `dio` (+ cache interceptor) |
| ছবি cache | `cached_network_image` |
| Offline data | `drift` অথবা `hive_ce` |
| Model | `freezed` + `json_serializable` |
| Payment পাতা খোলা | `url_launcher` (in-app browser / Custom Tabs) |
| Notification | `firebase_messaging` |
| ভাষা | `flutter_localizations` + `intl` (বাংলা/English) |

**Folder কাঠামো (feature অনুযায়ী):**

```
lib/
  core/        (theme, router, api client, cache, lite mode)
  features/
    store3d/   (entrance, floor, rail, accessories)
    catalog/   (list, filter, product)
    spin360/
    custom_jersey/
    cart/ checkout/ orders/ account/
  shared/      (widgets, models)
```

**কাজ:**
- [ ] Theme: কালো মার্বেল আর সোনালি, ওয়েবের রং আর font।
- [ ] API client: catalog আর scene আসবে `/api/app/*` থেকে (Cloudflare cache), ব্যক্তিগত জিনিস `supabase_flutter` দিয়ে।
- [ ] Offline: শেষবার পাওয়া catalog আর scene JSON ফোনে রাখা। অ্যাপ খুললে আগে cache দেখাবে, তারপর পেছনে নতুন data আনবে।
- [ ] Lite mode: প্রথম scene JSON আসতে কত সময় লাগল তা মেপে ধীর হলে নিজে থেকে চালু হবে। Settings-এ "Data saver" switch। কম RAM-এর ফোনে শুরু থেকেই চালু।
- [ ] বাংলা/English।

## ধাপ A2 — অ্যাপ: কেনাকাটা (3D-র আগে)

আগে অ্যাপকে কেনার যোগ্য বানান, তারপর সাজান।

- [ ] Category, product list (`GridView`, ৪৮০px ছবি), filter।
- [ ] Product পাতা: ছবি, size, দাম, "Bag-এ যোগ করুন"।
- [ ] Cart, checkout: ওয়েবের checkout API ব্যবহার করে। দাম, coupon আর risk score server হিসাব করবে।
- [ ] Payment: UnivaPayment-এর checkout পাতা in-app browser-এ খুলবে, শেষ হলে deep link (`artssports://order/…`) দিয়ে অ্যাপে ফিরবে।
- [ ] Order তালিকা আর tracking, notification (FCM)।

**শেষ হয়েছে বোঝা যাবে যখন:** 3D ছাড়াই অ্যাপ দিয়ে পুরো order আর payment করা যায়।

## ধাপ A3 — অ্যাপ: 3D দোকান

- [ ] `store_scenes` JSON পড়ে দেয়াল বানানো: `Stack` + `Transform` (`Matrix4`-এর perspective, `rotateY`, `translate`)।
- [ ] Entrance: দরজা খোলা (`AnimationController`), তারপর ক্যামেরা সামনে (scale + translate)।
- [ ] Jersey rail: `GestureDetector`-এ আঙুল টানলে কোণ বদলাবে, ছেড়ে দিলে কাছের jersey-তে এসে থামবে। শুধু সামনের ৫টার বড় ছবি।
- [ ] Hotspot: দেয়ালের ছবির উপর `x`, `y` অনুযায়ী button।
- [ ] দুর্বল ফোনে মসৃণ রাখা: প্রতিটা দেয়াল `RepaintBoundary`-তে, `Opacity` widget না (তার বদলে `FadeTransition`), পরের দৃশ্যের ছবি আগে থেকে `precacheImage`, ছবি স্ক্রিনের মাপে decode (`cacheWidth`)।
- [ ] Lite mode-এ 3D-র বদলে A2-এর list।

## ধাপ A4 — অ্যাপ: 360° আর custom jersey

- [ ] **360°:** ওয়েবের মতোই। প্রথমে ৮টা frame, বাকিগুলো পরে। `GestureDetector` দিয়ে frame বদলানো, সব frame আগে থেকে `precacheImage`। শুধু চাপলে লোড হবে।
- [ ] **Custom jersey preview:** একই `jersey_templates` JSON। `Stack`-এ base ছবি, রং (`ColorFiltered` + mask), `Positioned` দিয়ে নাম, নম্বর আর logo, সবার উপরে shade (`BlendMode.multiply`)।
- [ ] Flip: `Transform` দিয়ে `rotateY`। অর্ধেক ঘোরার পর সামনের বদলে পেছনের ছবি দেখাবে।
- [ ] Order-এর সময় preview-কে ছবি বানানো (`RepaintBoundary.toImage`) আর upload।

## ধাপ A5 — অ্যাপ: মাপা আর Play Store

- [ ] `flutter build appbundle --obfuscate --split-debug-info=...` দিয়ে build। Play Store নিজে থেকে প্রতিটা ফোনের জন্য ছোট APK বানাবে।
- [ ] অ্যাপের ভেতরে শুধু entrance-এর ছোট ছবি আর font। বাকি সব ছবি নেট থেকে আসবে আর cache হবে।
- [ ] ২টা সস্তা Android ফোনে `--profile` mode-এ চালিয়ে লাল frame খোঁজা।
- [ ] প্রথমে Play Store-এ "internal testing" দিয়ে কয়েকজন ক্রেতাকে দেওয়া, তারপর সবার জন্য।
- [ ] iOS পরে (Apple developer account আর Mac লাগবে; প্রথমে Android, কারণ বাংলাদেশে বেশিরভাগ ক্রেতা Android ব্যবহার করে)।

---

## ঝুঁকি আর বিকল্প

| সমস্যা | কী করবেন |
| --- | --- |
| দুর্বল ফোনে 3D ধীর | Lite mode নিজে থেকে চালু হবে। দরকার হলে দেয়ালের সংখ্যা কমানো বা rail-এর jersey ১১ থেকে ৭ |
| 360° ছবি তোলা বেশি ঝামেলার | বাদ দিন, শুধু সামনে/পেছনে/কাছের ছবি। কোড বদলাতে হবে না |
| দোকানের ছবি দেয়ালে বাঁকা বা অস্পষ্ট দেখায় | আবার ছবি তোলা (সোজা সামনে থেকে) অথবা দেয়ালের জন্য নিজেদের বানানো graphic |
| Flutter শিখতে সময় লাগছে | A2 (কেনাকাটা) আগে শেষ করে অ্যাপ release করুন, 3D (A3) পরের update-এ |
| Flutter-এ AVIF চলে না | অ্যাপের জন্য WebP |
| Preview-এর রং আর আসল কাপড়ের রং আলাদা | Preview-এর পাশে লেখা "রং স্ক্রিনভেদে একটু আলাদা হতে পারে"। চূড়ান্ত mockup designer দেবে (roadmap.md Phase 3) |
| Supabase Singapore-এ ধীর | Catalog আর scene সবসময় Cloudflare cache থেকে। Supabase শুধু login আর order-এ |
| 3D থাকার পরও বিক্রি বাড়ছে না | W5-এর analytics দেখে অ্যাপে 3D কম রাখা, বাকিটা সাধারণ shop |

---

## কাজের ক্রম আর আনুমানিক সময় (একজন মানুষ)

| ধাপ | কাজ | সময় |
| --- | --- | --- |
| শুরু | দোকানের দেয়াল আর product-এর ছবি, ২০টা 360° (সমান্তরালে) | চলতে থাকবে |
| W1 | Data, R2, ছবির ব্যবস্থা, `/api/app/*` | ১–২ সপ্তাহ |
| W2 | ওয়েবের 3D দোকান আর lite mode | ৩–৪ সপ্তাহ |
| W3 | 360° viewer | ১ সপ্তাহ |
| W4 | Custom jersey preview (roadmap.md Phase 3-এর সাথে) | ২–৩ সপ্তাহ |
| W5 | মাপা, PWA, চালু | ১ সপ্তাহ |
| (সমান্তরালে) | Flutter শেখা | W2–W5-এর সময় |
| A1–A2 | অ্যাপের ভিত্তি আর কেনাকাটা → প্রথম release | ৪–৬ সপ্তাহ |
| A3 | অ্যাপের 3D দোকান | ২–৩ সপ্তাহ |
| A4 | 360° আর custom jersey | ২ সপ্তাহ |
| A5 | মাপা আর Play Store | ১ সপ্তাহ |

মোট: ওয়েব মোটামুটি **২–৩ মাস**, তারপর অ্যাপ আরো **২–৩ মাস**। Payment, checkout আর courier আগেই তৈরি আছে (roadmap.md Phase 0–1), তাই এই সময়ের মধ্যে সেগুলো ধরা হয়নি।

---

## এখনো যা ঠিক করা বাকি

- [ ] কোন ২০–৩০টা product-এর 360° হবে?
- [ ] Custom jersey-র প্রথম কয়টা template (প্রতিটা খেলার জন্য কয়টা)?
- [ ] দোকানের ছবি কে তুলবে: নিজেরা নাকি photographer?
- [ ] অ্যাপের নাম আর Play Store developer account (নিজের নামে নাকি ব্যবসার নামে)।
- [ ] অ্যাপের Flutter project এই repo-তেই (`app/` folder) থাকবে, নাকি আলাদা repo?
