/**
 * The contract every online payment gateway implements.
 *
 * UnivaPayment is the first one. Card payments will come later, either
 * through UnivaPayment or a different gateway; adding one means writing a
 * new file that implements this interface and registering it in ./index.ts.
 * Checkout, COD delivery-charge collection, custom-jersey advances and the
 * POS all call these three methods and never a gateway directly.
 */

/** Status as the gateway reports it. Mapped to payments.status in the database. */
export type GatewayStatus =
  | "initiated"
  | "pending"
  | "review"
  | "completed"
  | "rejected"
  | "expired"
  | "refunded";

export interface CreatePaymentInput {
  /** Amount in taka, e.g. 1060 or 60.5. */
  amount: number;
  /** Our order id, shown on the gateway's dashboard. */
  orderId: string;
  /** Unique per attempt. Our payments.id is used, so a retried call cannot charge twice. */
  idempotencyKey: string;
  /** Where the customer lands after paying. */
  returnUrl: string;
  metadata?: Record<string, unknown>;
}

export interface GatewayPayment {
  id: string;
  status: GatewayStatus;
  amount: number;
  checkoutUrl: string | null;
  /** The wallet's transaction id (bKash/Nagad TrxID), once known. */
  trxId: string | null;
  /** bkash, nagad, ... once known. */
  provider: string | null;
  reviewReason: string | null;
  orderId: string | null;
  raw: unknown;
}

export interface WebhookEvent {
  eventId: string | null;
  event: string;
  /** The gateway's payment id the event is about. */
  paymentId: string | null;
  raw: unknown;
}

export interface PaymentGateway {
  readonly code: string;
  isConfigured(): boolean;
  createPayment(input: CreatePaymentInput): Promise<GatewayPayment>;
  getPayment(id: string): Promise<GatewayPayment>;
  /**
   * Verifies the signature and parses the body. Throws WebhookVerificationError
   * when the request did not come from the gateway.
   */
  handleWebhook(headers: Headers, rawBody: string): Promise<WebhookEvent>;
}

export class WebhookVerificationError extends Error {}

export class GatewayError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null = null
  ) {
    super(message);
  }
}
