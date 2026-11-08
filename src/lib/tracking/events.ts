"use client";

/**
 * One call per shop event, sent to every pixel that is set up.
 *
 * Meta: the browser pixel gets the same event_id the server sends to the
 * Conversions API, so Meta counts it once. GA4 gets the matching ecommerce
 * event. A new pixel (TikTok and so on) is one more branch in send().
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

type Fbq = (...args: unknown[]) => void;
type Gtag = (...args: unknown[]) => void;

const GA4_NAME: Record<ShopEvent, string> = {
  ViewContent: "view_item",
  AddToCart: "add_to_cart",
  InitiateCheckout: "begin_checkout",
  AddPaymentInfo: "add_payment_info",
  Purchase: "purchase",
  Lead: "generate_lead",
};

export function newEventId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function trackEvent(event: ShopEvent, data: EventData, eventId = newEventId()): string {
  if (typeof window === "undefined") return eventId;
  const w = window as Window & { fbq?: Fbq; gtag?: Gtag };
  const currency = data.currency ?? "BDT";

  try {
    w.fbq?.(
      "track",
      event,
      {
        value: data.value,
        currency,
        content_type: "product",
        content_ids: data.items.map((i) => i.id),
        contents: data.items.map((i) => ({ id: i.id, quantity: i.quantity, item_price: i.price })),
        num_items: data.items.reduce((s, i) => s + i.quantity, 0),
        ...(data.orderId ? { order_id: data.orderId } : {}),
      },
      { eventID: eventId }
    );
  } catch {
    // A broken pixel never breaks the shop.
  }

  try {
    w.gtag?.("event", GA4_NAME[event], {
      currency,
      value: data.value,
      ...(data.orderId ? { transaction_id: data.orderId } : {}),
      ...(data.paymentType ? { payment_type: data.paymentType } : {}),
      items: data.items.map((i) => ({
        item_id: i.id,
        item_name: i.name,
        price: i.price,
        quantity: i.quantity,
        item_variant: i.variant,
        item_category: i.category,
      })),
    });
  } catch {
    // Same.
  }

  return eventId;
}
