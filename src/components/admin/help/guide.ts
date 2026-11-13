import type { Locale } from "@/i18n";

/**
 * The "How to use" guide in the admin panel, written for someone who has
 * never used the system. Each topic is a short list of steps and a button
 * that opens the page where the job is done.
 *
 * Keep the wording plain. When a screen changes, update its steps here.
 */
type Text = Record<Locale, string>;

export interface Topic {
  id: string;
  /** Which part of the business it belongs to; shown as a coloured tag. */
  area: "start" | "online" | "store" | "both";
  title: Text;
  summary: Text;
  steps: Text[];
  href?: string;
  action?: Text;
}

export const AREA_LABEL: Record<Topic["area"], Text> = {
  start: { bn: "শুরু", en: "Getting started" },
  online: { bn: "অনলাইন স্টোর", en: "Online store" },
  store: { bn: "দোকান (POS)", en: "Shop (POS)" },
  both: { bn: "দুটোতেই", en: "Both" },
};

export const GUIDE: Topic[] = [
  {
    id: "panel",
    area: "start",
    title: { bn: "প্যানেলটি কীভাবে সাজানো", en: "How this panel is organised" },
    summary: { bn: "বাম পাশের মেনু দুই ভাগে: অনলাইন স্টোর এবং দোকান (POS)।", en: "The menu on the left has two halves: Online store and Shop (POS)." },
    steps: [
      { bn: "বাম পাশে উপরে দুটি বোতাম আছে: “অনলাইন স্টোর” ও “দোকান (POS)”। যেটিতে কাজ করবেন সেটিতে চাপুন — নিচের মেনু বদলে যাবে।", en: "At the top of the left menu there are two buttons: “Online store” and “Shop (POS)”. Press the one you are working in and the menu below changes." },
      { bn: "অনলাইন স্টোর = ওয়েবসাইটের অর্ডার, পণ্য, অফার, কাস্টম জার্সি।", en: "Online store = website orders, products, offers and custom jerseys." },
      { bn: "দোকান (POS) = কাউন্টারে বিক্রি, ক্যাশ ড্রয়ার, দোকানের শাখা।", en: "Shop (POS) = counter sales, the cash drawer and your shop branches." },
      { bn: "স্টক, গ্রাহক ও পণ্য দুই জায়গাতেই একই — তাই এগুলো দুই মেনুতেই দেখা যায়।", en: "Stock, customers and products are the same in both, so they appear in both menus." },
      { bn: "প্রতিটি পেজের উপরে নামের নিচে এক লাইনে লেখা থাকে পেজটি কী কাজের।", en: "Under the name at the top of every page, one line says what the page is for." },
      { bn: "উপরে ডানে ভাষা (বাংলা/English) ও লাইট/ডার্ক মোড বদলানো যায়।", en: "At the top right you can switch the language (বাংলা/English) and light/dark mode." },
    ],
  },
  {
    id: "first-product",
    area: "start",
    title: { bn: "প্রথম পণ্য যোগ করা", en: "Add your first product" },
    summary: { bn: "ক্যাটাগরি → পণ্য → স্টক। এই তিন ধাপের পর পণ্যটি বিক্রি করা যায়।", en: "Category → product → stock. After these three steps the product can be sold." },
    steps: [
      { bn: "অনলাইন স্টোর → ক্যাটাগরি: পণ্যের ভাগ তৈরি করুন (যেমন “জার্সি”)। আগে থেকে থাকলে এই ধাপ বাদ দিন।", en: "Online store → Categories: make a group for the product (for example “Jerseys”). Skip this if it already exists." },
      { bn: "পণ্য → নতুন পণ্য: নাম, দাম, ছবি, রং ও সাইজ দিন, তারপর সেভ করুন।", en: "Products → add product: give the name, price, photos, colours and sizes, then save." },
      { bn: "স্টক → “মাল আসা”: পণ্যটি টিক দিন, কত পিস এসেছে লিখে সেভ করুন। স্টক না থাকলে পণ্য বিক্রি হবে না।", en: "Stock → “Stock in”: tick the product, write how many pieces arrived and save. A product with no stock cannot be sold." },
      { bn: "এখন পণ্যটি ওয়েবসাইটে দেখা যাবে এবং দোকানের কাউন্টারেও বিক্রি করা যাবে।", en: "The product is now visible on the website and can also be sold at the shop counter." },
    ],
    href: "/admin/products",
    action: { bn: "পণ্য পেজ খুলুন", en: "Open Products" },
  },
  {
    id: "web-order",
    area: "online",
    title: { bn: "ওয়েবসাইটের অর্ডার সামলানো", en: "Handle a website order" },
    summary: { bn: "নতুন অর্ডার এলে ড্যাশবোর্ডে “যে কাজগুলো বাকি” অংশে দেখায়।", en: "A new order shows on the dashboard under “Needs your attention”." },
    steps: [
      { bn: "অর্ডার পেজ খুলুন। নতুন অর্ডারের অবস্থা “pending” থাকে।", en: "Open Orders. A new order has the status “pending”." },
      { bn: "অর্ডারে চাপ দিয়ে বিস্তারিত দেখুন: গ্রাহকের নাম, মোবাইল, ঠিকানা, পণ্য।", en: "Press the order to see the details: the customer's name, mobile, address and items." },
      { bn: "দরকার হলে গ্রাহককে কল করে নিশ্চিত হোন, তারপর অবস্থা বদলে “processing” করুন।", en: "Call the customer to confirm if needed, then change the status to “processing”." },
      { bn: "প্যাক করে কুরিয়ারে দিন। কুরিয়ার ও COD পেজ থেকে পার্সেল ও ক্যাশ অন ডেলিভারির টাকার হিসাব রাখা যায়।", en: "Pack it and hand it to the courier. The Courier & COD page follows parcels and cash-on-delivery money." },
      { bn: "পাঠানো হলে “shipped”, গ্রাহক পেলে “delivered” করুন।", en: "Mark it “shipped” when sent and “delivered” when the customer has it." },
    ],
    href: "/admin/orders",
    action: { bn: "অর্ডার খুলুন", en: "Open Orders" },
  },
  {
    id: "pos-sell",
    area: "store",
    title: { bn: "দোকানের কাউন্টারে বিক্রি", en: "Sell at the shop counter" },
    summary: { bn: "দিনের শুরুতে ক্যাশ ড্রয়ার খুলুন, বিক্রি করুন, দিন শেষে বন্ধ করুন।", en: "Open the cash drawer in the morning, sell, and close it at night." },
    steps: [
      { bn: "দোকান (POS) → বিক্রি (POS) খুলুন।", en: "Go to Shop (POS) → Sell (POS)." },
      { bn: "“ক্যাশ ড্রয়ার” ট্যাবে যান। আপনার দোকান বেছে নিন, ড্রয়ারে শুরুতে কত টাকা আছে লিখে ড্রয়ার খুলুন।", en: "Open the “Cash drawer” tab. Choose your shop, write how much cash you start with and open the drawer." },
      { bn: "“বিক্রি” ট্যাবে বারকোড স্ক্যান করুন, অথবা পণ্যের নাম লিখে খুঁজুন। পণ্য বিলে যোগ হবে।", en: "In the “Sell” tab, scan the barcode or type the product name. The item is added to the bill." },
      { bn: "গ্রাহকের মোবাইল নম্বর দিন (ঐচ্ছিক) — তাহলে তার কেনাকাটার ইতিহাস জমা থাকবে।", en: "Enter the customer's mobile number (optional) so the purchase is kept in their history." },
      { bn: "কীভাবে টাকা দিলেন বেছে নিন (ক্যাশ, কার্ড, বিকাশ, নগদ), বিল শেষ করুন এবং রসিদ প্রিন্ট করুন।", en: "Choose how they paid (cash, card, bKash, Nagad), finish the bill and print the receipt." },
      { bn: "দিন শেষে “ক্যাশ ড্রয়ার” ট্যাবে টাকা গুনে লিখুন এবং ড্রয়ার বন্ধ করুন। কম-বেশি হলে সিস্টেম দেখাবে।", en: "At the end of the day, count the cash in the “Cash drawer” tab and close the drawer. The system shows any difference." },
    ],
    href: "/admin/pos",
    action: { bn: "POS খুলুন", en: "Open the POS" },
  },
  {
    id: "pos-return",
    area: "store",
    title: { bn: "দোকানে পণ্য ফেরত নেওয়া", en: "Take a return in the shop" },
    summary: { bn: "রসিদ দিয়ে বিক্রিটি খুঁজে ফেরত নিন।", en: "Find the sale from its receipt and take the return." },
    steps: [
      { bn: "বিক্রি (POS) → “বিক্রির তালিকা ও ফেরত” ট্যাব খুলুন।", en: "Sell (POS) → open the “Sales & returns” tab." },
      { bn: "রসিদ নম্বর লিখে বিক্রিটি খুঁজুন (রসিদের QR স্ক্যান করলেও খুলবে)।", en: "Type the receipt number to find the sale (scanning the receipt QR also opens it)." },
      { bn: "কোন পণ্য কত পিস ফেরত আসছে বেছে নিন এবং টাকা ফেরত দিন। পণ্য আবার স্টকে যোগ হবে।", en: "Choose which items and how many are coming back, and give the refund. The pieces go back into stock." },
      { bn: "ফেরত নেওয়ার অনুমতি ম্যানেজার ও মালিকের থাকে।", en: "Managers and the owner are allowed to take returns." },
    ],
    href: "/admin/pos",
    action: { bn: "POS খুলুন", en: "Open the POS" },
  },
  {
    id: "stock",
    area: "both",
    title: { bn: "স্টক ঠিক রাখা", en: "Keep stock correct" },
    summary: { bn: "স্টক দোকান অনুযায়ী গোনা হয়। ওয়েবসাইট সব খোলা দোকানের মোট থেকে বিক্রি করে।", en: "Stock is counted per shop. The website sells from the total of all open shops." },
    steps: [
      { bn: "স্টক পেজ খুলুন। একাধিক দোকান থাকলে উপরে ডানে দোকান বেছে নিন।", en: "Open Stock. If you have several shops, pick the shop at the top right." },
      { bn: "নতুন মাল এলে: পণ্য টিক দিন → “মাল আসা” → পিস ও কেনা দাম লিখে সেভ করুন।", en: "New goods arrived: tick the items → “Stock in” → write the pieces and buying price, then save." },
      { bn: "গুনে দেখলে সংখ্যা না মিললে: “গোনা / ঠিক করা” → আসল সংখ্যা লিখুন ও কারণ বেছে নিন।", en: "The count does not match: “Count / fix” → write the real number and choose a reason." },
      { bn: "এক দোকান থেকে আরেক দোকানে পাঠাতে: “দোকান বদল” ট্যাব (দুই বা বেশি দোকান থাকলে দেখা যায়)।", en: "To move goods between shops: the “Transfer” tab (shown when you have two or more shops)." },
      { bn: "“বারকোড লেবেল” থেকে লেবেল প্রিন্ট করে পণ্যে লাগান — কাউন্টারে স্ক্যান করা সহজ হবে।", en: "Print labels from “Barcode labels” and stick them on the products so they can be scanned at the counter." },
      { bn: "“কম স্টক” বোতামে চাপলে শুধু যেগুলো শেষ হয়ে আসছে সেগুলো দেখায়।", en: "The “Low stock” button shows only the items that are running out." },
    ],
    href: "/admin/inventory",
    action: { bn: "স্টক খুলুন", en: "Open Stock" },
  },
  {
    id: "branches",
    area: "store",
    title: { bn: "একাধিক দোকান চালানো", en: "Run more than one shop" },
    summary: { bn: "প্রতিটি দোকানের আলাদা স্টক ও ক্যাশ ড্রয়ার, কিন্তু পণ্য ও গ্রাহক একই।", en: "Each shop has its own stock and cash drawers, but shares products and customers." },
    steps: [
      { bn: "দোকান (POS) → দোকান / শাখা → “দোকান যোগ করুন”। নাম ও ঠিকানা দিন।", en: "Shop (POS) → Shops / branches → “Add a shop”. Give the name and address." },
      { bn: "নতুন দোকানে মাল তুলুন: স্টক পেজে দোকানটি বেছে “মাল আসা”, অথবা অন্য দোকান থেকে “দোকান বদল”।", en: "Put goods in the new shop: choose it on the Stock page and use “Stock in”, or “Transfer” from another shop." },
      { bn: "ক্যাশিয়ার ড্রয়ার খোলার সময় নিজের দোকান বেছে নেবে — বিক্রি ও স্টক সেই দোকানের হিসাবে যাবে।", en: "The cashier chooses their shop when opening the drawer; sales and stock are counted for that shop." },
      { bn: "“দোকানের সারাংশ” পেজে সব দোকানের আজকের বিক্রি পাশাপাশি দেখা যায়।", en: "The “Shop overview” page shows today's sales for every shop side by side." },
      { bn: "কোনো দোকান বন্ধ করলে তা মুছে যায় না — পুরনো বিক্রির হিসাব থেকে যায়।", en: "Closing a shop does not delete it; its old sales stay on record." },
    ],
    href: "/admin/store/branches",
    action: { bn: "দোকান / শাখা খুলুন", en: "Open Shops / branches" },
  },
  {
    id: "customers",
    area: "both",
    title: { bn: "গ্রাহকের তথ্য দেখা", en: "Look up a customer" },
    summary: { bn: "মোবাইল নম্বরই গ্রাহকের পরিচয় — ওয়েবসাইট ও দোকান দুই জায়গার কেনাকাটা একসাথে।", en: "The mobile number is the customer's identity; website and shop purchases are shown together." },
    steps: [
      { bn: "গ্রাহক পেজ খুলে নাম বা মোবাইল নম্বর (01XXXXXXXXX) লিখে খুঁজুন।", en: "Open Customers and search by name or mobile number (01XXXXXXXXX)." },
      { bn: "গ্রাহকে চাপ দিলে তার ওয়েবসাইট অর্ডার, দোকানের বিল ও কাস্টম জার্সি অর্ডার দেখা যায়।", en: "Press a customer to see their website orders, shop bills and custom jersey orders." },
    ],
    href: "/admin/customers",
    action: { bn: "গ্রাহক খুলুন", en: "Open Customers" },
  },
  {
    id: "custom-jersey",
    area: "online",
    title: { bn: "কাস্টম জার্সির অর্ডার", en: "Custom jersey orders" },
    summary: { bn: "গ্রাহক অনুরোধ পাঠায় → আপনি দাম ও ডিজাইন পাঠান → গ্রাহক অগ্রিম দেয় → তৈরি → ডেলিভারি।", en: "The customer sends a request → you send the price and design → they pay the advance → production → delivery." },
    steps: [
      { bn: "কাস্টম অর্ডার পেজে নতুন অনুরোধগুলো দেখা যায়।", en: "New requests appear on the Custom orders page." },
      { bn: "অর্ডার খুলে চূড়ান্ত দাম ও ডিজাইনের নমুনা (মকআপ) পাঠান।", en: "Open the order and send the final price and the design mockup." },
      { bn: "গ্রাহক তার লিংক থেকে অনুমোদন করে অগ্রিম দেয়, তারপর অর্ডার তৈরির লাইনে যায়।", en: "The customer approves from their link and pays the advance; the order then joins the production queue." },
      { bn: "কাজ এগোলে অর্ডারের অবস্থা বদলান — গ্রাহক নিজের লিংকে তা দেখতে পায়।", en: "Change the status as work moves on; the customer sees it on their link." },
      { bn: "ফর্মে দেখানো দাম বদলাতে “জার্সির দাম” পেজে যান।", en: "To change the prices shown on the form, go to “Jersey prices”." },
    ],
    href: "/admin/custom-orders",
    action: { bn: "কাস্টম অর্ডার খুলুন", en: "Open Custom orders" },
  },
  {
    id: "offers",
    area: "both",
    title: { bn: "ডিসকাউন্ট ও কুপন দেওয়া", en: "Give discounts and coupons" },
    summary: { bn: "ডিসকাউন্ট নিজে থেকে বসে; কুপন কোড গ্রাহককে লিখতে হয়। দুটোই ওয়েবসাইট ও দোকানে চলে।", en: "A discount applies by itself; a coupon code must be typed in. Both work on the website and in the shop." },
    steps: [
      { bn: "ডিসকাউন্ট পেজ: কোন পণ্যে, কত ছাড়, কবে থেকে কবে পর্যন্ত — ঠিক করে সেভ করুন।", en: "Discounts: choose which products, how much off and the dates, then save." },
      { bn: "কুপন কোড পেজ: একটি কোড (যেমন EID10), ছাড়ের পরিমাণ ও মেয়াদ দিন।", en: "Coupon codes: give a code (for example EID10), the amount off and the end date." },
      { bn: "কাউন্টারে কুপন ব্যবহার করতে বিলে কোডটি লিখুন।", en: "To use a coupon at the counter, type the code on the bill." },
    ],
    href: "/admin/promotions",
    action: { bn: "ডিসকাউন্ট খুলুন", en: "Open Discounts" },
  },
  {
    id: "staff",
    area: "both",
    title: { bn: "স্টাফকে অ্যাকাউন্ট দেওয়া", en: "Give staff an account" },
    summary: { bn: "প্রতিটি স্টাফ শুধু তার কাজের পেজগুলোই দেখতে পায়।", en: "Each staff member sees only the pages for their job." },
    steps: [
      { bn: "স্টাফ ও দায়িত্ব পেজ খুলুন।", en: "Open Staff & roles." },
      { bn: "স্টাফকে একটি দায়িত্ব দিন — যেমন ক্যাশিয়ার (শুধু POS) বা ম্যানেজার।", en: "Give the staff member a role, such as cashier (POS only) or manager." },
      { bn: "স্টাফ লগইন করলে বাম মেনুতে শুধু অনুমতি পাওয়া পেজগুলো দেখাবে।", en: "When they sign in, the left menu shows only the pages they are allowed." },
      { bn: "কে কী পরিবর্তন করেছে তা “কাজের রেকর্ড” পেজে দেখা যায়।", en: "The “Activity log” page shows who changed what." },
    ],
    href: "/admin/roles",
    action: { bn: "স্টাফ ও দায়িত্ব খুলুন", en: "Open Staff & roles" },
  },
];
