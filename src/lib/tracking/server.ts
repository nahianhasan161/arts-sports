import "server-only";
import { normalizeBdPhone } from "@/lib/phone";
import { clientIp, cookieValue, sendCapiEvent } from "./capi";

/**
 * Server-side conversion events: an order reaches the ad platforms from our
 * server, so ad blockers, iOS and closed tabs don't lose it. Each platform is
 * on only when its keys are set (see .env.example); the browser tags send the
 * same event with the same id and each platform keeps one.
 *
 *   Meta        Conversions API        NEXT_PUBLIC_META_PIXEL_ID + META_CAPI_ACCESS_TOKEN
 *   TikTok      Events API             NEXT_PUBLIC_TIKTOK_PIXEL_ID + TIKTOK_EVENTS_ACCESS_TOKEN
 *   Pinterest   Conversions API        PINTEREST_AD_ACCOUNT_ID + PINTEREST_CAPI_TOKEN
 *   GA4         Measurement Protocol   NEXT_PUBLIC_GA_MEASUREMENT_ID + GA4_API_SECRET (Purchase only)
 *
 * Customer details are sent SHA-256 hashed, as each platform asks.
 */

/** Browser ids the platforms match an order with. Saved on the order (orders.tracking) at checkout. */
export interface BrowserIds {
  ip?: string | null;
  user_agent?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  ttp?: string | null;
  ttclid?: string | null;
  epik?: string | null;
  ga_client_id?: string | null;
  ga_session_id?: string | null;
  source_url?: string | null;
}

export interface ServerEvent {
  name: "Purchase" | "Lead";
  eventId: string;
  value: number;
  items: { id: string; quantity: number; price?: number; name?: string }[];
  orderId?: string;
  user: {
    phone?: string | null;
    email?: string | null;
    name?: string | null;
    district?: string | null;
  };
  ids: BrowserIds;
}

const TIKTOK_EVENT = { Purchase: "CompletePayment", Lead: "PlaceAnOrder" } as const;
const PINTEREST_EVENT = { Purchase: "checkout", Lead: "lead" } as const;

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value.trim().toLowerCase()));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** 8801XXXXXXXXX (Meta, Pinterest: digits with country code). */
function phoneDigits(phone?: string | null): string | null {
  const local = normalizeBdPhone(phone ?? "");
  return local ? `88${local}` : null;
}

/** GA client id from the _ga cookie: "GA1.1.123.456" -> "123.456". */
function gaClientId(cookie: string | null): string | null {
  const m = cookie?.match(/^GA\d\.\d\.(.+)$/);
  return m ? m[1] : null;
}

/** GA session id from the _ga_<stream> cookie, old (GS1.1.<id>.…) and new (GS2.1.s<id>$…) formats. */
function gaSessionId(cookie: string | null): string | null {
  if (!cookie) return null;
  const gs2 = cookie.match(/^GS2\.\d\.s(\d+)/);
  if (gs2) return gs2[1];
  const gs1 = cookie.match(/^GS1\.\d\.(\d+)\./);
  return gs1 ? gs1[1] : null;
}

/** Everything the platforms can use from the request that placed the order. */
export function browserIds(headers: Headers): BrowserIds {
  const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim().replace(/^G-/, "");
  return {
    ip: clientIp(headers),
    user_agent: headers.get("user-agent"),
    fbp: cookieValue(headers, "_fbp"),
    fbc: cookieValue(headers, "_fbc"),
    ttp: cookieValue(headers, "_ttp"),
    ttclid: cookieValue(headers, "ttclid"),
    epik: cookieValue(headers, "_epik"),
    ga_client_id: gaClientId(cookieValue(headers, "_ga")),
    ga_session_id: gaId ? gaSessionId(cookieValue(headers, `_ga_${gaId}`)) : null,
    source_url: headers.get("referer"),
  };
}

/** Only short strings survive (the value comes back from the orders table as JSON). */
export function cleanIds(raw: unknown): BrowserIds {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: BrowserIds = {};
  for (const k of ["ip", "user_agent", "fbp", "fbc", "ttp", "ttclid", "epik", "ga_client_id", "ga_session_id", "source_url"] as const) {
    const v = o[k];
    if (typeof v === "string" && v) out[k] = v.slice(0, 500);
  }
  return out;
}

async function post(platform: string, url: string, init: RequestInit) {
  try {
    const res = await fetch(url, { ...init, method: "POST", signal: AbortSignal.timeout(8000) });
    if (!res.ok) console.error(`${platform} rejected an event:`, res.status, (await res.text().catch(() => "")).slice(0, 500));
  } catch (err) {
    console.error(`${platform} event failed:`, err instanceof Error ? err.message : err);
  }
}

async function toMeta(e: ServerEvent) {
  await sendCapiEvent({
    name: e.name,
    eventId: e.eventId,
    value: e.value,
    contentIds: e.items.map((i) => i.id),
    numItems: e.items.reduce((s, i) => s + i.quantity, 0),
    orderId: e.orderId,
    sourceUrl: e.ids.source_url ?? undefined,
    user: {
      ...e.user,
      ip: e.ids.ip,
      userAgent: e.ids.user_agent,
      fbc: e.ids.fbc,
      fbp: e.ids.fbp,
      externalId: e.user.phone,
    },
  });
}

