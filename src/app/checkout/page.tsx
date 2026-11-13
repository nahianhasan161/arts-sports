"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, ArrowLeft, Check, Loader2, Lock, MapPin, ShieldCheck, Tag, Truck } from "lucide-react";
import { useCartStore } from "@/lib/store/cart-store";
import { useAuth } from "@/components/auth/AuthProvider";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { FreeDeliveryBar } from "@/components/checkout/FreeDeliveryBar";
import { AddressPicker, EMPTY_ADDRESS, type AddressValue } from "@/components/checkout/AddressPicker";
import { Turnstile, TURNSTILE_ENABLED } from "@/components/checkout/Turnstile";
import { GoogleOneTap } from "@/components/checkout/GoogleOneTap";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useCheckoutSettings } from "@/lib/checkout-settings";
import { formatTaka } from "@/lib/pricing";
import { deliveryWindow, isInsideDhaka, parseDhakaOverride } from "@/lib/bd-geo";
import { getAttribution, getDeviceId } from "@/lib/tracking/attribution";
import { trackEvent } from "@/lib/tracking/events";
import { openPaymentPopup } from "@/lib/payments/popup";
import type { CartItem, PaymentPlan } from "@/types";

/**
 * One-page checkout (roadmap Phase 1.1).
 *
 * Facebook ad -> product -> "Buy now" -> here. Everything is on one page:
 * sign in with Google or continue as a guest, phone, address from
 * division/district/thana lists, and one of three payment plans. The phone
 * number is saved as a lead the moment it is valid, so staff can call
 * people who stop before ordering.
 *
 * The browser computes nothing it charges: totals come from the order RPC,
 * the coupon from /api/coupons/validate, and the fees shown are the same
 * admin settings the RPC reads.
 */

const ONLINE_ENABLED = process.env.NEXT_PUBLIC_UNIVAPAYMENT_ENABLED === "true";
const BD_MOBILE = /^(?:\+?880|0)1[3-9]\d{8}$/;
const normalisePhone = (raw: string) => raw.replace(/[\s-]/g, "");

type ManualMethod = "cod" | "bkash" | "nagad";

const inputCls =
  "w-full h-10 px-3 rounded-lg border border-border-light bg-surface-card focus:outline-none focus:ring-1 focus:ring-primary text-sm";

function newSessionId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now());
}

