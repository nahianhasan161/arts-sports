import type { ReturnStatus } from "@/types";

const stateTransitions: Record<ReturnStatus, ReturnStatus[]> = {
  requested: ["approved", "rejected"],
  approved: ["received"],
  received: ["completed"],
  completed: [],
  rejected: [],
};

export function getValidReturnTransitions(current: ReturnStatus): ReturnStatus[] {
  return stateTransitions[current] ?? [];
}

export function canTransitionReturn(from: ReturnStatus, to: ReturnStatus): boolean {
  if (from === to) return true;
  return stateTransitions[from]?.includes(to) ?? false;
}

export function validateReturnTransition(from: ReturnStatus, to: ReturnStatus): void {
  if (!canTransitionReturn(from, to)) {
    const valid = stateTransitions[from]?.join(", ") ?? "none";
    throw new Error(
      `Cannot transition return from '${from}' to '${to}'. Valid transitions from '${from}': ${valid}`
    );
  }
}

export function isReturnTerminal(status: ReturnStatus): boolean {
  return status === "completed" || status === "rejected";
}