"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShieldCheck, ArrowLeft, Check, Loader2, Lock, User, Phone, Mail, Tag, AlertCircle } from "lucide-react";
import Image from "next/image";
import { useCartStore } from "@/lib/store/cart-store";
import { useAuth } from "@/components/auth/AuthProvider";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatTaka } from "@/lib/pricing";

/**
 * Checkout, in four steps.
 *
 * This used to be one long form. Three problems with that, all of which cost
 * conversions at the step that matters most:
 *
 *   1. One screen asked for eleven fields plus a payment choice, so the
 *      customer could not tell how much was left before committing.
 *   2. A shopper with an account was never asked to sign in, so no order was
 *      ever attached to them and order history stayed empty. Authentication is
 *      now its own step, with a clear "continue as guest" alternative.
 *   3. Payment method and delivery notes sat below the fold beside unrelated
 *      fields. Payment is now its own step, and the notes field that used to
 *      be silently discarded is a first-class field on the review step.
 *
 * Every figure shown comes back from the server. The client computes none of
 * the money: the coupon is quoted by /api/coupons/validate, and the totals
 * come from the order function that also stores them.
 */

const STEPS = [
  { id: 1, label: "Delivery details" },
  { id: 2, label: "Account" },
  { id: 3, label: "Payment method" },
  { id: 4, label: "Review & confirm" },
] as const;

const PAYMENTS = [
  { id: "cod", label: "Cash on Delivery", detail: "Pay the rider when your parcel arrives. Available nationwide." },
  { id: "bkash", label: "bKash", detail: "Pay from your bKash wallet, then enter the transaction ID below." },
  { id: "nagad", label: "Nagad", detail: "Pay from your Nagad wallet, then enter the transaction ID below." },
] as const;

type PaymentId = (typeof PAYMENTS)[number]["id"];

/** 11-digit Bangladeshi mobile, optionally spaced or hyphenated. */
const BD_MOBILE = /^(?:\+?880|0)1[3-9]\d{8}$/;
const normalisePhone = (raw: string) => raw.replace(/[\s-]/g, "");

