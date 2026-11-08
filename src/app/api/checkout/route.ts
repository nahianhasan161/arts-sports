import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import type { CheckoutItemPayload, CheckoutRequest, CheckoutResponse } from "@/types";

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

export async function POST(request: Request) {
  let payload: CheckoutRequest;

  /*
   * Rate limited before the body is even parsed.
   *
   * A checkout request reserves stock for 30 minutes, so ten of them in a
   * minute can drain a catalogue's availability with orders that never pay.
   * Nothing limited this before, and the reservations are released by nothing
   * either -- there is still no expiry job -- so an unthrottled loop is a slow
   * way to take the store offline.
   */
  const limit = checkRateLimit(request as NextRequest, "checkout");
  if (!limit.allowed) {
    return NextResponse.json(
      {
        success: false,
        error: "Too many orders placed in a short time. Please wait a moment and try again.",
        reason: "rate_limited",
      },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfter) },
      }
    );
  }

  try {
    payload = (await request.json()) as CheckoutRequest;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const name = typeof payload?.customer_name === "string" ? payload.customer_name.trim() : "";
  const phone = typeof payload?.customer_phone === "string" ? payload.customer_phone.trim() : "";
  const address = typeof payload?.delivery_address === "string" ? payload.delivery_address.trim() : "";
  const notes = typeof payload?.notes === "string" ? payload.notes.trim().slice(0, 500) : "";
  // The wallet reference for a bKash or Nagad payment. Trimmed and capped
  // rather than validated against a pattern: each provider has its own shape,
  // and rejecting a valid reference is worse than storing a slightly odd one.
  const providerTxn =
    typeof payload?.provider_txn_id === "string" ? payload.provider_txn_id.trim().slice(0, 100) : "";
  const shippingFee = Number(payload?.shipping_fee ?? 0);
  const couponCode = typeof payload?.coupon_code === "string" ? payload.coupon_code.trim() : "";
  const rawItems = Array.isArray(payload?.items) ? payload.items : [];

  if (!name || !phone || !address) {
    return NextResponse.json(
      { success: false, error: "Name, phone and delivery address are required" },
      { status: 400 }
    );
  }
  // The delivery zone is not checked here: an empty or unknown value is
  // treated as Dhaka by the RPC, which is the cheaper of the two rates, so a
  // missing city can never overcharge a customer.
  if (!Number.isFinite(shippingFee) || shippingFee < 0) {
    return NextResponse.json(
      { success: false, error: "Invalid delivery charge" },
      { status: 400 }
    );
  }
  if (rawItems.length === 0) {
    return NextResponse.json<CheckoutResponse>(
      { success: false, order_id: "", error: "Your bag is empty" } as CheckoutResponse,
      { status: 400 }
    );
  }

  const items: CheckoutItemPayload[] = [];
  for (const raw of rawItems) {
    const it = raw as Partial<CheckoutItemPayload>;
    const quantity = Number(it?.quantity);
    if (!it?.product_id || !Number.isInteger(quantity) || quantity <= 0) {
      return NextResponse.json(
        { success: false, error: "An item has an invalid quantity" },
        { status: 400 }
      );
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

  try {
    const cookieStore = await cookies();
    const supabase = createSupabaseServerClient({
      getAll: () => cookieStore.getAll(),
      setAll: () => {
        // Read-only here; the middleware refreshes the session.
      },
    });

    if (!supabase) {
      return NextResponse.json({ success: false, error: "Service not configured" }, { status: 500 });
    }

    /*
     * The order's owner: the signed-in customer, or null for a guest.
     *
     * create_order_with_reservations() derives its own user_id from
     * auth.uid(), so this is read rather than accepted from the payload -- a
     * client that posted someone else's id would otherwise have the order
     * recorded against the wrong account. It exists to attach the charge row
     * below, and it matches whatever the order RPC stored.
     */
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const userId = user?.id ?? null;

    // Resolve variants server-side. The browser-supplied variant_id is
    // ignored entirely: it is untrusted input, and a wrong value would
    // reserve the wrong stock.
    const resolved = await Promise.all(
      items.map(async (it, index) => {
        const { data, error } = await supabase.rpc("resolve_order_variant", {
          p_product_id: it.product_id,
          p_size: it.size,
          p_color: it.color,
        });
        if (error) {
          throw new Error(`variant_lookup_failed:${index}`);
        }
        return typeof data === "string" ? data : null;
      })
    );

    const unresolvable = resolved.findIndex((v) => !v);
    if (unresolvable !== -1) {
      const bad = items[unresolvable];
      return NextResponse.json(
        {
          success: false,
          error: `We could not confirm the option for "${bad.title || bad.product_id}". Please choose a colour and size and try again.`,
        },
        { status: 422 }
      );
    }

    const rpcItems = items.map((it, i) => ({ ...it, variant_id: resolved[i] as string }));

    const { data, error } = await supabase.rpc("create_order_with_reservations", {
      payload: {
        customer_name: name,
        customer_phone: phone,
        customer_email: payload.customer_email?.trim() || null,
        delivery_address: address,
        city: payload.city === "outside" ? "Outside Dhaka" : "Dhaka Metro",
        // The client still reports its zone so the RPC can charge the right
        // rate, but the fee itself is derived inside the RPC from the
        // authoritative subtotal. The value sent here is deliberately not
        // read by the function: it used to be taken as-is, which let a
        // crafted request set both the delivery charge and the total.
        notes: notes || null,
        shipping_fee: shippingFee,
        payment_method: payload.payment_method ?? "cod",
        coupon_code: couponCode || null,
        items: rpcItems,
      },
    });

    if (error) {
      const reason = reasonOf(error.message);
      const mapped = REJECTIONS[reason];
      return NextResponse.json(
        {
          success: false,
          error: mapped?.message ?? "We could not place your order. Please try again.",
          reason,
        },
        { status: mapped?.status ?? 500 }
      );
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

    /*
     * Record the charge, here and not by a second request from the browser.
     *
     * The client used to POST /api/payments after the order was created. That
     * route requires a signed-in user, so for the majority of orders --
     * guest checkout, which is how most of a COD store is bought -- the charge
     * was never recorded at all, and the order stood with no payment row
     * behind it. The payments table allows an insert from any role, so this
     * route writes it directly, with the same user_id the order carries: the
     * signed-in customer's, or null for a guest.
     *
     * A failure here is logged and not thrown. The order is already placed and
     * paid for in the customer's hands; losing the charge row because a
     * second insert failed would be a worse trade than an admin recording it
     * by hand from the payments page.
     */
    try {
      const { error: payErr } = await supabase.from("payments").insert({
        order_id: result.order_id,
        user_id: userId,
        type: "charge",
        provider: payload.payment_method ?? "cod",
        amount: Number(result.total_amount),
        provider_txn_id: providerTxn || null,
        status: "initiated",
        metadata: { recorded_by: "checkout" },
      });
      if (payErr) {
        console.error("Order placed but the charge row could not be recorded:", payErr.message);
      }
    } catch (err) {
      console.error("Order placed but recording the charge threw:", err);
    }

    return NextResponse.json<CheckoutResponse>({
      success: true,
      order_id: result.order_id,
      subtotal: Number(result.subtotal),
      discount_total: Number(result.discount_total),
      coupon_discount_total: Number(result.coupon_discount_total ?? 0),
      coupon_code: result.coupon_code ?? null,
      shipping_fee: Number(result.shipping_fee),
      total_amount: Number(result.total_amount),
    });
  } catch (error) {
    console.error("Checkout failed:", error);
    const isLookup =
      error instanceof Error && error.message.startsWith("variant_lookup_failed");
    return NextResponse.json(
      {
        success: false,
        error: isLookup
          ? "We could not confirm the options in your bag. Please try again."
          : "We could not place your order. Please try again.",
      },
      { status: isLookup ? 502 : 500 }
    );
  }
}
