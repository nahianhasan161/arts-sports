import type { NextRequest } from "next/server";

/**
 * In-memory rate limiting for the endpoints that cost money or permit abuse.
 *
 * There was no rate limit anywhere on the site. `/api/checkout` can be called
 * repeatedly to hammer stock reservations, the sign-in page can be used to try
 * passwords, and `/api/coupons/validate` can be used to enumerate valid codes.
 *
 * Deliberately in-memory rather than Redis. A serverless deployment runs many
 * short-lived instances, so the counts are approximate -- which is fine,
 * because this is a brake on abuse, not a quota. The alternative was to reach
 * for a managed store the project does not have, and leave the endpoints open
 * while that was built.
 *
 * The limits are generous by design: this is a shop with a handful of
 * simultaneous shoppers, and a limit that blocks a legitimate burst is worse
 * than one that lets a determined abuser through slowly.
 */

interface Bucket {
  count: number;
  /** Epoch ms at which this bucket resets. */
  resetAt: number;
}

/** key -> bucket. Keys are namespaced by the caller so one endpoint cannot exhaust another's budget. */
const buckets = new Map<string, Bucket>();

/** Cap the map so a flood of distinct keys cannot grow it without bound. */
const MAX_KEYS = 20000;

export interface RateLimitRule {
  /** Requests allowed per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export const RATE_LIMITS: Record<string, RateLimitRule> = {
  // The one that creates orders and holds stock for 30 minutes.
  checkout: { limit: 10, windowMs: 60_000 },
  // Credential attempts: five a minute is far above any real user, and stalls a
  // password-spraying script.
  signIn: { limit: 5, windowMs: 60_000 },
  signUp: { limit: 3, windowMs: 60_000 },
  // Cheap, but enumerable.
  couponValidate: { limit: 30, windowMs: 60_000 },
  // Refunds are admin-only, but an admin session is worth protecting too: a
  // stuck client retrying a refund must not be able to fire a hundred of them.
  refund: { limit: 30, windowMs: 60_000 },
  // Lead capture fires as the customer types; generous, but not unlimited.
  lead: { limit: 30, windowMs: 60_000 },
  // Order lookup by order number + phone: slow enough to stop guessing.
  track: { limit: 10, windowMs: 60_000 },
  // Review photos and review/question text from signed-in shoppers.
  reviewUpload: { limit: 12, windowMs: 60_000 },
  reviewSubmit: { limit: 6, windowMs: 60_000 },
  // Custom jersey: design files (up to 15 MB each), new requests, and actions on the order page.
  customUpload: { limit: 15, windowMs: 60_000 },
  customSubmit: { limit: 4, windowMs: 60_000 },
  customAction: { limit: 30, windowMs: 60_000 },
};

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until the bucket resets, for the Retry-After header. */
  retryAfter: number;
}

function bucketKey(rule: string, identity: string): string {
  return `${rule}:${identity}`;
}

function prune(now: number): void {
  if (buckets.size < MAX_KEYS) return;
  // Array.from rather than a for..of over the Map directly: this project's
  // tsconfig target cannot iterate a Map without downlevelIteration.
  for (const key of Array.from(buckets.keys())) {
    const bucket = buckets.get(key);
    if (bucket && bucket.resetAt <= now) buckets.delete(key);
  }
}

/**
 * The counter, usable from either side.
 *
 * Split out from checkRateLimit because the client needs a gate too -- the
 * sign-in form, so the button cannot be spammed while the server is still
 * deciding -- and a client component cannot import a module that types itself
 * against `next/server`. The identity is supplied by the caller: the server
 * passes the request's address, the browser passes nothing and is counted as a
 * single shared bucket, which is the right answer for one tab.
 */
export function consume(rule: keyof typeof RATE_LIMITS, identity = "local"): RateLimitResult {
  const config = RATE_LIMITS[rule];
  const now = Date.now();
  const key = bucketKey(rule, identity);

  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    prune(now);
    buckets.set(key, { count: 1, resetAt: now + config.windowMs });
    return { allowed: true, remaining: config.limit - 1, retryAfter: 0 };
  }

  existing.count += 1;

  if (existing.count > config.limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  return {
    allowed: true,
    remaining: config.limit - existing.count,
    retryAfter: 0,
  };
}

/**
 * Who is making the request.
 *
 * `x-forwarded-for` is spoofable, which is one more reason this is a brake and
 * not a gate.
 */
function identityOf(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  return ip;
}

/** Server entry point: takes an identity from the request and consumes a token. */
export function checkRateLimit(
  request: NextRequest,
  rule: keyof typeof RATE_LIMITS
): RateLimitResult {
  return consume(rule, identityOf(request));
}

/** Test seam: clears every bucket. */
export function resetRateLimits(): void {
  buckets.clear();
}
