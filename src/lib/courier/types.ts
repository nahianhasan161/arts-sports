/** Courier adapters (Steadfast, Pathao; RedX later): one interface each. */

export type CourierCode = "steadfast" | "pathao";

/** Our own parcel states, whatever the courier calls them. */
export type ParcelState =
  | "booked"
  | "picked"
  | "in_transit"
  | "delivered"
  | "partial"
  | "returned"
  | "cancelled"
  | "hold"
  | "unknown";

export interface BookParcelInput {
  orderId: string;
  name: string;
  phone: string;
  address: string;
  district?: string | null;
  thana?: string | null;
  codAmount: number;
  itemCount: number;
  description?: string;
  note?: string | null;
}

export interface BookedParcel {
  consignmentId: string;
  trackingCode: string | null;
  state: ParcelState;
  fee: number | null;
  raw: unknown;
}

export interface ParcelUpdate {
  consignmentId: string | null;
  orderId: string | null;
  state: ParcelState;
  rawStatus: string;
  codCollected: number | null;
  fee: number | null;
  message: string | null;
  raw: unknown;
}

export interface CourierAdapter {
  readonly code: CourierCode;
  readonly label: string;
  isConfigured(): boolean;
  book(input: BookParcelInput): Promise<BookedParcel>;
  status(consignmentId: string): Promise<{ state: ParcelState; rawStatus: string }>;
  /** Throws CourierAuthError when the request is not really from the courier. */
  parseWebhook(headers: Headers, rawBody: string): Promise<ParcelUpdate>;
  trackingUrl(parcel: { consignmentId: string; trackingCode: string | null; phone: string }): string | null;
  /** Headers the courier expects on the webhook reply, if any. */
  webhookReplyHeaders?(): Record<string, string>;
}

export class CourierError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "CourierError";
  }
}

export class CourierAuthError extends Error {
  constructor(message = "Webhook not authorised") {
    super(message);
    this.name = "CourierAuthError";
  }
}

export const env = (name: string) => process.env[name]?.trim() ?? "";

/** Constant-time string compare for webhook tokens. */
export function safeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function readJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  try {
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    return { message: text.slice(0, 300) };
  }
}