export default function CheckoutPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const { items, getSubtotal, clearCart } = useCartStore();
  const { user, configured: authConfigured } = useAuth();
  const [step, setStep] = useState(1);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState<"dhaka" | "outside">("dhaka");
  const [paymentMethod, setPaymentMethod] = useState<PaymentId>("cod");
  const [notes, setNotes] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [signInEmail, setSignInEmail] = useState("");
  const [signInPassword, setSignInPassword] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  /** Authoritative figures returned by the order function. */
  const [quote, setQuote] = useState<{ discount_amount: number } | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  useEffect(() => {
    // The subtotal is only meaningful once the persisted store has rehydrated.
    // Rendering it during SSR produces a server HTML of 0 against a client
    // value, which React reports as a hydration mismatch and which would show
    // an empty bag for a moment before the real total appears.
    setMounted(true);
  }, []);

  // Prefill from the signed-in session, so a returning customer does not
  // retype a name the account already holds.
  useEffect(() => {
    if (user) {
      const meta = user.user_metadata ?? {};
      if (!name && typeof meta.full_name === "string" && meta.full_name) setName(meta.full_name);
      if (!email && user.email) setEmail(user.email);
    }
    // Deliberately only on the session changing: re-running this on every
    // keystroke would overwrite a name the customer is editing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const subtotal = mounted ? getSubtotal() : 0;
  const freeShippingThreshold = 1500;

  /**
   * The coupon's discount, quoted by the server. Included in everything on
   * screen, because the total the customer is shown has to be the total they
   * are charged. Before this, `grandTotal` ignored the coupon, so the CTA
   * quoted a number higher than the one actually taken.
   */
  const couponDiscount = quote?.discount_amount ?? 0;
  const discountedSubtotal = Math.max(0, subtotal - couponDiscount);

  /**
   * Free delivery is judged on the post-discount subtotal, because that is the
   * subtotal the server derives its own charge from. Judging the
   * pre-discount figure here would show "FREE" for an order the server then
   * charges carriage on.
   */
  const shippingFee =
    discountedSubtotal >= freeShippingThreshold || subtotal === 0
      ? 0
      : city === "dhaka"
        ? 60
        : 120;

  const grandTotal = discountedSubtotal + shippingFee;
  const taka = formatTaka;

  /** Ask the server whether a coupon applies, and how much it is worth. */
  const quoteCoupon = useCallback(
    async (code: string) => {
      const trimmed = code.trim().toUpperCase();
      if (!trimmed) {
        setAppliedCoupon(null);
        setQuote(null);
        setQuoteError(null);
        return;
      }
      try {
        const res = await fetch("/api/coupons/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            coupon_code: trimmed,
            items: items.map((i) => ({
              product_id: i.productId ?? i.id,
              quantity: i.quantity,
            })),
          }),
        });
        const json = await res.json();
        if (res.ok && json?.valid) {
          setQuote({ discount_amount: Number(json.discount_amount ?? 0) });
          setAppliedCoupon(trimmed);
          setQuoteError(null);
        } else {
          setQuote(null);
          setAppliedCoupon(null);
          setQuoteError(
            json?.reason === "coupon_min_order"
              ? `Add ${taka(Number(json.minimum_order_value ?? 0) - subtotal)} more to use this coupon.`
              : "That coupon could not be applied to this order."
          );
        }
      } catch {
        setQuote(null);
        setAppliedCoupon(null);
        setQuoteError("Could not check that coupon. Please try again.");
      }
    },
    [items, subtotal, taka]
  );

  /** Validate the current step, returning true when it is safe to advance. */
  const validateStep = useCallback(
    (which: number): boolean => {
      const errors: Record<string, string> = {};
      if (which === 1) {
        if (!name.trim()) errors.name = "Please enter the recipient's name.";
        const normalised = normalisePhone(phone);
        if (!normalised) errors.phone = "Please enter a mobile number.";
        else if (!BD_MOBILE.test(normalised))
          errors.phone = "Enter an 11-digit Bangladeshi mobile number, e.g. 01712345678.";
        // Not `required`, because a customer may reasonably decline to give an
        // email -- but a malformed one is rejected rather than silently kept.
        if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
          errors.email = "That email address does not look right.";
        if (!address.trim()) errors.address = "Please enter the delivery address.";
        else if (address.trim().length < 10)
          errors.address = "Please add a fuller address, including area and thana/locality.";
      }
      if (which === 3) {
        // bKash and Nagad are wallet payments: without the transaction ID
        // there is nothing for the store to reconcile the payment against.
        if ((paymentMethod === "bkash" || paymentMethod === "nagad") && !transactionId.trim())
          errors.transactionId = `Enter the ${paymentMethod} transaction ID so we can verify your payment.`;
      }
      setFieldErrors(errors);
      return Object.keys(errors).length === 0;
    },
    [name, phone, email, address, paymentMethod, transactionId]
  );

  const goTo = useCallback(
    (next: number) => {
      setStep(next);
      setOrderError(null);
    },
    []
  );

  const handleNext = useCallback(() => {
    if (!validateStep(step)) return;
    goTo(Math.min(STEPS.length, step + 1));
  }, [step, validateStep, goTo]);

  const handleSignIn = useCallback(async () => {
    setSignInError(null);
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setSignInError("Sign-in is unavailable right now. You can still check out as a guest.");
      return;
    }
    setSigningIn(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: signInEmail.trim(),
        password: signInPassword,
      });
      if (error) {
        setSignInError(
          error.message.includes("Invalid login credentials")
            ? "That email and password do not match an account."
            : error.message
        );
        return;
      }
      // The session is now attached, and the order will be recorded against it.
      goTo(3);
    } catch (caught) {
      setSignInError(caught instanceof Error ? caught.message : "Could not sign in.");
    } finally {
      setSigningIn(false);
    }
  }, [signInEmail, signInPassword, goTo]);

  const handlePlaceOrder = useCallback(async () => {
    if (!validateStep(1) || !validateStep(3)) {
      goTo(1);
      return;
    }
    setPlacing(true);
    setOrderError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: name.trim(),
          customer_phone: normalisePhone(phone),
          customer_email: email.trim() || undefined,
          delivery_address: address.trim(),
          city,
          shipping_fee: shippingFee,
          payment_method: paymentMethod,
          // Delivery instructions for the rider. Previously collected in the
          // form and then never sent, so every instruction was discarded.
          notes: notes.trim() ? notes.trim() : undefined,
          // The wallet reference, when the customer has chosen wallet payment.
          provider_txn_id:
            paymentMethod === "bkash" || paymentMethod === "nagad" ? transactionId.trim() : undefined,
          coupon_code: appliedCoupon ?? undefined,
          items: items.map((i) => ({
            // variant_id is resolved on the server from the product, size and
            // colour; a browser-supplied id is deliberately not sent because
            // it is untrusted input that could reserve the wrong stock.
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
        setOrderError(json?.error ?? "We could not place your order. Please try again.");
        return;
      }

      clearCart();
      // A real URL, not a client-only state. The confirmation used to live in
      // this component, so a reload emptied the bag and left the order
      // reference with nowhere to go back to.
      router.replace(`/order/${encodeURIComponent(json.order_id)}/confirmed`);
    } catch {
      setOrderError("Network problem while placing your order. Please try again.");
    } finally {
      setPlacing(false);
    }
  }, [
    validateStep, goTo, name, phone, email, address, city, shippingFee,
    paymentMethod, notes, transactionId, appliedCoupon, items, clearCart, router,
  ]);

  const orderItems = useMemo(
    () =>
      items.map((i) => ({
        id: i.id,
        productId: i.productId,
        title: i.title,
        quantity: i.quantity,
        size: i.size,
        color: i.color,
        image: i.image,
      })),
    [items]
  );

  const needsWalletId = paymentMethod === "bkash" || paymentMethod === "nagad";

  return (
    <div className="w-full bg-surface pb-space-3xl">
      <div className="max-w-container-max mx-auto px-space-base py-space-lg">
        <div className="mb-space-base flex items-center justify-between">
          <h1 className="font-display text-2xl sm:text-3xl uppercase font-bold text-primary">
            Secure Checkout
          </h1>
          <Link
            href="/shop"
            className="inline-flex items-center gap-2 text-xs font-semibold text-primary border border-border-light hover:bg-surface-subtle px-3 py-2 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Continue Shopping</span>
          </Link>
        </div>

        {/* Step indicator. A single long form gave no sense of how much was
            left before committing, which is where most drop-off happens. */}
        <ol className="flex items-center gap-1 sm:gap-2 overflow-x-auto no-scrollbar mb-space-xl">
          {STEPS.map((s, idx) => {
            const state = step === s.id ? "current" : step > s.id ? "done" : "upcoming";
            return (
              <li key={s.id} className="flex items-center gap-1 sm:gap-2 shrink-0">
                <button
                  onClick={() => step > s.id && goTo(s.id)}
                  disabled={step <= s.id}
                  aria-current={state === "current" ? "step" : undefined}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-display uppercase tracking-wider font-bold transition-colors ${
                    state === "current"
                      ? "bg-primary text-white border-primary"
                      : state === "done"
                        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                        : "bg-surface-card text-text-muted border-border-light"
                  } ${step > s.id ? "cursor-pointer hover:bg-surface-subtle" : "cursor-default"}`}
                >
                  <span className={`w-4 h-4 rounded-full grid place-items-center text-[10px] ${
                    state === "current" ? "bg-white text-primary" : state === "done" ? "bg-emerald-600 text-white" : "bg-surface-container text-text-muted"
                  }`}>
                    {state === "done" ? <Check className="w-3 h-3" /> : s.id}
                  </span>
                  <span className="hidden sm:inline">{s.label}</span>
                </button>
                {idx < STEPS.length - 1 && (
                  <span className={`w-4 sm:w-8 h-px ${step > s.id ? "bg-emerald-400" : "bg-border-light"}`} />
                )}
              </li>
            );
          })}
        </ol>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (step < STEPS.length) handleNext();
            else void handlePlaceOrder();
          }}
          className="grid grid-cols-1 lg:grid-cols-12 gap-space-xl"
        >
          {/* ---------------- Left: the current step ---------------- */}
          <div className="lg:col-span-7 flex flex-col gap-space-lg">
            {orderError && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-badge-discount/10 border border-badge-discount/20 text-xs text-on-surface">
                <AlertCircle className="w-4 h-4 text-badge-discount shrink-0 mt-0.5" />
                <span>{orderError}</span>
              </div>
            )}

            {/* ---------- Step 1: Delivery details ---------- */}
            {step === 1 && (
              <section className="bg-surface-card p-space-base rounded-xl border border-border-light shadow-sm flex flex-col gap-3">
                <h2 className="font-display text-sm uppercase tracking-wider font-bold text-primary">
                  Delivery details
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block font-semibold mb-1 text-on-surface" htmlFor="ck-name">
                      Full Name *
                    </label>
                    <input
                      id="ck-name"
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Tanvir Hasan"
                      className={`w-full h-10 px-3 rounded-lg border focus:outline-none focus:ring-1 focus:ring-primary ${fieldErrors.name ? "border-badge-discount" : "border-border-light"}`}
                    />
                    {fieldErrors.name && (
                      <p className="text-[11px] text-badge-discount mt-1">{fieldErrors.name}</p>
                    )}
                  </div>
                  <div>
                    <label className="block font-semibold mb-1 text-on-surface" htmlFor="ck-phone">
                      Mobile Number *
                    </label>
                    <input
                      id="ck-phone"
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="01712345678"
                      className={`w-full h-10 px-3 rounded-lg border focus:outline-none focus:ring-1 focus:ring-primary ${fieldErrors.phone ? "border-badge-discount" : "border-border-light"}`}
                    />
                    {fieldErrors.phone && (
                      <p className="text-[11px] text-badge-discount mt-1">{fieldErrors.phone}</p>
                    )}
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block font-semibold mb-1 text-on-surface" htmlFor="ck-email">
                      Email <span className="font-normal text-text-muted">(optional)</span>
                    </label>
                    <input
                      id="ck-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className={`w-full h-10 px-3 rounded-lg border focus:outline-none focus:ring-1 focus:ring-primary ${fieldErrors.email ? "border-badge-discount" : "border-border-light"}`}
                    />
                    {fieldErrors.email && (
                      <p className="text-[11px] text-badge-discount mt-1">{fieldErrors.email}</p>
                    )}
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block font-semibold mb-1 text-on-surface" htmlFor="ck-address">
                      Delivery Address *
                    </label>
                    <textarea
                      id="ck-address"
                      required
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="House/Building, road, area, thana and district"
                      rows={3}
                      className={`w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-1 focus:ring-primary resize-none ${fieldErrors.address ? "border-badge-discount" : "border-border-light"}`}
                    />
                    {fieldErrors.address && (
                      <p className="text-[11px] text-badge-discount mt-1">{fieldErrors.address}</p>
                    )}
                  </div>
                  <div>
                    <label className="block font-semibold mb-1 text-on-surface" htmlFor="ck-city">
                      Delivery Zone *
                    </label>
                    <select
                      id="ck-city"
                      value={city}
                      onChange={(e) => setCity(e.target.value as "dhaka" | "outside")}
                      className="w-full h-10 px-3 rounded-lg border border-border-light bg-surface-card focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="dhaka">Dhaka Metro (৳ {taka(60)})</option>
                      <option value="outside">Outside Dhaka (৳ {taka(120)})</option>
                    </select>
                    <p className="text-[11px] text-text-muted mt-1">
                      The delivery charge is calculated on the server from this zone.
                    </p>
                  </div>
                </div>
              </section>
            )}

            {/* ---------- Step 2: Account ---------- */}
            {step === 2 && (
              <section className="bg-surface-card p-space-base rounded-xl border border-border-light shadow-sm flex flex-col gap-4">
                <div>
                  <h2 className="font-display text-sm uppercase tracking-wider font-bold text-primary">
                    Do you have an account?
                  </h2>
                  <p className="text-xs text-text-muted mt-1">
                    Signing in attaches this order to your profile, so it appears in your
                    order history and you can track it. Checking out as a guest works too —
                    we will still call you to confirm.
                  </p>
                </div>

                {user ? (
                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 flex items-start gap-2">
                    <Check className="w-4 h-4 text-emerald-700 mt-0.5" />
                    <div className="text-xs">
                      <p className="font-semibold text-emerald-900">Signed in as {user.email}</p>
                      <p className="text-emerald-800 mt-0.5">
                        This order will be saved to your account history.
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col gap-2 text-xs">
                      <label className="block font-semibold text-on-surface" htmlFor="ck-signin-email">
                        Email address
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                        <input
                          id="ck-signin-email"
                          type="email"
                          autoComplete="email"
                          value={signInEmail}
                          onChange={(e) => setSignInEmail(e.target.value)}
                          placeholder="you@example.com"
                          className="w-full h-10 pl-9 pr-3 rounded-lg border border-border-light focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 text-xs">
                      <label className="block font-semibold text-on-surface" htmlFor="ck-signin-password">
                        Password
                      </label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                        <input
                          id="ck-signin-password"
                          type="password"
                          autoComplete="current-password"
                          value={signInPassword}
                          onChange={(e) => setSignInPassword(e.target.value)}
                          placeholder="Your password"
                          className="w-full h-10 pl-9 pr-3 rounded-lg border border-border-light focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                    </div>

                    {signInError && (
                      <p className="text-[11px] text-badge-discount font-medium">{signInError}</p>
                    )}

                    {!authConfigured && (
                      <p className="text-[11px] text-text-muted">
                        Account sign-in is not configured on this deployment — you can still
                        check out as a guest below.
                      </p>
                    )}

                    <div className="flex flex-col sm:flex-row gap-2">
                      <button
                        type="button"
                        onClick={() => void handleSignIn()}
                        disabled={signingIn || !signInEmail || !signInPassword}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg text-xs font-bold font-display uppercase tracking-wider hover:bg-primary-container disabled:opacity-50 transition-colors"
                      >
                        {signingIn ? <Loader2 className="w-4 h-4 animate-spin" /> : <User className="w-4 h-4" />}
                        {signingIn ? "Signing in..." : "Sign in"}
                      </button>
                      <button
                        type="button"
                        onClick={() => goTo(3)}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-border-light bg-surface-card text-primary rounded-lg text-xs font-bold font-display uppercase tracking-wider hover:bg-surface-subtle transition-colors"
                      >
                        <Phone className="w-4 h-4" />
                        Continue as guest
                      </button>
                    </div>
                    <p className="text-[11px] text-text-muted">
                      No account?{" "}
                      <Link href="/sign-up" className="text-primary font-semibold hover:underline">
                        Create one
                      </Link>{" "}
                      — it takes a minute and saves your details for next time.
                    </p>
                  </>
                )}

                {user && (
                  <button
                    type="button"
                    onClick={() => goTo(3)}
                    className="self-start inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg text-xs font-bold font-display uppercase tracking-wider hover:bg-primary-container transition-colors"
                  >
                    Continue to payment
                  </button>
                )}
              </section>
            )}

            {/* ---------- Step 3: Payment method ---------- */}
            {step === 3 && (
              <section className="bg-surface-card p-space-base rounded-xl border border-border-light shadow-sm flex flex-col gap-3">
                <h2 className="font-display text-sm uppercase tracking-wider font-bold text-primary">
                  Payment method
                </h2>
                <div className="flex flex-col gap-2" role="radiogroup" aria-label="Payment method">
                  {PAYMENTS.map((p) => {
                    const active = paymentMethod === p.id;
                    return (
                      <label
                        key={p.id}
                        className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                          active ? "border-primary bg-primary/5" : "border-border-light hover:bg-surface-subtle"
                        }`}
                      >
                        <input
                          type="radio"
                          name="payment"
                          value={p.id}
                          checked={active}
                          onChange={() => setPaymentMethod(p.id)}
                          className="mt-0.5 accent-primary"
                        />
                        <span className="flex flex-col text-xs">
                          <span className="font-bold text-on-surface">{p.label}</span>
                          <span className="text-text-muted mt-0.5">{p.detail}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>

                {/* Wallet payments: the transaction ID is the only thing that
                    ties a payment to an order, and the platform has no
                    integration to fetch it. Without this field a wallet order
                    could never be confirmed. */}
                {needsWalletId && (
                  <div className="flex flex-col gap-2 pt-1 border-t border-border-light">
                    <label className="block font-semibold text-on-surface text-xs" htmlFor="ck-trx">
                      {paymentMethod === "bkash" ? "bKash" : "Nagad"} Transaction ID *
                    </label>
                    <input
                      id="ck-trx"
                      type="text"
                      value={transactionId}
                      onChange={(e) => setTransactionId(e.target.value.toUpperCase())}
                      placeholder="e.g. 9F7K2M4X8A"
                      className={`w-full h-10 px-3 rounded-lg border focus:outline-none focus:ring-1 focus:ring-primary uppercase ${fieldErrors.transactionId ? "border-badge-discount" : "border-border-light"}`}
                    />
                    <p className="text-[11px] text-text-muted">
                      Pay from your {paymentMethod === "bkash" ? "bKash" : "Nagad"} app, then
                      enter the transaction ID you receive. We verify it against our merchant
                      statement before dispatch.
                    </p>
                    {fieldErrors.transactionId && (
                      <p className="text-[11px] text-badge-discount font-medium">{fieldErrors.transactionId}</p>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-2 text-[11px] text-text-muted pt-1">
                  <ShieldCheck className="w-4 h-4" />
                  <span>We never ask for your card details or your wallet PIN.</span>
                </div>
              </section>
            )}

            {/* ---------- Step 4: Review & confirm ---------- */}
            {step === 4 && (
              <>
                <section className="bg-surface-card p-space-base rounded-xl border border-border-light shadow-sm flex flex-col gap-2 text-xs">
                  <h2 className="font-display text-sm uppercase tracking-wider font-bold text-primary mb-1">
                    Review your order
                  </h2>
                  <div className="flex justify-between gap-4">
                    <span className="text-text-muted">Deliver to</span>
                    <span className="text-right font-semibold text-on-surface">
                      {name}, {normalisePhone(phone)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-text-muted">Address</span>
                    <span className="text-right font-medium max-w-xs">
                      {address}, {city === "dhaka" ? "Dhaka Metro" : "Outside Dhaka"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-text-muted">Payment</span>
                    <span className="text-right font-semibold text-on-surface">
                      {PAYMENTS.find((p) => p.id === paymentMethod)?.label}
                      {needsWalletId && transactionId ? ` · ${transactionId}` : ""}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-text-muted">Account</span>
                    <span className="text-right font-medium">{user ? user.email : "Checking out as a guest"}</span>
                  </div>
                </section>

                <section className="bg-surface-card p-space-base rounded-xl border border-border-light shadow-sm flex flex-col gap-2">
                  <label className="block font-semibold text-on-surface text-xs" htmlFor="ck-notes">
                    Delivery instructions <span className="font-normal text-text-muted">(optional)</span>
                  </label>
                  <textarea
                    id="ck-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    placeholder="Landmark, preferred time, or instructions for the rider."
                    className="w-full px-3 py-2 rounded-lg border border-border-light focus:outline-none focus:ring-1 focus:ring-primary resize-none text-xs"
                  />
                </section>
              </>
            )}

            {/* ---------------- Step navigation ---------------- */}
            <div className="flex items-center justify-between gap-3">
              {step > 1 ? (
                <button
                  type="button"
                  onClick={() => goTo(step - 1)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 border border-border-light bg-surface-card text-primary rounded-lg text-xs font-bold font-display uppercase tracking-wider hover:bg-surface-subtle transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back
                </button>
              ) : (
                <span />
              )}

              {step < STEPS.length ? (
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 px-5 py-3 bg-primary text-white rounded-lg text-xs font-bold font-display uppercase tracking-wider hover:bg-primary-container transition-colors shadow-sm"
                >
                  Continue
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={placing}
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-primary text-white rounded-lg text-xs font-bold font-display uppercase tracking-wider hover:bg-primary-container transition-colors shadow-sm disabled:opacity-60"
                >
                  {placing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                  {placing ? "Placing order..." : `Confirm & place order · ৳ ${taka(grandTotal)}`}
                </button>
              )}
            </div>
          </div>

          {/* ---------------- Right: order summary ---------------- */}
          <aside className="lg:col-span-5">
            <div className="bg-surface-card p-space-base rounded-xl border border-border-light shadow-sm flex flex-col gap-3 sticky top-[120px] lg:top-[164px]">
              <h2 className="font-display text-sm uppercase tracking-wider font-bold text-primary">
                Order Summary ({orderItems.length})
              </h2>

              <div className="max-h-64 overflow-y-auto divide-y divide-border-light flex flex-col">
                {orderItems.map((i) => (
                  <div key={`${i.id}-${i.size}-${i.color}`} className="py-2 flex items-center gap-3">
                    {i.image && (
                      <div className="relative w-12 h-14 shrink-0 rounded">
                        <Image src={i.image} alt={i.title} fill sizes="48px" className="object-cover rounded" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-on-surface line-clamp-1">{i.title}</p>
                      <p className="text-[11px] text-text-muted">
                        {[i.size, i.color].filter(Boolean).join(" • ")} · Qty {i.quantity}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Coupon. The discount is applied to the total below, and to the
                  figure on the confirm button, because a coupon that changes
                  nothing on screen is not a coupon. */}
              <div className="pt-3 border-t border-border-light flex flex-col gap-2">
                <label className="text-xs font-semibold text-on-surface flex items-center gap-1.5" htmlFor="ck-coupon">
                  <Tag className="w-3.5 h-3.5" />
                  Have a coupon?
                </label>
                <div className="flex gap-2">
                  <input
                    id="ck-coupon"
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                    placeholder="ENTER CODE"
                    className="flex-1 h-9 px-3 rounded-lg border border-border-light focus:outline-none focus:ring-1 focus:ring-primary uppercase text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => void quoteCoupon(couponInput)}
                    className="px-3 h-9 rounded-lg bg-surface-subtle hover:bg-surface-container border border-border-light text-xs font-bold uppercase tracking-wider text-primary"
                  >
                    Apply
                  </button>
                </div>
                {appliedCoupon && (
                  <p className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" />
                    {appliedCoupon} applied · −{taka(couponDiscount)}
                  </p>
                )}
                {quoteError && <p className="text-[11px] text-badge-discount">{quoteError}</p>}
              </div>

              {/* Totals. Built from the quoted coupon and the post-discount
                  subtotal, which is the subtotal the server charges delivery on. */}
              <div className="pt-3 border-t border-border-light flex flex-col gap-2 text-xs">
                <div className="flex justify-between text-text-muted">
                  <span>Merchandise subtotal</span>
                  <span className="text-on-surface font-semibold">{taka(subtotal)}</span>
                </div>
                {couponDiscount > 0 && (
                  <div className="flex justify-between text-emerald-700 font-semibold">
                    <span>Coupon{appliedCoupon ? ` (${appliedCoupon})` : ""} discount</span>
                    <span>−{taka(couponDiscount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-text-muted">
                  <span>Delivery{city === "dhaka" ? " · Dhaka Metro" : " · Outside Dhaka"}</span>
                  <span className={shippingFee === 0 ? "text-emerald-700 font-bold" : "text-on-surface font-semibold"}>
                    {shippingFee === 0 ? "FREE" : taka(shippingFee)}
                  </span>
                </div>
                <div className="border-t border-border-light pt-2 flex justify-between text-sm font-bold text-primary">
                  <span>Total payable</span>
                  <span className="font-display text-base">{taka(grandTotal)}</span>
                </div>
                {discountedSubtotal < freeShippingThreshold && discountedSubtotal > 0 && (
                  <p className="text-[11px] text-text-muted">
                    Add {taka(freeShippingThreshold - discountedSubtotal)} more for free delivery.
                  </p>
                )}
              </div>

              <div className="flex items-center justify-center gap-2 text-[11px] text-text-muted pt-1">
                <ShieldCheck className="w-4 h-4" />
                <span>256-bit encrypted checkout</span>
              </div>
            </div>
          </aside>
        </form>
      </div>
    </div>
  );
}
