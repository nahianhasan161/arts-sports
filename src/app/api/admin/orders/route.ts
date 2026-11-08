import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient, isDynamicServerUsage } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { cookies } from "next/headers";
import { requireAdmin, handleAdminError } from "@/lib/admin/auth";
import type { Order } from "@/types";

async function getSupabase() {
  const cookieStore = cookies();
  return createSupabaseServerClient({
    getAll: () => cookieStore.getAll(),
    setAll: (cookiesToSet) => {
      try {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      } catch {
        // Cookie writes handled by middleware
      }
    },
  });
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (error) {
    return handleAdminError(error);
  }

  try {
    const supabase = await getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "Service not configured" }, { status: 500 });
    }

    const url = new URL(request.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10)));
    const offset = (page - 1) * limit;
    const statusFilter = url.searchParams.get("status");

    let query = supabase
      .from("orders")
      .select("*, order_items(*)", { count: "exact" })
      .order("created_at", { ascending: false });

    if (statusFilter) {
      query = query.eq("status", statusFilter);
    }

    const { data, error, count } = await query.range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      data: data as Order[],
      pagination: { page, limit, total: count ?? 0 },
    });
  } catch (error) {
    return handleAdminError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (error) {
    return handleAdminError(error);
  }

  try {
    const supabase = await getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "Service not configured" }, { status: 500 });
    }

    const body = await request.json();
    const { id, status } = body;

    if (!id) {
      return NextResponse.json({ error: "Order id is required" }, { status: 400 });
    }

    const validStatuses = ["pending", "processing", "shipped", "delivered"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const { error } = await supabase.from("orders").update({ status }).eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleAdminError(error);
  }
}

interface ManualLine {
  product_id: string;
  variant_id?: string;
  title: string;
  size: string;
  color: string;
  quantity: number;
  /** Overrides the product price. Requires a reason. */
  unit_price?: number;
  /** Why the price differs from the catalogue. */
  price_reason?: string;
}

