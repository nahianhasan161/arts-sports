"use client";

/**
 * One call per shop event, sent to every tag that is set up:
 *   Meta Pixel (fbq), GA4 (gtag), Google Tag Manager (dataLayer, GA4
 *   ecommerce format), TikTok Pixel (ttq), Pinterest Tag (pintrk).
 *
 * The same event id goes to every tag, and the server sends Lead / Purchase
 * with that id too (lib/tracking/server.ts), so Meta, TikTok and Pinterest
 * count each one once even when both halves arrive. GA4 dedupes purchases by
 * transaction_id. A tag that is not loaded is skipped; a broken one never
 * breaks the shop.
 */

export type ShopEvent =
  | "ViewContent"
  | "AddToCart"
  | "InitiateCheckout"
  | "AddPaymentInfo"
  | "Purchase"
  | "Lead";

export interface EventItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  variant?: string;
  category?: string;
}

export interface EventData {
  value: number;
  currency?: string;
  items: EventItem[];
  orderId?: string;
  paymentType?: string;
}

type Fn = (...args: unknown[]) => void;
type TagWindow = Window & {
  fbq?: Fn;
  gtag?: Fn;
  dataLayer?: unknown[];
  ttq?: { track: Fn; page: Fn };
  pintrk?: Fn;
};

const GA4_NAME: Record<ShopEvent, string> = {
  ViewContent: "view_item",
  AddToCart: "add_to_cart",
  InitiateCheckout: "begin_checkout",
  AddPaymentInfo: "add_payment_info",
  Purchase: "purchase",
  Lead: "generate_lead",
};

/** TikTok's standard events. A COD order (Lead here) is "PlaceAnOrder", a paid one "CompletePayment". */
export const TIKTOK_NAME: Record<ShopEvent, string> = {
  ViewContent: "ViewContent",
  AddToCart: "AddToCart",
  InitiateCheckout: "InitiateCheckout",
  AddPaymentInfo: "AddPaymentInfo",
  Purchase: "CompletePayment",
  Lead: "PlaceAnOrder",
};

/** Pinterest's standard events; it has none for checkout steps. */
export const PINTEREST_NAME: Record<ShopEvent, string | null> = {
  ViewContent: "pagevisit",
  AddToCart: "addtocart",
  InitiateCheckout: null,
  AddPaymentInfo: null,
  Purchase: "checkout",
  Lead: "lead",
};

export function newEventId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function attempt(fn: () => void) {
  try {
    fn();
  } catch {
    // A broken tag never breaks the shop.
  }
}

export function trackEvent(event: ShopEvent, data: EventData, eventId = newEventId()): string {
  if (typeof window === "undefined") return eventId;
  // Staff previewing a product are not customers.
  if (window.location.pathname.startsWith("/preview/")) return eventId;
  const w = window as TagWindow;
  const currency = data.currency ?? "BDT";
  const numItems = data.items.reduce((s, i) => s + i.quantity, 0);
  const gaItems = data.items.map((i) => ({
    item_id: i.id,
    item_name: i.name,
    price: i.price,
    quantity: i.quantity,
    item_variant: i.variant,
    item_category: i.category,
  }));

  attempt(() =>
    w.fbq?.(
      "track",
      event,
      {
        value: data.value,
        currency,
        content_type: "product",
        content_ids: data.items.map((i) => i.id),
        contents: data.items.map((i) => ({ id: i.id, quantity: i.quantity, item_price: i.price })),
        num_items: numItems,
        ...(data.orderId ? { order_id: data.orderId } : {}),
      },
      { eventID: eventId }
    )
  );

  attempt(() =>
    w.gtag?.("event", GA4_NAME[event], {
      currency,
      value: data.value,
      ...(data.orderId ? { transaction_id: data.orderId } : {}),
      ...(data.paymentType ? { payment_type: data.paymentType } : {}),
      items: gaItems,
    })
  );

  // Tag Manager: GA4 ecommerce shape, plus the shared id for tags that dedupe.
  attempt(() => {
    if (!w.dataLayer) return;
    w.dataLayer.push({ ecommerce: null });
    w.dataLayer.push({
      event: GA4_NAME[event],
      event_id: eventId,
      shop_event: event,
      ecommerce: {
        currency,
        value: data.value,
        ...(data.orderId ? { transaction_id: data.orderId } : {}),
        ...(data.paymentType ? { payment_type: data.paymentType } : {}),
        items: gaItems,
      },
    });
  });

  attempt(() =>
    w.ttq?.track(
      TIKTOK_NAME[event],
      {
        value: data.value,
        currency,
        content_type: "product",
        contents: data.items.map((i) => ({ content_id: i.id, content_name: i.name, quantity: i.quantity, price: i.price })),
        ...(data.orderId ? { order_id: data.orderId } : {}),
      },
      { event_id: eventId }
    )
  );

  const pin = PINTEREST_NAME[event];
  if (pin) {
    attempt(() =>
      w.pintrk?.("track", pin, {
        event_id: eventId,
        value: data.value,
        currency,
        order_quantity: numItems,
        ...(data.orderId ? { order_id: data.orderId } : {}),
        line_items: data.items.map((i) => ({
          product_id: i.id,
          product_name: i.name,
          product_price: i.price,
          product_quantity: i.quantity,
          ...(i.category ? { product_category: i.category } : {}),
        })),
      })
    );
  }

  return eventId;
}

/**
 * A page view after moving inside the site (the tags count the first page
 * themselves when they load). GA4 counts these by itself (enhanced
 * measurement); GTM gets `virtual_page_view` for a History Change-free setup.
 * Product pages leave Pinterest to ViewContent, which carries the product.
 */
export function trackPageView(path: string) {
  if (typeof window === "undefined") return;
  const w = window as TagWindow;
  attempt(() => w.fbq?.("track", "PageView"));
  attempt(() => w.ttq?.page());
  if (!path.startsWith("/products/")) attempt(() => w.pintrk?.("track", "pagevisit"));
  attempt(() => w.dataLayer?.push({ event: "virtual_page_view", page_path: path, page_location: window.location.href, page_title: document.title }));
}
