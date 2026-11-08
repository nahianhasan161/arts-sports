import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { CheckCircle2, Package, CreditCard, Truck, Phone } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { formatTaka } from "@/lib/pricing";
import { TrustBadges } from "@/components/seo/TrustBadges";

/**
 * Order confirmation.
 *
 * This page exists because the confirmation used to be a boolean inside the
 * checkout component. A customer who reloaded after paying emptied their
 * cart, landed on "Your Bag is Empty", and had no way back to the order
 * reference they had just been shown — no bookmarkable link, no email, no
 * tracking.
 *
 * The order is read through get_order_confirmation(), a SECURITY DEFINER
 * function that returns a PII-free projection: the reference, its state, the
 * money and what was bought. No name, phone, email, street address or
 * customer notes. That matters because the URL is shareable and the lookup
 * is public, so the page must be safe to view by anyone holding the link.
 */

interface ConfirmedItem {
  title: string;
  size: string | null;
  color: string | null;
  quantity: number;
  unit_price: number;
  base_price: number;
  image: string | null;
}

interface OrderConfirmation {
  order_id: string;
  status: string;
  created_at: string;
  payment_method: string;
  city: string;
  subtotal: number;
  discount_total: number;
  coupon_code: string | null;
  coupon_discount_total: number;
  shipping_fee: number;
  total_amount: number;
  items: ConfirmedItem[];
}

/** A confirmation has never been indexed, and never should be. */
export const metadata: Metadata = {
  title: "Order Confirmed",
  robots: { index: false, follow: false },
};

const PAYMENT_LABELS: Record<string, string> = {
  cod: "Cash on Delivery",
  bkash: "bKash",
  nagad: "Nagad",
};

async function loadOrder(orderId: string): Promise<OrderConfirmation | null> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return null;

  const { data, error } = await supabase.rpc("get_order_confirmation", {
    p_order_id: orderId,
  });

  if (error || !data) return null;
  return data as OrderConfirmation;
}