export async function POST(request: NextRequest) {
  let admin: { user: { id: string; email?: string } };
  try {
    admin = await requireAdmin();
  } catch (error) {
    return handleAdminError(error);
  }

  // Same reasoning as the refund route: creating an order moves money and
  // stock, and a stuck client retrying should not be able to fire a hundred.
  const limit = checkRateLimit(request, "refund");
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many orders created in a short time.", reason: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  try {
    const supabase = await getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "Service not configured" }, { status: 500 });
    }

    const body = await request.json();

    const customerName = typeof body?.customer_name === "string" ? body.customer_name.trim() : "";
    const customerPhone = typeof body?.customer_phone === "string" ? body.customer_phone.trim() : "";
    const deliveryAddress =
      typeof body?.delivery_address === "string" ? body.delivery_address.trim() : "";
    const customerEmail =
      typeof body?.customer_email === "string" && body.customer_email.trim()
        ? body.customer_email.trim()
        : null;
    const city = body?.city === "outside" ? "Outside Dhaka" : "Dhaka Metro";
    const notes = typeof body?.notes === "string" ? body.notes.trim() : null;
    const provider = typeof body?.payment_method === "string" ? body.payment_method : "cod";
    const amountPaid = Number(body?.amount_paid ?? 0);
    const transactionRef =
      typeof body?.transaction_ref === "string" && body.transaction_ref.trim()
        ? body.transaction_ref.trim()
        : null;
    const lines: ManualLine[] = Array.isArray(body?.items) ? body.items : [];

    if (!customerName || !customerPhone || !deliveryAddress) {
      return NextResponse.json(
        { error: "customer_name, customer_phone and delivery_address are required" },
        { status: 400 }
      );
    }
    if (lines.length === 0) {
      return NextResponse.json({ error: "At least one item is required." }, { status: 400 });
    }
    if (!["cod", "bkash", "nagad"].includes(provider)) {
      return NextResponse.json(
        { error: "payment_method must be one of: cod, bkash, nagad" },
        { status: 400 }
      );
    }

    /*
     * Resolve every line against the products table.
     *
     * Price comes from the catalogue unless the operator explicitly overrides it
     * with a reason, which is the only way a hand-built order can charge
     * something the storefront would not. An override without a reason is
     * refused rather than silently accepted: a discounted phone order with no
     * note is indistinguishable later from a pricing bug.
     */
    const resolved: {
      product_id: string;
      variant_id: string | null;
      title: string;
      size: string;
      color: string;
      quantity: number;
      unit_price: number;
      base_price: number;
    }[] = [];

    for (const line of lines) {
      const quantity = Number(line?.quantity);
      if (!line?.product_id || !Number.isInteger(quantity) || quantity <= 0) {
        return NextResponse.json(
          { error: "Each line needs a product_id and a positive quantity." },
          { status: 400 }
        );
      }

      const { data: product, error: productError } = await supabase
        .from("products")
        .select("id, title, price, original_price, status")
        .eq("id", line.product_id)
        .maybeSingle();

      if (productError) {
        return NextResponse.json({ error: productError.message }, { status: 500 });
      }
      if (!product) {
        return NextResponse.json(
          { error: `Product ${line.product_id} could not be found.` },
          { status: 404 }
        );
      }
      if (product.status !== "published") {
        return NextResponse.json(
          { error: `"${product.title}" is not published, so it cannot be ordered.` },
          { status: 409 }
        );
      }

      const cataloguePrice = Number(product.price);
      let unitPrice = cataloguePrice;

      if (line.unit_price !== undefined && line.unit_price !== null) {
        const override = Number(line.unit_price);
        if (!Number.isFinite(override) || override < 0) {
          return NextResponse.json(
            { error: "An overridden unit_price must be zero or more." },
            { status: 400 }
          );
        }
        if (override !== cataloguePrice && !line.price_reason?.trim()) {
          return NextResponse.json(
            {
              error: `"${product.title}" is priced at ${cataloguePrice} in the catalogue. Give a price_reason to charge ${override}.`,
              reason: "price_override_without_reason",
            },
            { status: 400 }
          );
        }
        unitPrice = override;
      }

      // The variant, when one is named. Resolved rather than trusted, so a
      // browser-posted id cannot attach a line to a variant of another product.
      let variantId: string | null = null;
      if (line.variant_id) {
        const { data: variant } = await supabase
          .from("product_variants")
          .select("id")
          .eq("id", line.variant_id)
          .eq("product_id", line.product_id)
          .maybeSingle();
        variantId = variant?.id ?? null;
      }

      resolved.push({
        product_id: product.id,
        variant_id: variantId,
        title: line.title?.trim() || product.title,
        size: line.size?.trim() || "",
        color: line.color?.trim() || "",
        quantity,
        unit_price: unitPrice,
        base_price: cataloguePrice,
      });
    }

    const subtotal = Math.round(
      resolved.reduce((sum, l) => sum + l.unit_price * l.quantity, 0) * 100
    ) / 100;

    // The delivery rule, the same one the storefront derives inside its RPC.
    const FREE_THRESHOLD = 1500;
    const shippingFee =
      subtotal >= FREE_THRESHOLD || subtotal === 0 ? 0 : city === "Outside Dhaka" ? 120 : 60;
    const totalAmount = Math.round((subtotal + shippingFee) * 100) / 100;

    if (!Number.isFinite(amountPaid) || amountPaid < 0) {
      return NextResponse.json({ error: "amount_paid must be zero or more." }, { status: 400 });
    }
    if (amountPaid > totalAmount) {
      return NextResponse.json(
        {
          error: "amount_paid cannot exceed the order total.",
          detail: `total ${totalAmount.toFixed(2)}, offered ${amountPaid.toFixed(2)}`,
        },
        { status: 409 }
      );
    }

    const orderId = "ORD-" + Math.random().toString(36).slice(2, 12).toUpperCase();

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        id: orderId,
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_email: customerEmail,
        delivery_address: deliveryAddress,
        city,
        subtotal,
        discount_total: 0,
        shipping_fee: shippingFee,
        total_amount: totalAmount,
        payment_method: provider,
        status: "pending",
        notes: notes ?? null,
        user_id: null,
      })
      .select()
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: orderError?.message ?? "Could not create the order" }, { status: 500 });
    }

    const itemRows = resolved.map((l) => ({
      order_id: orderId,
      product_id: l.product_id,
      variant_id: l.variant_id,
      title: l.title,
      size: l.size,
      color: l.color,
      quantity: l.quantity,
      unit_price: l.unit_price,
      base_price: l.base_price,
    }));

    const { error: itemsError } = await supabase.from("order_items").insert(itemRows);
    if (itemsError) {
      // The order is unwound with its items, so a partial order cannot stand.
      // postgREST's cascade does not reach an order_items row whose insert
      // failed, so this is explicit rather than relied upon.
      await supabase.from("orders").delete().eq("id", orderId);
      return NextResponse.json({ error: itemsError.message }, { status: 500 });
    }

    /*
     * The charge, when the operator says money was taken.
     *
     * Recorded as 'retrospective' with recorded_by set, which is exactly the
     * case that purpose and column exist for: money that arrived outside the
     * checkout flow. A zero amount records nothing, which is the honest
     * representation of an unpaid cash-on-delivery order.
     */
    let payment: { id: string; amount: number } | null = null;
    if (amountPaid > 0) {
      const { data: charge, error: chargeError } = await supabase
        .from("payments")
        .insert({
          order_id: orderId,
          user_id: null,
          type: "charge",
          provider,
          amount: amountPaid,
          status: "successful",
          // 'retroactive' is the constraint's word for money that arrived
          // outside the checkout flow, and is also the default the
          // retrospective endpoint uses. An earlier draft wrote
          // 'retrospective' here, which the payments_purpose_check rejects --
          // so the order was created and then stood with no charge at all.
          purpose: "retroactive",
          provider_txn_id: transactionRef,
          recorded_by: admin.user.id,
          metadata: {
            created_by: admin.user.email ?? null,
            note: "Order created by an administrator, outside the storefront checkout.",
          },
        })
        .select("id, amount")
        .single();

      if (chargeError) {
        console.error("Manual order created but the charge row failed:", chargeError.message);
      } else {
        payment = charge;
      }
    }

    return NextResponse.json(
      {
        data: {
          order_id: orderId,
          subtotal,
          shipping_fee: shippingFee,
          total_amount: totalAmount,
          amount_paid: payment ? Number(payment.amount) : 0,
          outstanding: Math.round((totalAmount - (payment ? Number(payment.amount) : 0)) * 100) / 100,
          payment_id: payment?.id ?? null,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (isDynamicServerUsage(error)) {
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
    console.error("Unexpected manual order creation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
