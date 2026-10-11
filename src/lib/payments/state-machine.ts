import type { PaymentStatus, PaymentType } from "@/types";

const stateTransitions: Record<PaymentStatus, PaymentStatus[]> = {
  initiated: ["successful", "failed", "cancelled"],
  successful: ["refunded"],
  failed: ["cancelled"],
  cancelled: [],
  refunded: [],
};

export function getValidPaymentTransitions(current: PaymentStatus): PaymentStatus[] {
  return stateTransitions[current] ?? [];
}

export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus): boolean {
  if (from === to) return true;
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
  return status === "cancelled" || status === "refunded";
}

export function isChargeableStatus(status: PaymentStatus): boolean {
  return status === "initiated" || status === "successful";
}

export function isValidPaymentType(type: PaymentType): boolean {
  return ["charge", "refund", "chargeback"].includes(type);
}

export function calculateNetPayment(amount: number, type: PaymentType): number {
  return type === "refund" || type === "chargeback" ? -amount : amount;
}