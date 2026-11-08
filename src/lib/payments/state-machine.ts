import type { PaymentStatus, PaymentType, PaymentPurpose } from "@/types";

/**
 * Payment state machine.
 *
 * The defect this fixes: `successful` had exactly one onward edge, to
 * `refunded`, and `refunded` was terminal. So the first partial refund -- even
 * ৳50 of a ৳1,060 charge -- marked the entire payment "refunded", with no way
 * to express the remaining ৳1,010, and no way to take a second refund. The
 * state machine has no notion of "partly given back".
 *
 * `partially_refunded` is that state. It is re-entrant: a charge moves through
 * it once per refund until the balance reaches zero, and only then becomes
 * fully `refunded`.
 *
 * These edges are what the application checks, but the status on the row is
 * DERIVED by a database trigger from the refunds themselves. Hand-setting it
 * was how three code paths ended up writing three different things; the
 * trigger makes the stored value a function of the rows it summarises.
 */

const stateTransitions: Record<PaymentStatus, PaymentStatus[]> = {
  initiated: ["successful", "failed", "cancelled"],
  successful: ["partially_refunded", "refunded", "charged_back"],
  // Re-entrant by design: another partial refund is the same transition.
  partially_refunded: ["partially_refunded", "refunded", "charged_back"],
  failed: ["cancelled"],
  cancelled: [],
  refunded: [],
  charged_back: [],
};

export function getValidPaymentTransitions(current: PaymentStatus): PaymentStatus[] {
  return stateTransitions[current] ?? [];
}

export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus): boolean {
  if (from === to) {
    // Only a re-entrant state allows staying in it. Everything else is a
    // terminal state, where a second identical write would be a no-op that
    // hides a client retry.
    return to === "partially_refunded";
  }
  return stateTransitions[from]?.includes(to) ?? false;
}

export function validatePaymentTransition(from: PaymentStatus, to: PaymentStatus): void {
  if (!canTransitionPayment(from, to)) {
    const valid = stateTransitions[from]?.join(", ") ?? "none";
    throw new Error(
      `Cannot transition payment from '${from}' to '${to}'. Valid transitions from '${from}': ${valid}`
    );
  }
}

export function isPaymentTerminal(status: PaymentStatus): boolean {
  // partially_refunded is NOT terminal, which is the whole point of it.
  return (
    status === "cancelled" ||
    status === "refunded" ||
    status === "charged_back" ||
    status === "failed"
  );
}

export function isChargeableStatus(status: PaymentStatus): boolean {
  // A partially refunded charge is still money the customer paid, so it still
  // counts as chargeable against its remaining balance.
  return status === "initiated" || status === "successful" || status === "partially_refunded";
}

export function isValidPaymentType(type: PaymentType): boolean {
  return ["charge", "refund", "chargeback"].includes(type);
}

export function isValidPaymentPurpose(purpose: PaymentPurpose): boolean {
  return [
    "checkout",
    "retroactive",
    "reconciliation",
    "adjustment",
    "dispute_resolution",
    "cod_settlement",
  ].includes(purpose);
}

/**
 * What a payment's status should be, given how much of it has been refunded.
 *
 * This mirrors the database trigger so the two cannot disagree: the trigger
 * writes the row, this lets a caller predict it -- for example to render a
 * refund button's disabled state before the request is made.
 *
 * @param refundedTotal total refunded against this charge, in currency units
 * @param originalAmount the charge's own amount
 */
export function deriveRefundStatus(refundedTotal: number, originalAmount: number): PaymentStatus {
  if (refundedTotal <= 0) return "successful";
  if (refundedTotal >= originalAmount) return "refunded";
  return "partially_refunded";
}

/**
 * The signed effect of a payment on the order's position.
 *
 * Kept, and now actually used, because every caller was hand-rolling this
 * expression: a refund is money out and so is a chargeback, everything else is
 * money in. A charge that failed is not money in -- treating it as such is how
 * a store ends up reporting a paid order for a payment that never settled.
 *
 * This must agree with the order_financials view, which computes the same number
 * in SQL, and the /api/orders/:id/financials endpoint asserts that it does. It
 * originally counted only `status === 'successful'`, while the view counted every
 * post-settlement status -- so the two disagreed on the very first refund, and
 * the agreement check is what surfaced it.
 */
export function calculateNetPayment(amount: number, type: PaymentType, status: PaymentStatus): number {
  // Every post-settlement state is money that arrived. `partially_refunded` and
  // `refunded` are what a charge becomes after a refund, and the customer's
  // money genuinely came in; counting only `successful` would make a refunded
  // charge look unpaid.
  const settled =
    status === "successful" ||
    status === "partially_refunded" ||
    status === "refunded" ||
    status === "charged_back";
  if (!settled) return 0;

  if (type === "refund" || type === "chargeback") return -amount;
  return amount;
}
