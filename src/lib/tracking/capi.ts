import "server-only";
import { toInternational } from "@/lib/phone";

/**
 * Meta Conversions API: the server half of each event. The browser pixel
 * sends the same event with the same event_id, and Meta keeps one.
 *
 * Env: NEXT_PUBLIC_META_PIXEL_ID, META_CAPI_ACCESS_TOKEN,
 *      META_CAPI_TEST_EVENT_CODE (optional, while testing in Events Manager).
 */

export interface CapiEvent {
  name: "Purchase" | "Lead" | "InitiateCheckout" | "AddPaymentInfo";
  eventId: string;
  value: number;
  contentIds: string[];
  numItems?: number;
  orderId?: string;
  sourceUrl?: string;
  user: {
    phone?: string | null;
    email?: string | null;
    name?: string | null;
    district?: string | null;
    ip?: string | null;
    userAgent?: string | null;
    fbc?: string | null;
    fbp?: string | null;
    externalId?: string | null;
  };
}

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value.trim().toLowerCase()));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function isCapiConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim() && process.env.META_CAPI_ACCESS_TOKEN?.trim());
}

export async function sendCapiEvent(event: CapiEvent): Promise<void> {
  if (!isCapiConfigured()) return;
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID!.trim();
  const token = process.env.META_CAPI_ACCESS_TOKEN!.trim();
  const u = event.user;

  const phone = u.phone ? toInternational(u.phone) : null;
  const [first, ...rest] = (u.name ?? "").trim().split(/\s+/);
  const userData: Record<string, unknown> = {
    ...(phone ? { ph: [await sha256(phone)] } : {}),
    ...(u.email ? { em: [await sha256(u.email)] } : {}),
    ...(first ? { fn: [await sha256(first)] } : {}),
    ...(rest.length ? { ln: [await sha256(rest.join(" "))] } : {}),
    ...(u.district ? { ct: [await sha256(u.district.replace(/\s+/g, ""))] } : {}),
    country: [await sha256("bd")],
    ...(u.externalId ? { external_id: [await sha256(u.externalId)] } : {}),
    ...(u.ip ? { client_ip_address: u.ip } : {}),
    ...(u.userAgent ? { client_user_agent: u.userAgent } : {}),
    ...(u.fbc ? { fbc: u.fbc } : {}),
    ...(u.fbp ? { fbp: u.fbp } : {}),
  };

  const body = {
    data: [
      {
        event_name: event.name,
        event_time: Math.floor(Date.now() / 1000),
        event_id: event.eventId,
        action_source: "website",
        event_source_url: event.sourceUrl,
        user_data: userData,
        custom_data: {
          currency: "BDT",
          value: event.value,
          content_type: "product",
          content_ids: event.contentIds,
          num_items: event.numItems,
          order_id: event.orderId,
        },
      },
    ],
    ...(process.env.META_CAPI_TEST_EVENT_CODE?.trim()
      ? { test_event_code: process.env.META_CAPI_TEST_EVENT_CODE.trim() }
      : {}),
  };

  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${pixelId}/events?access_token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) console.error("Meta CAPI rejected an event:", res.status, await res.text().catch(() => ""));
  } catch (err) {
    console.error("Meta CAPI call failed:", err);
  }
}

/** The caller's IP as Cloudflare reports it. */
export function clientIp(headers: Headers): string | null {
  return (
    headers.get("cf-connecting-ip") ??
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headers.get("x-real-ip") ??
    null
  );
}

export function cookieValue(headers: Headers, name: string): string | null {
  const raw = headers.get("cookie") ?? "";
  const hit = raw.split(/;\s*/).find((c) => c.startsWith(`${name}=`));
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : null;
}
