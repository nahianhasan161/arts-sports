import "server-only";
import {
  CourierAuthError,
  CourierError,
  env,
  readJson,
  safeEqual,
  type CourierAdapter,
  type ParcelState,
} from "./types";

/**
 * Steadfast Courier (portal.packzy.com API v1).
 * Env: STEADFAST_API_KEY, STEADFAST_SECRET_KEY,
 *      STEADFAST_WEBHOOK_TOKEN (the Bearer token set as the callback auth in
 *      the Steadfast panel; callback URL /api/courier/webhooks/steadfast).
 */

const BASE = () => env("STEADFAST_API_BASE") || "https://portal.packzy.com/api/v1";

const STATE: Record<string, ParcelState> = {
  in_review: "booked",
  pending: "in_transit",
  hold: "hold",
  delivered_approval_pending: "delivered",
  delivered: "delivered",
  partial_delivered_approval_pending: "partial",
  partial_delivered: "partial",
  cancelled_approval_pending: "cancelled",
  cancelled: "cancelled",
  unknown_approval_pending: "unknown",
  unknown: "unknown",
};

const mapState = (raw: string): ParcelState => STATE[raw?.toLowerCase()] ?? "unknown";

async function call(path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE()}${path}`, {
    ...init,
    headers: {
      "Api-Key": env("STEADFAST_API_KEY"),
      "Secret-Key": env("STEADFAST_SECRET_KEY"),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(15000),
  });
  const json = await readJson(res);
  if (!res.ok || (typeof json.status === "number" && json.status >= 400)) {
    throw new CourierError(String(json.message ?? `Steadfast returned HTTP ${res.status}`), res.status);
  }
  return json;
}

export const steadfast: CourierAdapter = {
  code: "steadfast",
  label: "Steadfast",

  isConfigured: () => Boolean(env("STEADFAST_API_KEY") && env("STEADFAST_SECRET_KEY")),

  async book(input) {
    const json = await call("/create_order", {
      method: "POST",
      body: JSON.stringify({
        invoice: input.orderId,
        recipient_name: input.name.slice(0, 100),
        recipient_phone: input.phone,
        recipient_address: [input.address, input.thana, input.district].filter(Boolean).join(", ").slice(0, 250),
        cod_amount: Math.max(0, Math.round(input.codAmount)),
        note: input.note?.slice(0, 200) ?? "",
        item_description: input.description?.slice(0, 200) ?? "",
      }),
    });
    const c = (json.consignment ?? {}) as Record<string, unknown>;
    if (!c.consignment_id) throw new CourierError(String(json.message ?? "Steadfast did not return a consignment"));
    return {
      consignmentId: String(c.consignment_id),
      trackingCode: c.tracking_code ? String(c.tracking_code) : null,
      state: mapState(String(c.status ?? "in_review")),
      fee: null,
      raw: json,
    };
  },

  async status(consignmentId) {
    const json = await call(`/status_by_cid/${encodeURIComponent(consignmentId)}`);
    const raw = String(json.delivery_status ?? "unknown");
    return { state: mapState(raw), rawStatus: raw };
  },

  async parseWebhook(headers, rawBody) {
    const expected = env("STEADFAST_WEBHOOK_TOKEN");
    const got = (headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!safeEqual(got, expected)) throw new CourierAuthError();

    const body = JSON.parse(rawBody) as Record<string, unknown>;
    const rawStatus = String(body.status ?? body.delivery_status ?? "unknown");
    const isStatus = !body.notification_type || body.notification_type === "delivery_status";
    const state = isStatus ? mapState(rawStatus) : "in_transit";
    return {
      consignmentId: body.consignment_id != null ? String(body.consignment_id) : null,
      orderId: body.invoice != null ? String(body.invoice) : null,
      state,
      rawStatus: isStatus ? rawStatus : String(body.notification_type),
      codCollected: state === "delivered" || state === "partial" ? Number(body.cod_amount ?? 0) : null,
      fee: body.delivery_charge != null ? Number(body.delivery_charge) : null,
      message: body.tracking_message ? String(body.tracking_message) : null,
      raw: body,
    };
  },

  trackingUrl: ({ trackingCode }) => (trackingCode ? `https://steadfast.com.bd/t/${encodeURIComponent(trackingCode)}` : null),
};
