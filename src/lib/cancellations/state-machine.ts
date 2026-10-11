import type { CancellationStatus } from "@/types";

const stateTransitions: Record<CancellationStatus, CancellationStatus[]> = {
  pending: ["approved", "rejected", "cancelled"],
  approved: ["executed", "cancelled"],
  rejected: [],
  executed: [],
  cancelled: [],
};

export function getValidCancellationTransitions(
  current: CancellationStatus
): CancellationStatus[] {
  return stateTransitions[current] ?? [];
}

export function canTransitionCancellation(
  from: CancellationStatus,
  to: CancellationStatus
): boolean {
  if (from === to) return true;
  return stateTransitions[from]?.includes(to) ?? false;
}

export function validateCancellationTransition(
  from: CancellationStatus,
  to: CancellationStatus
): void {
  if (!canTransitionCancellation(from, to)) {
    const valid = stateTransitions[from]?.join(", ") ?? "none";
    throw new Error(
      `Cannot transition cancellation from '${from}' to '${to}'. Valid transitions from '${from}': ${valid}`
    );
  }
}

export function isCancellationTerminal(status: CancellationStatus): boolean {
  return status === "executed" || status === "rejected" || status === "cancelled";
}

export function canCancelCancellation(status: CancellationStatus): boolean {
  return status === "pending" || status === "approved";
}

export function isExecutionEligible(status: CancellationStatus): boolean {
  return status === "approved";
}