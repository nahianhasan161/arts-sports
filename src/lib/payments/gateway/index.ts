import "server-only";
import type { PaymentGateway } from "./types";
import { univapayment } from "./univapayment";

/** Registered gateways. Add a card gateway here later; nothing else changes. */
const gateways: Record<string, PaymentGateway> = {
  [univapayment.code]: univapayment,
};

export const DEFAULT_GATEWAY = univapayment.code;

export function getGateway(code: string = DEFAULT_GATEWAY): PaymentGateway {
  const gateway = gateways[code];
  if (!gateway) throw new Error(`Unknown payment gateway: ${code}`);
  return gateway;
}

export * from "./types";