export default async function OrderConfirmedPage(
  props: {
    params: Promise<{ id: string }>;
  }
) {
  const params = await props.params;
  const order = await loadOrder(params.id);

  // An unknown or mistyped reference is a 404, not an empty screen.
  if (!order) notFound();

  const paymentLabel = PAYMENT_LABELS[order.payment_method] ?? order.payment_method;
  const placedOn = order.created_at
    ? new Date(order.created_at).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <div className="w-full bg-surface">
      <div className="max-w-3xl mx-auto px-space-base py-space-2xl">
        {/* Success header */}
        <div className="text-center mb-space-xl">
          <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          <h1 className="font-display text-2xl sm:text-3xl uppercase font-bold text-primary mb-2">
            Thank you — your order is placed
          </h1>
          <p className="text-sm text-text-muted max-w-lg mx-auto">
            We have received your order and reserved your items. Keep this
            reference to quote if you need to contact us.
          </p>

          <div className="mt-5 inline-flex flex-col items-center gap-1 px-6 py-4 bg-surface-card border border-border-light rounded-xl">
            <span className="text-[11px] font-display uppercase tracking-wider text-text-muted font-bold">
              Order Reference
            </span>
            <span className="font-display text-xl sm:text-2xl font-bold text-primary tracking-wide">
              {order.order_id}
            </span>
            {placedOn && (
              <span className="text-[11px] text-text-muted">Placed on {placedOn}</span>
            )}
          </div>
        </div>

        {/* Status */}
        <div className="bg-surface-card rounded-xl border border-border-light shadow-sm p-space-base mb-space-base">
          <div className="flex items-center gap-2 mb-3">
            <Package className="w-4 h-4 text-primary" />
            <h2 className="font-display text-sm uppercase tracking-wider font-bold text-primary">
              Order Status
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-bold uppercase">
              {order.status || "pending"}
            </span>
            <p className="text-xs text-text-muted">
              Our team will call you to confirm the order before dispatch.
            </p>
          </div>
        </div>

        {/* Items */}
        <div className="bg-surface-card rounded-xl border border-border-light shadow-sm p-space-base mb-space-base">
          <h2 className="font-display text-sm uppercase tracking-wider font-bold text-primary mb-3">
            Your Items ({order.items?.length ?? 0})
          </h2>
          <div className="divide-y divide-border-light">
            {(order.items ?? []).map((item, i) => (
              <div key={`${item.title}-${i}`} className="py-2.5 flex items-center gap-3">
                {item.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.image}
                    alt={item.title}
                    className="w-12 h-14 rounded object-cover border border-border-light shrink-0"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="text-xs font-semibold text-on-surface line-clamp-1">{item.title}</h3>
                  <p className="text-[11px] text-text-muted">
                    {[item.size, item.color].filter(Boolean).join(" • ")} · Qty {item.quantity}
                  </p>
                </div>
                <span className="text-xs font-bold text-primary shrink-0">
                  {formatTaka((item.unit_price ?? 0) * item.quantity)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Payment summary */}
        <div className="bg-surface-card rounded-xl border border-border-light shadow-sm p-space-base mb-space-base">
          <h2 className="font-display text-sm uppercase tracking-wider font-bold text-primary mb-3">
            Payment Summary
          </h2>
          <div className="flex flex-col gap-2 text-xs">
            <div className="flex justify-between text-text-muted">
              <span>Merchandise subtotal</span>
              <span className="text-on-surface font-semibold">{formatTaka(order.subtotal ?? 0)}</span>
            </div>
            {order.coupon_discount_total > 0 && (
              <div className="flex justify-between text-emerald-700 font-semibold">
                <span>Coupon{order.coupon_code ? ` (${order.coupon_code})` : ""} discount</span>
                <span>-{formatTaka(order.coupon_discount_total)}</span>
              </div>
            )}
            <div className="flex justify-between text-text-muted">
              <span>
                Delivery charge{order.city ? ` · ${order.city}` : ""}
              </span>
              <span className={order.shipping_fee === 0 ? "text-emerald-700 font-bold" : "text-on-surface font-semibold"}>
                {order.shipping_fee === 0 ? "FREE" : formatTaka(order.shipping_fee)}
              </span>
            </div>
            <div className="border-t border-border-light pt-2 flex justify-between text-base font-bold text-primary">
              <span>Total payable</span>
              <span className="font-display text-lg">{formatTaka(order.total_amount ?? 0)}</span>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-1.5 text-[11px] text-text-muted">
            <span className="flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5" />
              Payment method: <strong className="text-on-surface">{paymentLabel}</strong>
            </span>
            <span className="flex items-center gap-1.5">
              <Truck className="w-3.5 h-3.5" />
              Dhaka metro in 24–48 hrs, all 64 districts within 3–5 days.
            </span>
          </div>
        </div>

        {/* Support. A phone number that answers questions about this order,
            since we have not yet built an order-tracking page. */}
        <div className="rounded-xl border border-border-light bg-surface-card p-space-base mb-space-base">
          <h2 className="font-display text-sm uppercase tracking-wider font-bold text-primary mb-2">
            Need anything changed?
          </h2>
          <p className="text-xs text-text-muted mb-3">
            To change your address, cancel, or ask about delivery, quote your
            order reference when you contact us.
          </p>
          <a
            href="tel:+8809677666888"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg text-xs font-bold font-display uppercase tracking-wider hover:bg-primary-container transition-colors"
          >
            <Phone className="w-4 h-4" />
            +880 9677 666 888
          </a>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/shop"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-primary text-white font-display uppercase tracking-wider text-xs font-bold rounded-lg hover:bg-primary-container transition-colors shadow-sm"
          >
            Continue Shopping
          </Link>
          <Link
            href="/returns"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 border border-border-light bg-surface-card text-primary font-display uppercase tracking-wider text-xs font-bold rounded-lg hover:bg-surface-subtle transition-colors"
          >
            Return &amp; Exchange Policy
          </Link>
        </div>
      </div>

      <TrustBadges />
    </div>
  );
}
