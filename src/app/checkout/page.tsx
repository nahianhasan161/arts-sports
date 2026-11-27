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
import { readDelivery } from "@/lib/delivery-details";
import { useCheckoutSettings } from "@/lib/checkout-settings";
import { formatMoney, type MessageKey } from "@/i18n";
import { useT } from "@/i18n/client";
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
/** Also takes Bangla digits, as a Bangla keyboard types them. */
const normalisePhone = (raw: string) => raw.replace(/[০-৯]/g, (d) => String("০১২৩৪৫৬৭৮৯".indexOf(d))).replace(/[\s-]/g, "");

/** What the customer is told for each reason /api/checkout gives. */
const REASON_TEXT: Record<string, MessageKey> = {
  invalid_location: "buy.checkout.err.thana",
  gateway_unavailable: "buy.checkout.err.gateway",
  bot_check_failed: "buy.checkout.err.bot",
  advance_required: "buy.checkout.advanceNotice",
  insufficient_stock: "buy.checkout.err.stock",
  variant_unallocated: "buy.checkout.err.unavailable",
  inventory_not_allocatable: "buy.checkout.err.unavailable",
  product_not_found: "buy.checkout.err.gone",
  empty_order: "buy.checkout.emptyTitle",
};
const BAG_REASONS = ["insufficient_stock", "variant_unallocated", "inventory_not_allocatable", "product_not_found"];

type ManualMethod = "cod" | "bkash" | "nagad";

const inputCls =
  "w-full h-11 px-3 rounded-lg border border-border-light bg-surface-card focus:outline-none focus:ring-1 focus:ring-primary aria-[invalid=true]:border-badge-discount text-sm";

function newSessionId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now());
}

