import "server-only";
import { getServiceSupabase } from "@/lib/supabase/service";

/**
 * Fake-order risk score (0-100) from free signals only: no OTP, no paid
 * fraud service. Roadmap 1.2.
 *
 *   low    (<= risk_low_max)   COD order is confirmed by itself
 *   medium                     goes to the "call to confirm" list
 *   high   (>= risk_high_min)  COD only with the delivery charge paid first
 *
 * The thresholds and the high-value line are admin settings.
 */

export interface RiskSignals {
  blacklisted: boolean;
  deliveredOrders: number;
  returnedOrders: number;
  cancelledOrders: number;
  priorOrders: number;
  signedIn: boolean;
  turnstile: "passed" | "failed" | "skipped";
  recentFromSameSource: number;
  duplicateRecent: boolean;
  orderValue: number;
  paysCod: boolean;
  nameLooksFake: boolean;
  /** Courier delivery history, when a courier API gives it for free. */
  courierSuccessRate?: number | null;
}

export interface RiskSettings {
  lowMax: number;
  highMin: number;
  codHighValue: number;
}

export interface RiskResult {
  score: number;
  level: "low" | "medium" | "high";
  reasons: string[];
  /** COD without anything paid first is not allowed. */
  advanceRequired: boolean;
}

export const DEFAULT_RISK_SETTINGS: RiskSettings = { lowMax: 30, highMin: 70, codHighValue: 5000 };

export function scoreRisk(s: RiskSignals, settings: RiskSettings = DEFAULT_RISK_SETTINGS): RiskResult {
  const reasons: string[] = [];
  let score = 25;

  if (s.blacklisted) {
    return { score: 100, level: "high", reasons: ["blacklisted"], advanceRequired: true };
  }

  if (s.returnedOrders > 0) {
    score += Math.min(60, s.returnedOrders * 30);
    reasons.push(`returned_orders:${s.returnedOrders}`);
  }
  if (s.cancelledOrders >= 2) {
    score += 10;
    reasons.push(`cancelled_orders:${s.cancelledOrders}`);
  }
  if (s.deliveredOrders >= 3) {
    score -= 40;
    reasons.push(`delivered_orders:${s.deliveredOrders}`);
  } else if (s.deliveredOrders >= 1) {
    score -= 25;
    reasons.push(`delivered_orders:${s.deliveredOrders}`);
  }
  if (s.priorOrders === 0) {
    score += 10;
    reasons.push("new_customer");
  }
  if (s.signedIn) {
    score -= 15;
    reasons.push("signed_in");
  }
  if (s.turnstile === "failed") {
    score += 40;
    reasons.push("bot_check_failed");
  }
  if (s.recentFromSameSource >= 3) {
    score += 30;
    reasons.push(`many_orders_same_device:${s.recentFromSameSource}`);
  } else if (s.recentFromSameSource >= 1) {
    score += 10;
    reasons.push(`recent_order_same_device:${s.recentFromSameSource}`);
  }
  if (s.duplicateRecent) {
    score += 20;
    reasons.push("duplicate_recent_order");
  }
  if (s.nameLooksFake) {
    score += 10;
    reasons.push("name_looks_fake");
  }
  if (typeof s.courierSuccessRate === "number") {
    if (s.courierSuccessRate < 0.5) {
      score += 30;
      reasons.push(`courier_success:${Math.round(s.courierSuccessRate * 100)}%`);
    } else if (s.courierSuccessRate >= 0.8) {
      score -= 15;
      reasons.push(`courier_success:${Math.round(s.courierSuccessRate * 100)}%`);
    }
  }

  score = Math.max(0, Math.min(100, score));
  const level = score >= settings.highMin ? "high" : score <= settings.lowMax ? "low" : "medium";

  const highValueNew = s.paysCod && s.deliveredOrders === 0 && s.orderValue > settings.codHighValue;
  if (highValueNew) reasons.push("high_value_cod_new_customer");

  return { score, level, reasons, advanceRequired: level === "high" || highValueNew };
}

export function nameLooksFake(name: string): boolean {
  const n = name.trim();
  return n.length < 3 || /\d/.test(n) || /^(.)\1+$/i.test(n.replace(/\s/g, "")) || /^(test|asdf|abc|xxx)/i.test(n);
}

async function hashText(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes).slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Stored instead of the raw IP. */
export function hashIp(ip: string | null): Promise<string | null> {
  return ip ? hashText(`ip:${ip}`) : Promise.resolve(null);
}

export async function loadRiskSettings(): Promise<RiskSettings> {
  const db = getServiceSupabase();
  const { data } = await db
    .from("app_settings")
    .select("key, value")
    .in("key", ["risk_low_max", "risk_high_min", "cod_high_value"]);
  const get = (k: string, d: number) => {
    const v = Number(data?.find((r) => r.key === k)?.value);
    return Number.isFinite(v) && v > 0 ? v : d;
  };
  return {
    lowMax: get("risk_low_max", DEFAULT_RISK_SETTINGS.lowMax),
    highMin: get("risk_high_min", DEFAULT_RISK_SETTINGS.highMin),
    codHighValue: get("cod_high_value", DEFAULT_RISK_SETTINGS.codHighValue),
  };
}

/** Reads this phone's own history and recent orders from the same device or IP. */
export async function gatherRiskSignals(input: {
  phone: string;
  name: string;
  productIds: string[];
  ipHash: string | null;
  deviceId: string | null;
  signedIn: boolean;
  turnstile: RiskSignals["turnstile"];
  orderValue: number;
  paysCod: boolean;
}): Promise<RiskSignals> {
  const db = getServiceSupabase();
  const since1h = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [customer, history, recentPhone] = await Promise.all([
    db.from("customers").select("is_blacklisted").eq("phone", input.phone).maybeSingle(),
    db.from("orders").select("status, courier_status").eq("customer_phone", input.phone).limit(200),
    db
      .from("orders")
      .select("id, order_items(product_id)")
      .eq("customer_phone", input.phone)
      .gte("created_at", since24h)
      .neq("status", "cancelled"),
  ]);

  const orders = history.data ?? [];
  const delivered = orders.filter((o) => o.status === "delivered").length;
  const returned = orders.filter((o) => o.status === "returned" || /^(returned|cancelled)$/.test(o.courier_status ?? "")).length;
  const cancelled = orders.filter((o) => o.status === "cancelled").length;

  const recentItems = (recentPhone.data ?? []).flatMap(
    (o) => ((o.order_items ?? []) as { product_id: string }[]).map((i) => i.product_id)
  );
  const duplicateRecent = input.productIds.some((id) => recentItems.includes(id));

  let recentFromSameSource = 0;
  const sourceFilters = [
    input.ipHash ? `client_ip_hash.eq.${input.ipHash}` : null,
    input.deviceId ? `device_id.eq.${input.deviceId.replace(/[^a-zA-Z0-9-]/g, "")}` : null,
  ].filter(Boolean);
  if (sourceFilters.length) {
    const { count } = await db
      .from("orders")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since1h)
      .or(sourceFilters.join(","));
    recentFromSameSource = count ?? 0;
  }

  return {
    blacklisted: Boolean(customer.data?.is_blacklisted),
    deliveredOrders: delivered,
    returnedOrders: returned,
    cancelledOrders: cancelled,
    priorOrders: orders.length,
    signedIn: input.signedIn,
    turnstile: input.turnstile,
    recentFromSameSource,
    duplicateRecent,
    orderValue: input.orderValue,
    paysCod: input.paysCod,
    nameLooksFake: nameLooksFake(input.name),
    courierSuccessRate: null,
  };
}