async function toTikTok(e: ServerEvent) {
  const pixel = process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID?.trim();
  const token = process.env.TIKTOK_EVENTS_ACCESS_TOKEN?.trim();
  if (!pixel || !token) return;
  const phone = phoneDigits(e.user.phone);
  const test = process.env.TIKTOK_TEST_EVENT_CODE?.trim();
  await post("TikTok Events API", "https://business-api.tiktok.com/open_api/v1.3/event/track/", {
    headers: { "Content-Type": "application/json", "Access-Token": token },
    body: JSON.stringify({
      event_source: "web",
      event_source_id: pixel,
      ...(test ? { test_event_code: test } : {}),
      data: [
        {
          event: TIKTOK_EVENT[e.name],
          event_time: Math.floor(Date.now() / 1000),
          event_id: e.eventId,
          user: {
            ...(phone ? { phone: await sha256(`+${phone}`), external_id: await sha256(phone) } : {}),
            ...(e.user.email ? { email: await sha256(e.user.email) } : {}),
            ...(e.ids.ttclid ? { ttclid: e.ids.ttclid } : {}),
            ...(e.ids.ttp ? { ttp: e.ids.ttp } : {}),
            ...(e.ids.ip ? { ip: e.ids.ip } : {}),
            ...(e.ids.user_agent ? { user_agent: e.ids.user_agent } : {}),
          },
          ...(e.ids.source_url ? { page: { url: e.ids.source_url } } : {}),
          properties: {
            currency: "BDT",
            value: e.value,
            content_type: "product",
            contents: e.items.map((i) => ({ content_id: i.id, quantity: i.quantity, ...(i.price != null ? { price: i.price } : {}) })),
            ...(e.orderId ? { order_id: e.orderId } : {}),
          },
        },
      ],
    }),
  });
}

async function toPinterest(e: ServerEvent) {
  const account = process.env.PINTEREST_AD_ACCOUNT_ID?.trim();
  const token = process.env.PINTEREST_CAPI_TOKEN?.trim();
  if (!account || !token) return;
  const phone = phoneDigits(e.user.phone);
  const test = process.env.PINTEREST_CAPI_TEST === "true" ? "?test=true" : "";
  await post("Pinterest Conversions API", `https://api.pinterest.com/v5/ad_accounts/${encodeURIComponent(account)}/events${test}`, {
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      data: [
        {
          event_name: PINTEREST_EVENT[e.name],
          action_source: "web",
          event_time: Math.floor(Date.now() / 1000),
          event_id: e.eventId,
          ...(e.ids.source_url ? { event_source_url: e.ids.source_url } : {}),
          user_data: {
            ...(phone ? { ph: [await sha256(phone)], external_id: [await sha256(phone)] } : {}),
            ...(e.user.email ? { em: [await sha256(e.user.email)] } : {}),
            country: [await sha256("bd")],
            ...(e.ids.ip ? { client_ip_address: e.ids.ip } : {}),
            ...(e.ids.user_agent ? { client_user_agent: e.ids.user_agent } : {}),
            ...(e.ids.epik ? { click_id: e.ids.epik } : {}),
          },
          custom_data: {
            currency: "BDT",
            value: String(e.value),
            content_ids: e.items.map((i) => i.id),
            contents: e.items.map((i) => ({ id: i.id, quantity: i.quantity, ...(i.price != null ? { item_price: String(i.price) } : {}) })),
            num_items: e.items.reduce((s, i) => s + i.quantity, 0),
            ...(e.orderId ? { order_id: e.orderId } : {}),
          },
        },
      ],
    }),
  });
}

/** GA4: purchases only (GA4 dedupes them by transaction_id; leads would count twice). Needs the shopper's GA client id. */
async function toGa4(e: ServerEvent) {
  const id = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();
  const secret = process.env.GA4_API_SECRET?.trim();
  if (!id || !secret || e.name !== "Purchase" || !e.ids.ga_client_id) return;
  await post("GA4 Measurement Protocol", `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(id)}&api_secret=${encodeURIComponent(secret)}`, {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: e.ids.ga_client_id,
      events: [
        {
          name: "purchase",
          params: {
            currency: "BDT",
            value: e.value,
            ...(e.orderId ? { transaction_id: e.orderId } : {}),
            ...(e.ids.ga_session_id ? { session_id: e.ids.ga_session_id, engagement_time_msec: 1 } : {}),
            items: e.items.map((i) => ({ item_id: i.id, ...(i.name ? { item_name: i.name } : {}), quantity: i.quantity, ...(i.price != null ? { price: i.price } : {}) })),
          },
        },
      ],
    }),
  });
}

/** Sends one order event to every platform that is set up. Never throws. */
export async function sendServerEvent(e: ServerEvent): Promise<void> {
  await Promise.allSettled([toMeta(e), toTikTok(e), toPinterest(e), toGa4(e)]);
}
