import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { normalizeBdPhone } from "@/lib/phone";
import { startOnlinePayment } from "@/lib/payments/online";
import { getGateway } from "@/lib/payments/gateway";
import { isServiceSupabaseConfigured } from "@/lib/supabase/service";
import { getServiceSupabase } from "@/lib/supabase/service";
import { isInsideDhaka, isValidLocation, parseDhakaOverride } from "@/lib/bd-geo";
import { verifyTurnstile } from "@/lib/turnstile";
import { gatherRiskSignals, hashIp, loadRiskSettings, scoreRisk, type RiskResult } from "@/lib/risk";
import { clientIp, cookieValue, sendCapiEvent } from "@/lib/tracking/capi";
import { notifyOrderEvent } from "@/lib/notifications";
import type {
  CheckoutItemPayload,
  CheckoutRequest,
  CheckoutResponse,
  ConfirmationStatus,
  PaymentPlan,
} from "@/types";

/**
 * POST /api/checkout
 *
 * The one place an order is created. The browser used to insert orders
 * and order_items itself, which meant no stock reservation and no
 * server-authoritative pricing; it now calls create_order_with_reservations().
 *
 * This route does four things and nothing else:
 *   1. shape-checks the payload
 *   2. resolves each line to a stock variant (server-side, fails safe)
 *   3. hands the whole thing to the RPC and translates its result
 *
 * It computes no money. Every figure in the response comes back from
 * the database, and the client is expected to render those numbers
 * rather than its own.
 */

/** Coupon/eligibility reason -> HTTP status + customer-facing message. */
const REJECTIONS: Record<string, { status: number; message: string }> = {
  coupon_not_found: { status: 400, message: "That coupon code does not exist." },
  coupon_inactive: { status: 400, message: "That coupon is not active." },
  coupon_not_started: { status: 400, message: "That coupon is not active yet." },
  coupon_expired: { status: 400, message: "That coupon has expired." },
  coupon_login_required: {
    status: 401,
    message: "Sign in to use this coupon code.",
  },
  coupon_wrong_group: {
    status: 403,
    message: "This coupon code is not available for your account.",
  },
  coupon_used_up: { status: 409, message: "This coupon has been fully redeemed." },
  coupon_user_limit_reached: {
    status: 409,
    message: "You have already used this coupon.",
  },
  coupon_min_order: {
    status: 422,
    message: "Your order does not meet the minimum for this coupon.",
  },
  coupon_no_eligible_products: {
    status: 422,
    message: "This coupon does not apply to anything in your bag.",
  },
  empty_order: { status: 400, message: "Your bag is empty." },
  invalid_quantity: { status: 400, message: "An item has an invalid quantity." },
  invalid_shipping_fee: { status: 400, message: "Invalid delivery charge." },
  // A variant with no stock row at all is a configuration fault on our side,
  // not a depleted product. It is reported as an internal error so it reaches
  // the store owner instead of the customer as a "sold out" that lost the sale.
  variant_unallocated: {
    status: 503,
    message: "This item is temporarily unavailable. Please try again shortly or call us to place your order.",
  },
  insufficient_stock: { status: 409, message: "An item just sold out." },
  inventory_not_allocatable: {
    status: 503,
    message: "This item is temporarily unavailable. Please try again shortly or call us to place your order.",
  },
  product_not_found: { status: 422, message: "An item in your bag no longer exists." },
};

function reasonOf(message: string): string {
  // RPC messages are either a bare code or "code:detail".
  const head = message.split(":")[0]?.trim() ?? message;
  return REJECTIONS[head] ? head : message.split(":")[0]?.trim() ?? "unknown";
}

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function fail(status: number, error: string, reason?: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ success: false, error, ...(reason ? { reason } : {}), ...extra }, { status });
}

