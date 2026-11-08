import "server-only";
import {
  GatewayError,
  WebhookVerificationError,
  type CreatePaymentInput,
  type GatewayPayment,
  type GatewayStatus,
  type PaymentGateway,
  type WebhookEvent,
} from "./types";

/**
 * UnivaPayment (https://github.com/nahianhasan161/univapayment-web).
 *
 * It reads the bKash/Nagad SMS arriving on the merchant's own phone and
 * matches them to payments, so the money lands directly in Arts Sports'
 * wallet number. It never sends money back: a refund here only flips the
 * status, and the cash goes back by hand from the shop's wallet.
 *
 * Env (server only):
 *   UNIVAPAYMENT_API_BASE        e.g. https://univapayment.com (no trailing /api)
 *   UNIVAPAYMENT_API_KEY         test or live key; the key decides the mode
 *   UNIVAPAYMENT_WEBHOOK_SECRET  signing secret from the dashboard's webhook page
 */

const KNOWN_STATUSES: GatewayStatus[] = [
  "initiated",
  "pending",
  "review",
  "completed",
  "rejected",
  "expired",
  "refunded",
];

/** Reject webhooks signed more than this long ago, so a captured one cannot be replayed later. */
const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

function env(name: string): string {
  return process.env[name]?.trim() ?? "";
}

function baseUrl(): string {
  return env("UNIVAPAYMENT_API_BASE").replace(/\/+$/, "").replace(/\/api(\/v1)?$/, "");
}

type ApiPayment = {
  id: string;
  order_id: string | null;
  status: string;
  amount: string;
  provider: string | null;
  trx_id: string | null;
  review_reason: string | null;
  checkout_url: string | null;
};

function toGatewayPayment(p: ApiPayment): GatewayPayment {
  const status = KNOWN_STATUSES.includes(p.status as GatewayStatus)
    ? (p.status as GatewayStatus)
    : "pending";
  return {
    id: p.id,
    status,
    amount: Number(p.amount),
    checkoutUrl: p.checkout_url ?? null,
    trxId: p.trx_id ?? null,
    provider: p.provider ?? null,
    reviewReason: p.review_reason ?? null,
    orderId: p.order_id ?? null,
    raw: p,
  };
}

async function call<T>(path: string, init: RequestInit & { idempotencyKey?: string } = {}): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${env("UNIVAPAYMENT_API_KEY")}`,
    Accept: "application/json",
  };
  if (init.body) headers["Content-Type"] = "application/json";
  if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;

  const response = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers,
    signal: AbortSignal.timeout(15000),
  });
  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Non-JSON error page; reported below with the status.
  }
  if (!response.ok) {
    const err = (json as { error?: { code?: string; message?: string } } | null)?.error;
    throw new GatewayError(
      err?.message ?? `UnivaPayment returned HTTP ${response.status}`,
      response.status,
      err?.code ?? null
    );
  }
  return json as T;
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) return null;
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/**
 * Checks `x-signature: t=<unix>,v1=<hex HMAC-SHA256(secret, "<t>.<body>")>`.
 * Web Crypto's verify() compares in constant time.
 */
export async function verifyUnivaSignature(
  header: string | null,
  rawBody: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000)
): Promise<boolean> {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(
    header.split(",").map((kv) => {
      const i = kv.indexOf("=");
      return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()];
    })
  );
  const timestamp = Number(parts.t);
  const signature = hexToBytes(parts.v1 ?? "");
  if (!Number.isFinite(timestamp) || !signature) return false;
  if (Math.abs(nowSeconds - timestamp) > WEBHOOK_TOLERANCE_SECONDS) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  return crypto.subtle.verify("HMAC", key, signature, encoder.encode(`${parts.t}.${rawBody}`));
}

export const univapayment: PaymentGateway = {
  code: "univapayment",

  isConfigured() {
    return Boolean(baseUrl() && env("UNIVAPAYMENT_API_KEY"));
  },

  async createPayment(input: CreatePaymentInput) {
    const payment = await call<ApiPayment>("/api/v1/payments", {
      method: "POST",
      idempotencyKey: input.idempotencyKey,
      body: JSON.stringify({
        // UnivaPayment wants "500.00"-style strings.
        amount: input.amount.toFixed(2),
        currency: "BDT",
        order_id: input.orderId,
        return_url: input.returnUrl,
        metadata: input.metadata ?? {},
      }),
    });
    return toGatewayPayment(payment);
  },

  async getPayment(id: string) {
    const payment = await call<ApiPayment>(`/api/v1/payments/${encodeURIComponent(id)}`);
    return toGatewayPayment(payment);
  },

  async handleWebhook(headers: Headers, rawBody: string): Promise<WebhookEvent> {
    const ok = await verifyUnivaSignature(
      headers.get("x-signature"),
      rawBody,
      env("UNIVAPAYMENT_WEBHOOK_SECRET")
    );
    if (!ok) throw new WebhookVerificationError("Invalid or expired webhook signature");

    let body: { event_id?: string; event?: string; data?: { id?: string } };
    try {
      body = JSON.parse(rawBody);
    } catch {
      throw new WebhookVerificationError("Webhook body is not JSON");
    }
    return {
      eventId: body.event_id ?? null,
      event: body.event ?? "unknown",
      paymentId: typeof body.data?.id === "string" ? body.data.id : null,
      raw: body,
    };
  },
};