function CheckoutInner() {
  const router = useRouter();
  const search = useSearchParams();
  const buyNowMode = search.get("mode") === "buynow";
  const [mounted, setMounted] = useState(false);
  const { items: cartItems, buyNowItem, clearCart, clearBuyNow } = useCartStore();
  const { user, configured: authConfigured } = useAuth();

  const items: CartItem[] = useMemo(
    () => (buyNowMode && buyNowItem ? [buyNowItem] : cartItems),
    [buyNowMode, buyNowItem, cartItems]
  );

  const settings = useCheckoutSettings();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState<AddressValue>(EMPTY_ADDRESS);
  const [savedAddress, setSavedAddress] = useState<AddressValue | null>(null);
  const [plan, setPlan] = useState<PaymentPlan>(ONLINE_ENABLED ? "cod_advance" : "cod");
  const [manualMethod, setManualMethod] = useState<ManualMethod>("cod");
  const [transactionId, setTransactionId] = useState("");
  const [notes, setNotes] = useState("");
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileReset, setTurnstileReset] = useState(0);
  const [placing, setPlacing] = useState(false);
  // Set while the bKash / Nagad popup is open, after the cart is cleared.
  const [payingOrder, setPayingOrder] = useState<string | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [advanceNotice, setAdvanceNotice] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const sessionId = useRef<string>("");
  const initiated = useRef(false);

  useEffect(() => {
    // The bag lives in localStorage, so it is only known after hydration.
    setMounted(true);
    try {
      sessionId.current = window.sessionStorage.getItem("as_checkout_session") ?? newSessionId();
      window.sessionStorage.setItem("as_checkout_session", sessionId.current);
    } catch {
      sessionId.current = newSessionId();
    }
  }, []);

  // Signed in: fill name and email, and offer the last delivery address.
  useEffect(() => {
    if (!user) return;
    const meta = user.user_metadata ?? {};
    setName((n) => n || (typeof meta.full_name === "string" ? meta.full_name : ""));
    setEmail((e) => e || user.email || "");
    const supabase = getSupabaseBrowserClient();
    supabase
      ?.from("orders")
      .select("customer_phone, division, district, thana, address_line")
      .eq("user_id", user.id)
      .not("district", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setPhone((p) => p || data.customer_phone || "");
        setSavedAddress({
          division: data.division ?? "",
          district: data.district ?? "",
          thana: data.thana ?? "",
          line: data.address_line ?? "",
        });
      });
  }, [user]);

  const subtotal = mounted ? items.reduce((s, i) => s + i.price * i.quantity, 0) : 0;
  const discountedSubtotal = Math.max(0, subtotal - couponDiscount);
  const override = parseDhakaOverride(settings.dhaka_inside_thanas);
  const zoneKnown = Boolean(address.district && address.thana);
  const insideDhaka = zoneKnown ? isInsideDhaka(address.district, address.thana, override) : true;
  const freeDelivery = discountedSubtotal >= settings.free_delivery_over || subtotal === 0;
  const shippingFee = freeDelivery ? 0 : insideDhaka ? settings.delivery_fee_dhaka : settings.delivery_fee_outside;
  const grandTotal = discountedSubtotal + shippingFee;
  const advance = Math.min(grandTotal, shippingFee > 0 ? shippingFee : settings.cod_min_advance);
  const window_ = zoneKnown ? deliveryWindow(insideDhaka) : null;
  const taka = formatTaka;

  const eventItems = useMemo(
    () => items.map((i) => ({ id: i.productId, name: i.title, price: i.price, quantity: i.quantity, variant: [i.size, i.color].filter(Boolean).join(" / ") })),
    [items]
  );

  useEffect(() => {
    if (!mounted || initiated.current || items.length === 0) return;
    initiated.current = true;
    trackEvent("InitiateCheckout", { value: subtotal, items: eventItems });
  }, [mounted, items.length, subtotal, eventItems]);

  // Lead capture: once the phone is valid, save what we have (debounced).
  const phoneOk = BD_MOBILE.test(normalisePhone(phone));
  useEffect(() => {
    if (!mounted || !phoneOk || items.length === 0 || !sessionId.current) return;
    const timer = setTimeout(() => {
      void fetch("/api/checkout/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          session_id: sessionId.current,
          phone: normalisePhone(phone),
          name: name.trim(),
          email: email.trim(),
          address,
          subtotal,
          attribution: getAttribution() ?? {},
          items: items.map((i) => ({ product_id: i.productId, title: i.title, size: i.size, color: i.color, quantity: i.quantity, price: i.price })),
        }),
      }).catch(() => {});
    }, 1200);
    return () => clearTimeout(timer);
  }, [mounted, phoneOk, phone, name, email, address, subtotal, items]);

  const choosePlan = (next: PaymentPlan) => {
    setPlan(next);
    trackEvent("AddPaymentInfo", { value: grandTotal, items: eventItems, paymentType: next });
  };

  const quoteCoupon = useCallback(
    async (code: string) => {
      const trimmed = code.trim().toUpperCase();
      if (!trimmed) {
        setAppliedCoupon(null);
        setCouponDiscount(0);
        setCouponError(null);
        return;
      }
      try {
        const res = await fetch("/api/coupons/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            coupon_code: trimmed,
            items: items.map((i) => ({ product_id: i.productId ?? i.id, quantity: i.quantity })),
          }),
        });
        const json = await res.json();
        if (res.ok && json?.valid) {
          setCouponDiscount(Number(json.discount_amount ?? 0));
          setAppliedCoupon(trimmed);
          setCouponError(null);
        } else {
          setCouponDiscount(0);
          setAppliedCoupon(null);
          setCouponError(
            json?.reason === "coupon_min_order"
              ? `Add ${taka(Number(json.minimum_order_value ?? 0) - subtotal)} more to use this coupon.`
              : "That coupon could not be applied to this order."
          );
        }
      } catch {
        setCouponError("Could not check that coupon. Please try again.");
      }
    },
    [items, subtotal, taka]
  );

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Please enter the recipient's name.";
    if (!phoneOk) e.phone = "Enter an 11-digit Bangladeshi mobile number, e.g. 01712345678.";
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) e.email = "That email address does not look right.";
    if (!address.division) e.division = "Choose a division.";
    if (!address.district) e.district = "Choose a district.";
    if (!address.thana) e.thana = "Choose a thana or area.";
    if (address.line.trim().length < 5) e.line = "Add house, road and area so the rider can find you.";
    if (!ONLINE_ENABLED && (manualMethod === "bkash" || manualMethod === "nagad") && !transactionId.trim())
      e.transactionId = `Enter the ${manualMethod} transaction ID so we can verify your payment.`;
    if (TURNSTILE_ENABLED && !turnstileToken) e.turnstile = "Please wait a moment for the security check, then try again.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const placeOrder = async (planOverride?: PaymentPlan) => {
    if (!validate()) {
      document.querySelector("[aria-invalid='true']")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const usePlan = planOverride ?? plan;
    setPlacing(true);
    setOrderError(null);
    try {
      const attribution = getAttribution() ?? {};
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: name.trim(),
          customer_phone: normalisePhone(phone),
          customer_email: email.trim() || undefined,
          delivery_address: [address.line, address.thana, address.district].join(", "),
          division: address.division,
          district: address.district,
          thana: address.thana,
          address_line: address.line.trim(),
          city: insideDhaka ? "dhaka" : "outside",
          shipping_fee: shippingFee,
          payment_plan: ONLINE_ENABLED ? usePlan : "cod",
          payment_method: ONLINE_ENABLED ? (usePlan === "full" ? "univapayment" : "cod") : manualMethod,
          provider_txn_id: !ONLINE_ENABLED && manualMethod !== "cod" ? transactionId.trim() : undefined,
          notes: notes.trim() || undefined,
          coupon_code: appliedCoupon ?? undefined,
          expected_total: grandTotal,
          turnstile_token: turnstileToken ?? undefined,
          device_id: getDeviceId(),
          session_id: sessionId.current,
          attribution: {
            utm_source: attribution.utm_source,
            utm_medium: attribution.utm_medium,
            utm_campaign: attribution.utm_campaign,
            utm_content: attribution.utm_content,
            utm_term: attribution.utm_term,
            fbclid: attribution.fbclid,
            landing_page: attribution.landing_page,
            referrer: attribution.referrer,
          },
          items: items.map((i) => ({
            product_id: i.productId,
            title: i.title,
            size: i.size,
            color: i.color,
            quantity: i.quantity,
            image: i.image,
          })),
        }),
      });
      const json = await res.json();

      if (!res.ok || !json?.success) {
        if (json?.reason === "advance_required") {
          setPlan("cod_advance");
          setAdvanceNotice(true);
          document.getElementById("ck-payment")?.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        setOrderError(json?.error ?? "We could not place your order. Please try again.");
        setTurnstileReset((n) => n + 1);
        return;
      }

      if (buyNowMode) clearBuyNow();
      else clearCart();
      try {
        window.sessionStorage.removeItem("as_checkout_session");
      } catch {
        // ignore
      }
      const orderPage = `/order/${encodeURIComponent(json.order_id)}/confirmed`;
      if (typeof json.checkout_url === "string" && json.checkout_url) {
        // bKash / Nagad opens in a popup on this page. Paid, pending or
        // closed, the order page re-checks the payment with the gateway and
        // offers "Finish payment" if it is still unpaid.
        setPayingOrder(json.order_id);
        const outcome = await openPaymentPopup(json.checkout_url);
        if (outcome === "redirected") return;
        router.replace(json.payment_id ? `${orderPage}?payment=${encodeURIComponent(json.payment_id)}` : orderPage);
        return;
      }
      router.replace(orderPage);
    } catch {
      setOrderError("Network problem while placing your order. Please try again.");
    } finally {
      setPlacing(false);
    }
  };

  if (payingOrder) {
    return (
      <div className="max-w-container-max mx-auto px-space-base py-space-3xl text-center">
        <Loader2 className="w-6 h-6 mx-auto animate-spin text-primary" aria-hidden />
        <h1 className="mt-3 font-display text-xl font-bold text-primary uppercase">Finish your payment</h1>
        <p className="mt-2 text-sm text-muted">
          Complete the bKash / Nagad payment in the window that opened. Your order is placed once the payment comes through.
        </p>
        <Link
          href={`/order/${encodeURIComponent(payingOrder)}/confirmed`}
          className="inline-block mt-4 text-xs font-bold underline text-primary"
        >
          View my order
        </Link>
      </div>
    );
  }

  if (mounted && items.length === 0) {
    return (
      <div className="max-w-container-max mx-auto px-space-base py-space-3xl text-center">
        <h1 className="font-display text-2xl font-bold text-primary uppercase">Your bag is empty</h1>
        <Link href="/shop" className="inline-block mt-4 px-5 py-3 bg-primary text-primary-foreground rounded-lg text-xs font-bold uppercase">
          Continue shopping
        </Link>
      </div>
    );
  }

  const payNowLabel =
    !ONLINE_ENABLED || plan === "cod"
      ? `Place order · ${taka(grandTotal)}`
      : plan === "full"
        ? `Pay ${taka(grandTotal)} with bKash / Nagad`
        : `Pay ${taka(advance)} now & place order`;

  const planOptions: { id: PaymentPlan; title: string; detail: string; badge?: string }[] = [
    {
      id: "cod_advance",
      title: `Cash on delivery · pay ${taka(advance)} now`,
      detail: `Pay the delivery charge with bKash or Nagad, and ${taka(Math.max(0, grandTotal - advance))} when the parcel arrives. Your order is confirmed right away.`,
      badge: "Most chosen",
    },
    {
      id: "full",
      title: `Pay ${taka(grandTotal)} now`,
      detail: "Pay the full amount with bKash or Nagad. Confirmed right away.",
    },
    {
      id: "cod",
      title: "Cash on delivery · nothing now",
      detail: "Pay everything when the parcel arrives. We will call you to confirm the order first.",
    },
  ];

  return (
    <div className="w-full bg-surface pb-28 lg:pb-space-3xl">
      <GoogleOneTap enabled={mounted && authConfigured && !user} />
      <div className="max-w-container-max mx-auto px-space-base py-space-lg">
        <div className="mb-space-base flex items-center justify-between gap-2">
          <h1 className="font-display text-2xl sm:text-3xl uppercase font-bold text-primary">Checkout</h1>
          <Link
            href="/shop"
            className="inline-flex items-center gap-2 text-xs font-semibold text-primary border border-border-light hover:bg-surface-subtle px-3 py-2 rounded-lg"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Continue shopping
          </Link>
        </div>

        <form
          className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-space-lg items-start"
          onSubmit={(e) => {
            e.preventDefault();
            void placeOrder();
          }}
          noValidate
        >
          <div className="flex flex-col gap-space-base">
            {/* Sign in or guest */}
            {authConfigured && !user && (
              <section className="bg-surface-card border border-border-light rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1">
                  <p className="text-sm font-bold text-on-surface">Continue with Google in one click</p>
                  <p className="text-xs text-text-muted mt-0.5">
                    Track orders easily, collect points, and skip typing your address next time. Or just order as a guest below.
                  </p>
                </div>
                <div className="sm:w-56">
                  <GoogleSignInButton returnTo={buyNowMode ? "/checkout?mode=buynow" : "/checkout"} />
                </div>
              </section>
            )}
            {user && (
              <p className="text-xs text-text-muted flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-700" /> Signed in as {user.email}
              </p>
            )}

            {/* Contact */}
            <section className="bg-surface-card border border-border-light rounded-xl p-4 flex flex-col gap-3">
              <h2 className="font-display text-sm font-bold uppercase tracking-wider text-primary">Your details</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="ck-name" className="block text-xs font-semibold mb-1">Full name</label>
                  <input id="ck-name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" aria-invalid={Boolean(errors.name)} />
                  {errors.name && <p className="text-[11px] text-badge-discount mt-1">{errors.name}</p>}
                </div>
                <div>
                  <label htmlFor="ck-phone" className="block text-xs font-semibold mb-1">Mobile number</label>
                  <input id="ck-phone" className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="01XXXXXXXXX" aria-invalid={Boolean(errors.phone)} />
                  {errors.phone && <p className="text-[11px] text-badge-discount mt-1">{errors.phone}</p>}
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="ck-email" className="block text-xs font-semibold mb-1">
                    Email <span className="font-normal text-text-muted">(optional, for the receipt)</span>
                  </label>
                  <input id="ck-email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" aria-invalid={Boolean(errors.email)} />
                  {errors.email && <p className="text-[11px] text-badge-discount mt-1">{errors.email}</p>}
                </div>
              </div>
            </section>

            {/* Address */}
            <section className="bg-surface-card border border-border-light rounded-xl p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-sm font-bold uppercase tracking-wider text-primary">Delivery address</h2>
                {savedAddress && savedAddress.district && address.district !== savedAddress.district && (
                  <button type="button" onClick={() => setAddress(savedAddress)} className="text-[11px] font-semibold text-primary underline flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> Use {savedAddress.thana}, {savedAddress.district}
                  </button>
                )}
              </div>
              <AddressPicker value={address} onChange={setAddress} errors={errors} />
              {zoneKnown && window_ && (
                <div className="flex items-start gap-2 text-xs bg-surface-subtle rounded-lg p-3">
                  <Truck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <span>
                    {insideDhaka ? "Inside Dhaka" : "Outside Dhaka"} · delivery{" "}
                    {freeDelivery ? <strong className="text-emerald-700">free</strong> : <strong>{taka(shippingFee)}</strong>}. Arrives{" "}
                    <strong>
                      {window_.start.toLocaleDateString("en-GB", { weekday: "long" })}–{window_.end.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })}
                    </strong>
                    .
                  </span>
                </div>
              )}
              <div>
                <label htmlFor="ck-notes" className="block text-xs font-semibold mb-1">
                  Note for the rider <span className="font-normal text-text-muted">(optional)</span>
                </label>
                <input id="ck-notes" className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="e.g. call before coming, landmark" />
              </div>
            </section>

            {/* Payment */}
            <section id="ck-payment" className="bg-surface-card border border-border-light rounded-xl p-4 flex flex-col gap-3">
              <h2 className="font-display text-sm font-bold uppercase tracking-wider text-primary">Payment</h2>
              {advanceNotice && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  For this order the delivery charge needs to be paid first. The rest is paid when the parcel arrives.
                </div>
              )}
              {ONLINE_ENABLED ? (
                <div className="flex flex-col gap-2" role="radiogroup">
                  {planOptions.map((p) => {
                    const selected = plan === p.id;
                    const disabled = advanceNotice && p.id === "cod";
                    return (
                      <label
                        key={p.id}
                        className={`flex gap-3 p-3 rounded-lg border cursor-pointer ${selected ? "border-primary bg-primary/5" : "border-border-light"} ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
                      >
                        <input type="radio" name="plan" className="mt-1 accent-primary" checked={selected} disabled={disabled} onChange={() => choosePlan(p.id)} />
                        <span className="flex-1">
                          <span className="flex items-center gap-2 text-sm font-bold text-on-surface">
                            {p.title}
                            {p.badge && <span className="text-[10px] uppercase bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">{p.badge}</span>}
                          </span>
                          <span className="block text-xs text-text-muted mt-0.5">{p.detail}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col gap-2" role="radiogroup">
                  {([
                    ["cod", "Cash on Delivery", "Pay the rider when your parcel arrives."],
                    ["bkash", "bKash", "Send money from your bKash wallet, then enter the transaction ID."],
                    ["nagad", "Nagad", "Send money from your Nagad wallet, then enter the transaction ID."],
                  ] as const).map(([id, title, detail]) => (
                    <label key={id} className={`flex gap-3 p-3 rounded-lg border cursor-pointer ${manualMethod === id ? "border-primary bg-primary/5" : "border-border-light"}`}>
                      <input type="radio" name="manual" className="mt-1 accent-primary" checked={manualMethod === id} onChange={() => setManualMethod(id)} />
                      <span>
                        <span className="block text-sm font-bold">{title}</span>
                        <span className="block text-xs text-text-muted">{detail}</span>
                      </span>
                    </label>
                  ))}
                  {manualMethod !== "cod" && (
                    <div>
                      <input className={inputCls} value={transactionId} onChange={(e) => setTransactionId(e.target.value)} placeholder="Transaction ID" aria-invalid={Boolean(errors.transactionId)} />
                      {errors.transactionId && <p className="text-[11px] text-badge-discount mt-1">{errors.transactionId}</p>}
                    </div>
                  )}
                </div>
              )}
              <Turnstile onToken={setTurnstileToken} resetKey={turnstileReset} />
              {errors.turnstile && <p className="text-[11px] text-badge-discount">{errors.turnstile}</p>}
            </section>

            {orderError && (
              <div className="flex items-start gap-2 rounded-lg border border-badge-discount/40 bg-badge-discount/5 px-3 py-2.5 text-xs text-badge-discount">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {orderError}
              </div>
            )}

            <button
              type="submit"
              disabled={placing || !mounted}
              className="hidden lg:inline-flex items-center justify-center gap-2 px-5 py-3.5 bg-primary text-white rounded-lg text-sm font-bold font-display uppercase tracking-wider hover:bg-primary-container disabled:opacity-60 shadow-sm"
            >
              {placing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
              {payNowLabel}
            </button>
            <p className="text-[11px] text-text-muted">
              By placing the order you agree to our <Link href="/terms" className="underline">terms</Link>. We keep your phone number to deliver and follow up on this order (<Link href="/privacy-policy" className="underline">privacy policy</Link>).
            </p>
          </div>

          {/* Summary */}
          <aside className="bg-surface-card border border-border-light rounded-xl p-4 flex flex-col gap-3 lg:sticky lg:top-[180px]">
            <h2 className="font-display text-sm font-bold uppercase tracking-wider text-primary">Order summary</h2>
            <div className="flex flex-col gap-3 max-h-72 overflow-y-auto">
              {items.map((i) => (
                <div key={i.id} className="flex gap-3">
                  <div className="relative w-14 h-14 rounded-lg overflow-hidden bg-surface-subtle shrink-0">
                    {i.image && <Image src={i.image} alt={i.title} fill sizes="56px" className="object-cover" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold line-clamp-2">{i.title}</p>
                    <p className="text-[11px] text-text-muted">
                      {[i.size, i.color].filter(Boolean).join(" • ")} · Qty {i.quantity}
                    </p>
                  </div>
                  <span className="text-xs font-semibold">{taka(i.price * i.quantity)}</span>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-border-light flex flex-col gap-2">
              <label className="text-xs font-semibold flex items-center gap-1.5" htmlFor="ck-coupon">
                <Tag className="w-3.5 h-3.5" /> Have a coupon?
              </label>
              <div className="flex gap-2">
                <input id="ck-coupon" value={couponInput} onChange={(e) => setCouponInput(e.target.value.toUpperCase())} placeholder="ENTER CODE" className="flex-1 h-9 px-3 rounded-lg border border-border-light uppercase text-xs" />
                <button type="button" onClick={() => void quoteCoupon(couponInput)} className="px-3 h-9 rounded-lg bg-surface-subtle border border-border-light text-xs font-bold uppercase text-primary">
                  Apply
                </button>
              </div>
              {appliedCoupon && (
                <p className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> {appliedCoupon} applied · −{taka(couponDiscount)}
                </p>
              )}
              {couponError && <p className="text-[11px] text-badge-discount">{couponError}</p>}
            </div>

            <div className="pt-3 border-t border-border-light flex flex-col gap-2 text-xs">
              <div className="flex justify-between text-text-muted">
                <span>Subtotal</span>
                <span className="text-on-surface font-semibold">{taka(subtotal)}</span>
              </div>
              {couponDiscount > 0 && (
                <div className="flex justify-between text-emerald-700 font-semibold">
                  <span>Coupon</span>
                  <span>−{taka(couponDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between text-text-muted">
                <span>Delivery{zoneKnown ? (insideDhaka ? " · Inside Dhaka" : " · Outside Dhaka") : ""}</span>
                <span className={shippingFee === 0 ? "text-emerald-700 font-bold" : "text-on-surface font-semibold"}>
                  {shippingFee === 0 ? "FREE" : taka(shippingFee)}
                </span>
              </div>
              <div className="border-t border-border-light pt-2 flex justify-between text-sm font-bold text-primary">
                <span>Total</span>
                <span className="font-display text-base">{taka(grandTotal)}</span>
              </div>
              {ONLINE_ENABLED && plan === "cod_advance" && (
                <div className="flex justify-between text-[11px] text-text-muted">
                  <span>Pay now · on delivery</span>
                  <span>
                    {taka(advance)} · {taka(Math.max(0, grandTotal - advance))}
                  </span>
                </div>
              )}
              <FreeDeliveryBar subtotal={discountedSubtotal} threshold={settings.free_delivery_over} />
            </div>
            <div className="flex items-center justify-center gap-2 text-[11px] text-text-muted">
              <ShieldCheck className="w-4 h-4" /> Secure checkout
            </div>
          </aside>

          {/* Mobile: the order button stays at the bottom of the screen. */}
          <div className="lg:hidden fixed bottom-16 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-border-light px-4 py-3">
            <button
              type="submit"
              disabled={placing || !mounted}
              className="w-full inline-flex items-center justify-center gap-2 py-3.5 bg-primary text-primary-foreground rounded-lg text-sm font-bold font-display uppercase tracking-wider disabled:opacity-60"
            >
              {placing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
              {payNowLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={null}>
      <CheckoutInner />
    </Suspense>
  );
}
