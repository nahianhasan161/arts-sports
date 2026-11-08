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
 * Pathao Courier merchant API (Aladdin).
 * Env: PATHAO_API_BASE (sandbox: https://courier-api-sandbox.pathao.com),
 *      PATHAO_CLIENT_ID, PATHAO_CLIENT_SECRET, PATHAO_USERNAME, PATHAO_PASSWORD,
 *      PATHAO_STORE_ID,
 *      PATHAO_WEBHOOK_SECRET (sent by Pathao in X-PATHAO-Signature),
 *      PATHAO_WEBHOOK_INTEGRATION_SECRET (the value Pathao's webhook page asks
 *      us to echo back in a response header to verify the URL).
 * Recipient city and zone are left out: Pathao fills them from the address.
 */

const BASE = () => env("PATHAO_API_BASE") || "https://api-hermes.pathao.com";

const STATE: Record<string, ParcelState> = {
  pending: "booked",
  "order.created": "booked",
  "order.updated": "booked",
  "pickup requested": "booked",
  "order.pickup-requested": "booked",
  "assigned for pickup": "booked",
  "order.assigned-for-pickup": "booked",
  picked: "picked",
  "order.picked": "picked",
  "order.pickup-failed": "hold",
  "order.pickup-cancelled": "cancelled",
  "at the sorting hub": "in_transit",
  "order.at-the-sorting-hub": "in_transit",
  "in transit": "in_transit",
  "order.in-transit": "in_transit",
  "received at last mile hub": "in_transit",
  "order.received-at-last-mile-hub": "in_transit",
  "assigned for delivery": "in_transit",
  "order.assigned-for-delivery": "in_transit",
  delivered: "delivered",
  "order.delivered": "delivered",
  "partial delivery": "partial",
  "order.partial-delivery": "partial",
  return: "returned",
  returned: "returned",
  "order.returned": "returned",
  "order.paid-return": "returned",
  "delivery failed": "hold",
  "order.delivery-failed": "hold",
  "on hold": "hold",
  "order.on-hold": "hold",
  "order.exchanged": "delivered",
};

const mapState = (raw: string): ParcelState => STATE[raw?.toLowerCase()] ?? "unknown";

let token: { value: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (token && token.expiresAt > Date.now() + 60_000) return token.value;
  const res = await fetch(`${BASE()}/aladdin/api/v1/issue-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: env("PATHAO_CLIENT_ID"),
      client_secret: env("PATHAO_CLIENT_SECRET"),
      username: env("PATHAO_USERNAME"),
      password: env("PATHAO_PASSWORD"),
      grant_type: "password",
    }),
    signal: AbortSignal.timeout(15000),
  });
  const json = await readJson(res);
  if (!res.ok || !json.access_token) {
    throw new CourierError(String(json.message ?? `Pathao sign-in failed (HTTP ${res.status})`), res.status);
  }
  token = { value: String(json.access_token), expiresAt: Date.now() + Number(json.expires_in ?? 3600) * 1000 };
  return token.value;
}

async function call(path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(15000),
  });
  const json = await readJson(res);
  if (!res.ok) {
    const errors = json.errors ? ` ${JSON.stringify(json.errors).slice(0, 200)}` : "";
    throw new CourierError(`${String(json.message ?? `Pathao returned HTTP ${res.status}`)}${errors}`, res.status);
  }
  return (json.data ?? {}) as Record<string, unknown>;
}

export const pathao: CourierAdapter = {
  code: "pathao",
  label: "Pathao",

  isConfigured: () =>
    Boolean(
      env("PATHAO_CLIENT_ID") &&
        env("PATHAO_CLIENT_SECRET") &&
        env("PATHAO_USERNAME") &&
        env("PATHAO_PASSWORD") &&
        env("PATHAO_STORE_ID")
    ),

  async book(input) {
    const data = await call("/aladdin/api/v1/orders", {
      method: "POST",
      body: JSON.stringify({
        store_id: Number(env("PATHAO_STORE_ID")),
        merchant_order_id: input.orderId,
        recipient_name: input.name.slice(0, 100),
        recipient_phone: input.phone,
        recipient_address: [input.address, input.thana, input.district].filter(Boolean).join(", ").slice(0, 220),
        delivery_type: 48,
        item_type: 2,
        special_instruction: input.note?.slice(0, 200) ?? "",
        item_quantity: Math.max(1, input.itemCount),
        item_weight: 0.5,
        amount_to_collect: Math.max(0, Math.round(input.codAmount)),
        item_description: input.description?.slice(0, 200) ?? "",
      }),
    });
    if (!data.consignment_id) throw new CourierError("Pathao did not return a consignment");
    return {
      consignmentId: String(data.consignment_id),
      trackingCode: String(data.consignment_id),
      state: mapState(String(data.order_status ?? "pending")),
      fee: data.delivery_fee != null ? Number(data.delivery_fee) : null,
      raw: data,
    };
  },

  async status(consignmentId) {
    const data = await call(`/aladdin/api/v1/orders/${encodeURIComponent(consignmentId)}/info`);
    const raw = String(data.order_status ?? data.order_status_slug ?? "unknown");
    return { state: mapState(raw), rawStatus: raw };
  },

  async parseWebhook(headers, rawBody) {
    const got = headers.get("x-pathao-signature") ?? "";
    if (!safeEqual(got, env("PATHAO_WEBHOOK_SECRET"))) throw new CourierAuthError();

    const body = JSON.parse(rawBody) as Record<string, unknown>;
    const rawStatus = String(body.event ?? body.order_status ?? "unknown");
    const state = mapState(rawStatus);
    return {
      consignmentId: body.consignment_id != null ? String(body.consignment_id) : null,
      orderId: body.merchant_order_id != null ? String(body.merchant_order_id) : null,
      state,
      rawStatus,
      codCollected:
        state === "delivered" || state === "partial" ? Number(body.collected_amount ?? body.amount_to_collect ?? 0) : null,
      fee: body.delivery_fee != null ? Number(body.delivery_fee) : null,
      message: body.reason ? String(body.reason) : null,
      raw: body,
    };
  },

  trackingUrl: ({ consignmentId, phone }) =>
    `https://merchant.pathao.com/tracking?consignment_id=${encodeURIComponent(consignmentId)}&phone=${encodeURIComponent(phone)}`,

  webhookReplyHeaders(): Record<string, string> {
    const secret = env("PATHAO_WEBHOOK_INTEGRATION_SECRET");
    return secret ? { "X-Pathao-Merchant-Webhook-Integration-Secret": secret } : {};
  },
};