function CheckoutInner() {
  const router = useRouter();
  const search = useSearchParams();
  const { t, locale } = useT();
  const buyNowMode = search.get("mode") === "buynow";
  const [mounted, setMounted] = useState(false);
  const { items: cartItems, buyNowItem, clearCart, clearBuyNow, openCart } = useCartStore();
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
  // Plain cash on delivery first: it is what most shoppers here expect. The
  // server asks for the delivery charge up front only when the order's risk
  // score is high (reason "advance_required"), and then this switches over.
  const [plan, setPlan] = useState<PaymentPlan>("cod");
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
  const [bagError, setBagError] = useState(false);
  const [advanceNotice, setAdvanceNotice] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Phone: the summary opens from its total line at the top.
  const [summaryOpen, setSummaryOpen] = useState(false);
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
    // Details saved on the profile win over the last order's address.
    const own = readDelivery(user);
    if (own) {
      if (own.name) setName(own.name);
      if (own.phone) setPhone((p) => p || own.phone);
      if (own.district) {
        const a = { division: own.division, district: own.district, thana: own.thana, line: own.line };
        setSavedAddress(a);
        setAddress((cur) => (cur.district ? cur : a));
      }
      return;
    }
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
  const taka = useCallback((n: number) => formatMoney(n, locale), [locale]);
  const num = (n: number) => new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-IN").format(n);
  const day = (d: Date) => d.toLocaleDateString(locale === "bn" ? "bn-BD" : "en-GB", { weekday: "short", day: "numeric", month: "short" });
  const quantity = items.reduce((n, i) => n + i.quantity, 0);

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
              ? t("buy.checkout.couponMin", { amount: taka(Number(json.minimum_order_value ?? 0) - subtotal) })
              : t("buy.checkout.couponBad")
          );
        }
      } catch {
        setCouponError(t("buy.checkout.couponNet"));
      }
    },
    [items, subtotal, taka, t]
  );

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = t("buy.checkout.err.name");
    if (!phoneOk) e.phone = t("buy.checkout.err.phone");
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) e.email = t("buy.checkout.err.email");
    if (!address.division) e.division = t("buy.checkout.err.division");
    if (!address.district) e.district = t("buy.checkout.err.district");
    if (!address.thana) e.thana = t("buy.checkout.err.thana");
    if (address.line.trim().length < 5) e.line = t("buy.checkout.err.line");
    if (!ONLINE_ENABLED && (manualMethod === "bkash" || manualMethod === "nagad") && !transactionId.trim())
      e.transactionId = t("buy.checkout.err.txn", { wallet: manualMethod === "bkash" ? t("site.footer.bkash") : t("site.footer.nagad") });
    if (TURNSTILE_ENABLED && !turnstileToken) e.turnstile = t("buy.checkout.err.bot");
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const placeOrder = async (planOverride?: PaymentPlan) => {
    if (!validate()) {
      setOrderError(t("buy.checkout.err.fix"));
      setBagError(false);
      // The marks are drawn after this; then go to the first one.
      requestAnimationFrame(() => {
        const first = document.querySelector<HTMLElement>("form [aria-invalid='true']");
        first?.scrollIntoView({ behavior: "smooth", block: "center" });
        first?.focus({ preventScroll: true });
      });
      return;
    }
    const usePlan = planOverride ?? plan;
    setPlacing(true);
    setOrderError(null);
    setBagError(false);
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
        const reason = typeof json?.reason === "string" ? json.reason : "";
        const key: MessageKey =
          REASON_TEXT[reason] ?? (reason.startsWith("coupon_") ? "buy.checkout.err.coupon" : res.status === 429 ? "buy.checkout.err.rate" : "buy.checkout.err.failed");
        // English keeps the server's own sentence, which can name the product.
        setOrderError(locale === "en" && json?.error ? json.error : t(key));
        setBagError(BAG_REASONS.includes(reason));
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
      setOrderError(t("buy.checkout.err.network"));
    } finally {
      setPlacing(false);
    }
  };

  if (payingOrder) {
    return (
      <div className="max-w-container-max mx-auto px-space-base py-space-3xl text-center">
        <Loader2 className="w-6 h-6 mx-auto animate-spin text-primary" aria-hidden />
        <h1 className="mt-3 font-display text-xl font-bold text-primary uppercase">{t("buy.checkout.finishTitle")}</h1>
        <p className="mt-2 text-sm text-text-muted">
          {t("buy.checkout.finishText")}
        </p>
        <Link
          href={`/order/${encodeURIComponent(payingOrder)}/confirmed`}
          className="inline-block mt-4 text-xs font-bold underline text-primary"
        >
          {t("buy.checkout.viewOrder")}
        </Link>
      </div>
    );
  }

  if (mounted && items.length === 0) {
    return (
      <div className="max-w-container-max mx-auto px-space-base py-space-3xl text-center">
        <h1 className="font-display text-2xl font-bold text-primary uppercase">{t("buy.checkout.emptyTitle")}</h1>
        <Link href="/shop" className="sp-btn sp-pitch inline-block mt-4 py-3 text-xs font-bold uppercase">
          {t("buy.cart.shop")}
        </Link>
      </div>
    );
  }

  const payNowLabel =
    !ONLINE_ENABLED || plan === "cod"
      ? t("buy.checkout.place", { amount: taka(grandTotal) })
      : plan === "full"
        ? t("buy.checkout.payFull", { amount: taka(grandTotal) })
        : t("buy.checkout.payAdvance", { amount: taka(advance) });

  const rest = Math.max(0, grandTotal - advance);
  // With free delivery there is no charge to prepay: the same money is an advance on the products.
  const planOptions: { id: PaymentPlan; title: string; detail: string }[] = [
    { id: "cod", title: t("buy.checkout.planCod"), detail: t("buy.checkout.planCodText") },
    {
      id: "cod_advance",
      title: t("buy.checkout.planAdvance", { amount: taka(advance) }),
      detail: t(shippingFee > 0 ? "buy.checkout.planAdvanceText" : "buy.checkout.planAdvanceFreeText", { amount: taka(advance), rest: taka(rest) }),
    },
    { id: "full", title: t("buy.checkout.planFull", { amount: taka(grandTotal) }), detail: t("buy.checkout.planFullText") },
  ];

  return (
    <div className="w-full bg-surface pb-28 lg:pb-space-3xl">
      <GoogleOneTap enabled={mounted && authConfigured && !user} />
      <div className="max-w-container-max mx-auto px-space-base py-space-lg">
        <div className="mb-space-base flex items-center justify-between gap-2">
          <h1 className="font-display text-2xl sm:text-3xl uppercase font-bold text-primary">{t("buy.checkout.title")}</h1>
          <Link
            href="/shop"
            className="sp-btn sp-flag inline-flex items-center gap-2 text-xs font-semibold py-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> {t("buy.checkout.back")}
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
              <section className="bg-surface-card border border-border-light rounded-xl p-3 sm:p-4 flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-sm font-bold text-on-surface">{t("buy.checkout.google")}</p>
                  <p className="hidden sm:block text-xs text-text-muted mt-0.5">
                    {t("buy.checkout.googleText")}
                  </p>
                </div>
                <div className="w-40 sm:w-56 shrink-0">
                  <GoogleSignInButton returnTo={buyNowMode ? "/checkout?mode=buynow" : "/checkout"} />
                </div>
              </section>
            )}
            {user && (
              <p className="text-xs text-text-muted flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" /> {t("buy.checkout.signedIn", { email: user.email ?? "" })}
              </p>
            )}

            {/* Contact */}
            <section className="bg-surface-card border border-border-light rounded-xl p-4 flex flex-col gap-3">
              <h2 className="font-display text-sm font-bold uppercase tracking-wider text-primary">{t("buy.checkout.details")}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="ck-name" className="block text-xs font-semibold mb-1">{t("buy.checkout.name")}</label>
                  <input id="ck-name" maxLength={120} className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" aria-invalid={Boolean(errors.name)} />
                  {errors.name && <p className="text-xs text-badge-discount mt-1">{errors.name}</p>}
                </div>
                <div>
                  <label htmlFor="ck-phone" className="block text-xs font-semibold mb-1">{t("buy.checkout.phone")}</label>
                  <input id="ck-phone" className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="01XXXXXXXXX" aria-invalid={Boolean(errors.phone)} />
                  {errors.phone && <p className="text-xs text-badge-discount mt-1">{errors.phone}</p>}
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="ck-email" className="block text-xs font-semibold mb-1">
                    {t("buy.checkout.email")} <span className="font-normal text-text-muted">({t("buy.checkout.optional")})</span>
                  </label>
                  <input id="ck-email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" aria-invalid={Boolean(errors.email)} />
                  {errors.email && <p className="text-xs text-badge-discount mt-1">{errors.email}</p>}
                </div>
              </div>
            </section>

            {/* Address */}
            <section className="bg-surface-card border border-border-light rounded-xl p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-sm font-bold uppercase tracking-wider text-primary">{t("buy.checkout.address")}</h2>
                {savedAddress && savedAddress.district && address.district !== savedAddress.district && (
                  <button type="button" onClick={() => setAddress(savedAddress)} className="sp-btn sp-flag py-1.5 text-xs font-semibold flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> {t("buy.checkout.useSaved", { place: [savedAddress.thana, savedAddress.district].filter(Boolean).join(", ") })}
                  </button>
                )}
              </div>
              <AddressPicker value={address} onChange={setAddress} errors={errors} />
              {zoneKnown && window_ && (
                <div className="flex items-start gap-2 text-xs bg-surface-subtle rounded-lg p-3">
                  <Truck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <span>
                    <strong className={freeDelivery ? "text-emerald-700 dark:text-emerald-400" : ""}>
                      {t("buy.checkout.deliveryIs", {
                        zone: insideDhaka ? t("buy.checkout.inside") : t("buy.checkout.outside"),
                        fee: freeDelivery ? t("buy.checkout.free") : taka(shippingFee),
                      })}
                    </strong>
                    <span className="block text-text-muted">{t("buy.checkout.expected", { from: day(window_.start), to: day(window_.end) })}</span>
                  </span>
                </div>
              )}
              <div>
                <label htmlFor="ck-notes" className="block text-xs font-semibold mb-1">
                  {t("buy.checkout.note")} <span className="font-normal text-text-muted">({t("buy.checkout.optional")})</span>
                </label>
                <input id="ck-notes" className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder={t("buy.checkout.notePlaceholder")} />
              </div>
            </section>

            {/* Payment */}
            <section id="ck-payment" className="bg-surface-card border border-border-light rounded-xl p-4 flex flex-col gap-3">
              <h2 className="font-display text-sm font-bold uppercase tracking-wider text-primary">{t("buy.checkout.payment")}</h2>
              {advanceNotice && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  {t("buy.checkout.advanceNotice", { amount: taka(advance) })}
                </div>
              )}
              {ONLINE_ENABLED ? (
                <div className="flex flex-col gap-2" role="radiogroup" aria-label={t("buy.checkout.payment")}>
                  {planOptions.map((p) => {
                    const selected = plan === p.id;
                    const disabled = advanceNotice && p.id === "cod";
                    return (
                      <label
                        key={p.id}
                        className={`sp-tile ${selected ? "sp-on" : ""} flex gap-3 p-3 rounded-lg border cursor-pointer ${selected ? "border-primary bg-primary/5" : "border-border-light"} ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
                      >
                        <input type="radio" name="plan" className="mt-1 accent-primary" checked={selected} disabled={disabled} onChange={() => choosePlan(p.id)} />
                        <span className="flex-1">
                          <span className="flex items-center gap-2 text-sm font-bold text-on-surface">
                            {p.title}
                          </span>
                          <span className="block text-xs text-text-muted mt-0.5">{p.detail}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col gap-2" role="radiogroup" aria-label={t("buy.checkout.payment")}>
                  {([
                    ["cod", t("buy.checkout.cod"), t("buy.checkout.codText")],
                    ["bkash", t("site.footer.bkash"), t("buy.checkout.walletText", { wallet: t("site.footer.bkash") })],
                    ["nagad", t("site.footer.nagad"), t("buy.checkout.walletText", { wallet: t("site.footer.nagad") })],
                  ] as const).map(([id, title, detail]) => (
                    <label key={id} className={`sp-tile ${manualMethod === id ? "sp-on" : ""} flex gap-3 p-3 rounded-lg border cursor-pointer ${manualMethod === id ? "border-primary bg-primary/5" : "border-border-light"}`}>
                      <input type="radio" name="manual" className="mt-1 accent-primary" checked={manualMethod === id} onChange={() => setManualMethod(id)} />
                      <span>
                        <span className="block text-sm font-bold">{title}</span>
                        <span className="block text-xs text-text-muted">{detail}</span>
                      </span>
                    </label>
                  ))}
                  {manualMethod !== "cod" && (
                    <div>
                      <input className={inputCls} value={transactionId} onChange={(e) => setTransactionId(e.target.value)} placeholder={t("buy.checkout.txn")} aria-label={t("buy.checkout.txn")} aria-invalid={Boolean(errors.transactionId)} />
                      {errors.transactionId && <p className="text-xs text-badge-discount mt-1">{errors.transactionId}</p>}
                    </div>
                  )}
                </div>
              )}
              <Turnstile onToken={setTurnstileToken} resetKey={turnstileReset} />
              {errors.turnstile && <p className="text-xs text-badge-discount">{errors.turnstile}</p>}
            </section>

            {orderError && (
              <div className="flex items-start gap-2 rounded-lg border border-badge-discount/40 bg-badge-discount/5 px-3 py-2.5 text-sm text-badge-discount" role="alert">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  {orderError}
                  {bagError && !buyNowMode && (
                    <button type="button" onClick={openCart} className="ml-2 font-bold underline">{t("buy.checkout.err.openBag")}</button>
                  )}
                </span>
              </div>
            )}

            <button
              type="submit"
              disabled={placing || !mounted}
              className="sp-btn sp-goal hidden lg:inline-flex items-center justify-center gap-2 py-3.5 text-sm font-bold font-display uppercase tracking-wider"
            >
              {placing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
              {payNowLabel}
            </button>
            <p className="text-xs text-text-muted">
              {t("buy.checkout.agree1")} <Link href="/terms" className="underline">{t("buy.checkout.terms")}</Link>. {t("buy.checkout.agree2")}{" "}
              <Link href="/privacy-policy" className="underline">{t("buy.checkout.privacy")}</Link>.
            </p>
          </div>

          {/* Summary */}
          <aside className="bg-surface-card border border-border-light rounded-xl p-4 flex flex-col gap-3 lg:sticky lg:top-[180px]">
            <h2 className="font-display text-sm font-bold uppercase tracking-wider text-primary">{t("buy.checkout.summary")}</h2>
            <div className="flex flex-col gap-3 max-h-72 overflow-y-auto">
              {items.map((i) => (
                <div key={i.id} className="flex gap-3">
                  <div className="relative w-14 h-14 rounded-lg overflow-hidden bg-surface-subtle shrink-0">
                    {i.image && <Image src={i.image} alt="" fill sizes="56px" className="object-cover" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold line-clamp-2">{(locale === "bn" && i.title_bn) || i.title}</p>
                    <p className="text-xs text-text-muted">
                      {[i.size, i.color !== "Default" ? i.color : "", t("buy.checkout.qty", { count: num(i.quantity) })].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <span className="text-xs font-semibold">{taka(i.price * i.quantity)}</span>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-border-light flex flex-col gap-2">
              <label className="text-xs font-semibold flex items-center gap-1.5" htmlFor="ck-coupon">
                <Tag className="w-3.5 h-3.5" /> {t("buy.checkout.coupon")}
              </label>
              <div className="flex gap-2">
                <input id="ck-coupon" value={couponInput} onChange={(e) => setCouponInput(e.target.value.toUpperCase())} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void quoteCoupon(couponInput); } }} placeholder={t("buy.checkout.couponPlaceholder")} className="flex-1 min-w-0 h-11 px-3 rounded-lg border border-border-light bg-surface-card uppercase text-sm" />
                <button type="button" onClick={() => void quoteCoupon(couponInput)} className="sp-btn sp-dumbbell h-11 text-xs font-bold uppercase">
                  {t("buy.checkout.apply")}
                </button>
              </div>
              {appliedCoupon && (
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> {t("buy.checkout.couponOn", { code: appliedCoupon, amount: taka(couponDiscount) })}
                </p>
              )}
              {couponError && <p className="text-xs text-badge-discount">{couponError}</p>}
            </div>

            <div className="pt-3 border-t border-border-light flex flex-col gap-2 text-xs">
              <div className="flex justify-between text-text-muted">
                <span>{t("buy.checkout.subtotal")}</span>
                <span className="text-on-surface font-semibold">{taka(subtotal)}</span>
              </div>
              {couponDiscount > 0 && (
                <div className="flex justify-between text-emerald-700 dark:text-emerald-400 font-semibold">
                  <span>{t("buy.checkout.couponRow")}</span>
                  <span>−{taka(couponDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between text-text-muted">
                <span>{t("buy.checkout.delivery")}{zoneKnown ? ` · ${insideDhaka ? t("buy.checkout.inside") : t("buy.checkout.outside")}` : ""}</span>
                <span className={shippingFee === 0 ? "text-emerald-700 dark:text-emerald-400 font-bold" : "text-on-surface font-semibold"}>
                  {freeDelivery ? t("buy.checkout.free") : zoneKnown ? taka(shippingFee) : t("buy.checkout.deliveryLater")}
                </span>
              </div>
              <div className="border-t border-border-light pt-2 flex justify-between text-sm font-bold text-primary">
                <span>{t("buy.checkout.total")}</span>
                <span className="font-display text-base">{taka(grandTotal)}</span>
              </div>
              {ONLINE_ENABLED && plan === "cod_advance" && (
                <>
                  <div className="flex justify-between font-semibold text-on-surface">
                    <span>{t("buy.checkout.payNow")}</span>
                    <span>{taka(advance)}</span>
                  </div>
                  <div className="flex justify-between text-text-muted">
                    <span>{t("buy.checkout.payLater")}</span>
                    <span>{taka(rest)}</span>
                  </div>
                </>
              )}
              <FreeDeliveryBar subtotal={discountedSubtotal} threshold={settings.free_delivery_over} />
            </div>
            <div className="flex items-center justify-center gap-2 text-xs text-text-muted">
              <ShieldCheck className="w-4 h-4" /> {t("buy.checkout.safe")}
            </div>
          </aside>

          {/* Mobile: the order button stays at the bottom of the screen. */}
          <div className="lg:hidden fixed bottom-[calc(4rem+env(safe-area-inset-bottom))] inset-x-0 z-40 bg-surface-card/95 backdrop-blur border-t border-border-light px-4 py-3">
            <button
              type="submit"
              disabled={placing || !mounted}
              className="sp-btn sp-goal w-full inline-flex items-center justify-center gap-2 py-3.5 text-sm font-bold font-display uppercase tracking-wider"
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