export async function POST(request: Request) {
  let payload: CheckoutRequest;

  /*
   * Rate limited before the body is even parsed: each checkout holds stock
   * for 30 minutes, so an unthrottled loop could empty the catalogue.
   */
  const limit = checkRateLimit(request as NextRequest, "checkout");
  if (!limit.allowed) {
    return NextResponse.json(
      {
        success: false,
        error: "Too many orders placed in a short time. Please wait a moment and try again.",
        reason: "rate_limited",
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  try {
    payload = (await request.json()) as CheckoutRequest;
  } catch {
    return fail(400, "Invalid request body");
  }

  const name = str(payload?.customer_name, 120);
  // Stored as 01XXXXXXXXX: the phone number is how a customer is recognised
  // across guest orders, Google sign-in and shop sales.
  const rawPhone = str(payload?.customer_phone, 30);
  const phone = normalizeBdPhone(rawPhone) ?? "";
  const notes = str(payload?.notes, 500);
  const providerTxn = str(payload?.provider_txn_id, 100);
  const couponCode = str(payload?.coupon_code, 60);
  const rawItems = Array.isArray(payload?.items) ? payload.items : [];

  // Structured address (division / district / thana + house and road), or
  // the older single text box with a Dhaka/outside choice.
  const division = str(payload?.division, 60);
  const district = str(payload?.district, 60);
  const thana = str(payload?.thana, 80);
  const addressLine = str(payload?.address_line, 300);
  const structured = Boolean(district || thana);
  if (structured && !isValidLocation(division, district, thana)) {
    return fail(400, "Please choose your division, district and thana from the lists.", "invalid_location");
  }
  const address = structured
    ? [addressLine, thana, district].filter(Boolean).join(", ")
    : str(payload?.delivery_address, 500);

  if (!name || !rawPhone || !address || (structured && !addressLine)) {
    return fail(400, "Name, phone and delivery address are required");
  }
  if (!phone) {
    return fail(400, "Enter an 11-digit Bangladeshi mobile number, e.g. 01712345678.");
  }

  // Payment plan. The older payment_method values still work.
  const plan: PaymentPlan =
    payload?.payment_plan === "full" || payload?.payment_plan === "cod_advance" || payload?.payment_plan === "cod"
      ? payload.payment_plan
      : payload?.payment_method === "univapayment"
        ? "full"
        : "cod";
  const gatewayReady = getGateway("univapayment").isConfigured() && isServiceSupabaseConfigured();
  // Checked before the order is created, so a misconfigured gateway never
  // leaves an orphan order behind.
  if (plan !== "cod" && !gatewayReady) {
    return fail(503, "Online payment is not available right now. Please choose Cash on Delivery.", "gateway_unavailable");
  }
  const paymentMethod = plan === "full" ? "univapayment" : payload?.payment_method === "univapayment" ? "cod" : (payload?.payment_method ?? "cod");

  if (rawItems.length === 0) {
    return fail(400, "Your bag is empty");
  }
  const items: CheckoutItemPayload[] = [];
  for (const raw of rawItems) {
    const it = raw as Partial<CheckoutItemPayload>;
    const quantity = Number(it?.quantity);
    if (!it?.product_id || !Number.isInteger(quantity) || quantity <= 0) {
      return fail(400, "An item has an invalid quantity");
    }
    items.push({
      product_id: String(it.product_id),
      // Replaced below by the server-side resolver.
      variant_id: typeof it.variant_id === "string" ? it.variant_id : "",
      title: typeof it.title === "string" ? it.title : "",
      size: typeof it.size === "string" ? it.size : "",
      color: typeof it.color === "string" ? it.color : "",
      quantity,
      image: typeof it.image === "string" ? it.image : undefined,
    });
  }

  const headers = request.headers;
  const ip = clientIp(headers);
  const deviceId = str(payload?.device_id, 64).replace(/[^a-zA-Z0-9-]/g, "") || null;
  const sessionId = str(payload?.session_id, 64) || null;

  // Bot check (free, no puzzle). Skipped when Turnstile keys are not set.
  const turnstile = await verifyTurnstile(payload?.turnstile_token, ip);
  if (turnstile === "failed") {
    return fail(403, "We could not check that this order is from a real person. Please refresh the page and try again.", "bot_check_failed");
  }

  try {
    const cookieStore = await cookies();
    const supabase = createSupabaseServerClient({
      getAll: () => cookieStore.getAll(),
      setAll: () => {
        // Read-only here; the middleware refreshes the session.
      },
    });
    if (!supabase) return fail(500, "Service not configured");

    // The order's owner comes from the session, never from the payload.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const userId = user?.id ?? null;

    // Delivery zone from the thana (admin list or the built-in Dhaka city list).
    let insideDhaka = payload?.city !== "outside";
    if (structured) {
      const { data: settings } = await supabase.rpc("checkout_settings");
      const override = parseDhakaOverride((settings as { dhaka_inside_thanas?: string } | null)?.dhaka_inside_thanas);
      insideDhaka = isInsideDhaka(district, thana, override);
    }
    const cityLabel = insideDhaka ? "Dhaka Metro" : "Outside Dhaka";

    /*
     * Risk score, before the order exists, so a COD order that needs an
     * advance is turned around while the customer is still on the page.
     * Needs the service key (it reads other customers' orders); without it
     * every COD order simply goes to the call list.
     */
    const ipHash = await hashIp(ip);
    const riskOn = isServiceSupabaseConfigured();
    const riskSettings = riskOn ? await loadRiskSettings() : null;
    const signals = riskOn
      ? await gatherRiskSignals({
          phone,
          name,
          productIds: items.map((i) => i.product_id),
          ipHash,
          deviceId,
          signedIn: Boolean(userId),
          turnstile,
          orderValue: Number(payload?.expected_total) || 0,
          paysCod: plan === "cod",
        })
      : null;
    let risk: RiskResult | null = signals && riskSettings ? scoreRisk(signals, riskSettings) : null;

    if (plan === "cod" && risk?.advanceRequired && gatewayReady) {
      return fail(
        422,
        "For this order please pay the delivery charge now with bKash or Nagad. The rest is paid when the parcel arrives.",
        "advance_required",
        { risk_level: risk.level }
      );
    }

    // Resolve variants server-side; the browser's variant_id is ignored.
    const resolved = await Promise.all(
      items.map(async (it, index) => {
        const { data, error } = await supabase.rpc("resolve_order_variant", {
          p_product_id: it.product_id,
          p_size: it.size,
          p_color: it.color,
        });
        if (error) throw new Error(`variant_lookup_failed:${index}`);
        return typeof data === "string" ? data : null;
      })
    );
    const unresolvable = resolved.findIndex((v) => !v);
    if (unresolvable !== -1) {
      const bad = items[unresolvable];
      return fail(
        422,
        `We could not confirm the option for "${bad.title || bad.product_id}". Please choose a colour and size and try again.`
      );
    }
    const rpcItems = items.map((it, i) => ({ ...it, variant_id: resolved[i] as string }));

    // Money is computed by the RPC only (prices, coupon, delivery charge).
    const { data, error } = await supabase.rpc("create_order_with_reservations", {
      payload: {
        customer_name: name,
        customer_phone: phone,
        customer_email: payload.customer_email?.trim() || null,
        delivery_address: address,
        city: cityLabel,
        notes: notes || null,
        shipping_fee: 0,
        payment_method: paymentMethod,
        coupon_code: couponCode || null,
        items: rpcItems,
      },
    });

    if (error) {
      const reason = reasonOf(error.message);
      const mapped = REJECTIONS[reason];
      return fail(mapped?.status ?? 500, mapped?.message ?? "We could not place your order. Please try again.", reason);
    }

    const result = data as {
      order_id: string;
      subtotal: number;
      discount_total: number;
      coupon_discount_total: number;
      coupon_code: string | null;
      shipping_fee: number;
      total_amount: number;
    };
    const total = Number(result.total_amount);
    const shipping = Number(result.shipping_fee);
    const base: CheckoutResponse = {
      success: true,
      order_id: result.order_id,
      subtotal: Number(result.subtotal),
      discount_total: Number(result.discount_total),
      coupon_discount_total: Number(result.coupon_discount_total ?? 0),
      coupon_code: result.coupon_code ?? null,
      shipping_fee: shipping,
      total_amount: total,
    };

    // Re-score with the real total: the browser's estimate is not trusted
    // for the high-value rule.
    if (signals && riskSettings) {
      risk = scoreRisk({ ...signals, orderValue: total }, riskSettings);
    }

    // What happens to this order now.
    let effectivePlan: PaymentPlan = plan;
    if (plan === "cod" && risk?.advanceRequired && gatewayReady) effectivePlan = "cod_advance";
    let advance = 0;
    if (effectivePlan === "cod_advance") {
      const { data: settings } = await supabase.rpc("checkout_settings");
      const minAdvance = Number((settings as { cod_min_advance?: number } | null)?.cod_min_advance ?? 120);
      advance = Math.min(total, shipping > 0 ? shipping : minAdvance);
    } else if (effectivePlan === "full") {
      advance = total;
    }

    let confirmation: ConfirmationStatus;
    if (effectivePlan !== "cod") confirmation = "awaiting_payment";
    else if (risk && risk.level === "low") confirmation = "confirmed";
    else confirmation = "needs_call";

    // Extras the RPC does not know about; written with the service key.
    if (isServiceSupabaseConfigured()) {
      const attribution = payload?.attribution ?? {};
      const db = getServiceSupabase();
      const { error: extraErr } = await db
        .from("orders")
        .update({
          division: division || null,
          district: district || null,
          thana: thana || null,
          address_line: addressLine || null,
          payment_plan: effectivePlan,
          advance_amount: advance,
          risk_score: risk?.score ?? null,
          risk_level: risk?.level ?? null,
          risk_reasons: risk?.reasons ?? [],
          confirmation_status: confirmation,
          ...(confirmation === "confirmed"
            ? { status: "processing", confirmed_at: new Date().toISOString(), confirmed_via: "auto" }
            : {}),
          signed_in: Boolean(userId),
          client_ip_hash: ipHash,
          device_id: deviceId,
          utm_source: str(attribution.utm_source) || null,
          utm_medium: str(attribution.utm_medium) || null,
          utm_campaign: str(attribution.utm_campaign) || null,
          utm_content: str(attribution.utm_content) || null,
          utm_term: str(attribution.utm_term) || null,
          fbclid: str(attribution.fbclid, 300) || null,
          landing_page: str(attribution.landing_page, 300) || null,
          referrer: str(attribution.referrer, 300) || null,
        })
        .eq("id", result.order_id);
      if (extraErr) console.error("Order placed but its Phase 1 details could not be saved:", extraErr.message);

      if (sessionId) {
        await db
          .from("checkout_leads")
          .update({ status: "sold", order_id: result.order_id, updated_at: new Date().toISOString() })
          .eq("session_id", sessionId)
          .then(({ error: e }) => e && console.error("Lead could not be closed:", e.message));
      }
    }

    // Meta: a COD order with nothing paid is a Lead; paid ones send Purchase
    // when the payment completes. Same event_id as the browser pixel.
    if (effectivePlan === "cod") {
      sendCapiEvent({
        name: "Lead",
        eventId: `lead-${result.order_id}`,
        value: total,
        contentIds: items.map((i) => i.product_id),
        numItems: items.reduce((s, i) => s + i.quantity, 0),
        orderId: result.order_id,
        sourceUrl: headers.get("referer") ?? undefined,
        user: {
          phone,
          email: payload.customer_email,
          name,
          district,
          ip,
          userAgent: headers.get("user-agent"),
          fbc: cookieValue(headers, "_fbc"),
          fbp: cookieValue(headers, "_fbp"),
          externalId: phone,
        },
      }).catch(() => {});
      if (isServiceSupabaseConfigured()) {
        notifyOrderEvent(result.order_id, confirmation === "confirmed" ? "order_confirmed" : "order_placed").catch(
          (err) => console.error("Order notification failed:", err)
        );
      }
    }

    const extra = { payment_plan: effectivePlan, advance_amount: advance, confirmation_status: confirmation };

    if (effectivePlan !== "cod") {
      // The order exists and its stock is reserved; now send the customer to
      // pay. If starting the payment fails the order stays and staff follow up.
      if (effectivePlan === "cod_advance" && total > advance) {
        await recordCharge(supabase, result.order_id, userId, "cod", total - advance, null, "cod_balance");
      }
      try {
        const started = await startOnlinePayment({
          orderId: result.order_id,
          amount: advance,
          userId,
          covers: effectivePlan === "full" ? "full" : "delivery_charge",
          returnPath: `/order/${encodeURIComponent(result.order_id)}/confirmed`,
        });
        return NextResponse.json<CheckoutResponse>({
          ...base,
          ...extra,
          checkout_url: started.checkoutUrl,
          payment_id: started.paymentId,
        });
      } catch (err) {
        console.error("Order placed but the online payment could not start:", err);
        return NextResponse.json<CheckoutResponse>({
          ...base,
          ...extra,
          payment_error: "Your order is saved, but the payment page could not open. We will call you to confirm.",
        });
      }
    }

    // Cash on delivery: record the charge here (guests cannot call /api/payments).
    await recordCharge(supabase, result.order_id, userId, paymentMethod, total, providerTxn || null, "checkout");
    return NextResponse.json<CheckoutResponse>({ ...base, ...extra });
  } catch (error) {
    console.error("Checkout failed:", error);
    const isLookup = error instanceof Error && error.message.startsWith("variant_lookup_failed");
    return fail(
      isLookup ? 502 : 500,
      isLookup
        ? "We could not confirm the options in your bag. Please try again."
        : "We could not place your order. Please try again."
    );
  }
}

/**
 * The charge row for money collected offline (COD, or a manual wallet
 * transfer). A failure is logged, not thrown: the order is placed, and staff
 * can record the charge by hand from the payments page.
 */
async function recordCharge(
  supabase: NonNullable<ReturnType<typeof createSupabaseServerClient>>,
  orderId: string,
  userId: string | null,
  provider: string,
  amount: number,
  providerTxn: string | null,
  recordedBy: string
) {
  try {
    const { error } = await supabase.from("payments").insert({
      order_id: orderId,
      user_id: userId,
      type: "charge",
      provider,
      amount,
      provider_txn_id: providerTxn,
      status: "initiated",
      metadata: { recorded_by: recordedBy },
    });
    if (error) console.error("Order placed but the charge row could not be recorded:", error.message);
  } catch (err) {
    console.error("Order placed but recording the charge threw:", err);
  }
}
