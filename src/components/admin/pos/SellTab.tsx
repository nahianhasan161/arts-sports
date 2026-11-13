"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Minus, PauseCircle, Plus, Printer, ScanLine, Trash2, X } from "lucide-react";
import { useT } from "@/i18n/client";
import { PAY_METHODS, taka, type CartLine, type PayMethod, type PosProduct, type PosVariant } from "@/lib/pos/types";
import { api, btnGhost, btnPrimary, card, field } from "./api";

interface Held {
  id: string;
  label: string;
  payload: { lines: CartLine[]; phone: string; name: string; billDiscount: string; coupon: string };
}

interface KnownCustomer {
  id: string;
  name: string | null;
  marketing_consent: boolean;
  is_blacklisted: boolean;
  stats: { total_spent: number; last_purchase_at: string | null } | null;
}

interface Pay {
  method: PayMethod;
  amount: string;
  reference: string;
}

interface Done {
  sale_id: string;
  receipt_no: string;
  total: number;
  change_due: number;
}

export function SellTab({ sessionOpen, showroomId, maxDiscount, canManage, onGoToDay }: { sessionOpen: boolean; showroomId: string; maxDiscount: number; canManage: boolean; onGoToDay: () => void }) {
  const { t } = useT();
  const searchRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PosProduct[]>([]);
  const [searched, setSearched] = useState(false);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  // The customer found for a number, kept with that number so a changed number never shows the old match.
  const [lookup, setLookup] = useState<{ phone: string; customer: KnownCustomer | null } | null>(null);
  const known = lookup?.phone === phone ? lookup.customer : null;
  const [consent, setConsent] = useState(false);
  const [coupon, setCoupon] = useState("");
  const [couponOff, setCouponOff] = useState<{ code: string; amount: number } | null>(null);
  const [billDiscount, setBillDiscount] = useState("");
  const [pays, setPays] = useState<Pay[]>([{ method: "cash", amount: "", reference: "" }]);
  const [held, setHeld] = useState<Held[]>([]);
  const [heldId, setHeldId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Done | null>(null);

  const loadHeld = useCallback(async () => {
    const res = await api<{ held: Held[] }>("/api/admin/pos/held");
    if (res.ok) setHeld(res.data.held);
  }, []);
  useEffect(() => {
    searchRef.current?.focus();
    const timer = setTimeout(() => void loadHeld(), 0);
    return () => clearTimeout(timer);
  }, [loadHeld]);

  const addLine = useCallback((p: PosProduct, v: PosVariant) => {
    setError(null);
    setCouponOff(null);
    setLines((current) => {
      const key = `${p.product_id}:${v.variant_id ?? ""}`;
      const found = current.find((l) => l.key === key);
      if (found) return current.map((l) => (l.key === key ? { ...l, quantity: l.quantity + 1 } : l));
      return [...current, { key, product_id: p.product_id, variant_id: v.variant_id, title: p.title, label: v.label, price: p.price, available: v.available, quantity: 1, discount: 0 }];
    });
  }, []);

  async function search(text: string) {
    const term = text.trim();
    if (!term) return;
    const res = await api<{ products: PosProduct[]; scanned: string | null }>(`/api/admin/pos/products?q=${encodeURIComponent(term)}&showroom_id=${encodeURIComponent(showroomId)}`);
    if (!res.ok) return setError(res.error);
    setSearched(true);
    // A barcode scan: straight into the bill, ready for the next scan.
    if (res.data.scanned) {
      const product = res.data.products.find((p) => p.variants.some((v) => v.variant_id === res.data.scanned));
      const variant = product?.variants.find((v) => v.variant_id === res.data.scanned);
      if (product && variant) {
        addLine(product, variant);
        setQ("");
        setResults([]);
        setSearched(false);
        searchRef.current?.focus();
        return;
      }
    }
    setResults(res.data.products);
  }

  // Phone number -> the customer we already know.
  useEffect(() => {
    if (phone.replace(/\D/g, "").length < 11) return;
    let cancelled = false;
    void api<{ customer: KnownCustomer | null }>(`/api/admin/pos/customer?phone=${encodeURIComponent(phone)}`).then((res) => {
      if (cancelled || !res.ok) return;
      setLookup({ phone, customer: res.data.customer });
      if (res.data.customer?.name) setName((n) => n || res.data.customer?.name || "");
      if (res.data.customer?.marketing_consent) setConsent(true);
    });
    return () => {
      cancelled = true;
    };
  }, [phone]);

  const totals = useMemo(() => {
    const subtotal = lines.reduce((s, l) => s + l.price * l.quantity, 0);
    const lineDiscounts = lines.reduce((s, l) => s + Math.min(l.discount, l.price * l.quantity), 0);
    const couponAmount = couponOff?.amount ?? 0;
    const afterLines = Math.max(0, subtotal - lineDiscounts - couponAmount);
    const bill = Math.min(Math.max(0, Number(billDiscount) || 0), afterLines);
    const total = Math.round((afterLines - bill) * 100) / 100;
    const paid = pays.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    return { subtotal, manual: lineDiscounts + bill, couponAmount, total, paid, remaining: Math.max(0, total - paid), change: Math.max(0, paid - total) };
  }, [lines, couponOff, billDiscount, pays]);

  const overLimit = !canManage && totals.manual > (totals.subtotal * maxDiscount) / 100 + 0.001;

  function reset() {
    setLines([]);
    setPhone("");
    setName("");
    setLookup(null);
    setConsent(false);
    setCoupon("");
    setCouponOff(null);
    setBillDiscount("");
    setPays([{ method: "cash", amount: "", reference: "" }]);
    setHeldId(null);
    setError(null);
    setResults([]);
    setSearched(false);
    setQ("");
    searchRef.current?.focus();
  }

  async function applyCoupon() {
    if (!coupon.trim() || !lines.length) return;
    const res = await api<{ code: string; discount_amount: number }>("/api/admin/pos/sales", { preview: true, coupon_code: coupon, items: lines.map((l) => ({ product_id: l.product_id, variant_id: l.variant_id, quantity: l.quantity })) });
    if (!res.ok) {
      setCouponOff(null);
      return setError(res.error);
    }
    setError(null);
    setCouponOff({ code: res.data.code, amount: res.data.discount_amount });
  }

  async function hold() {
    if (!lines.length) return;
    const res = await api("/api/admin/pos/held", { label: name || phone || "", payload: { lines, phone, name, billDiscount, coupon } });
    if (!res.ok) return setError(res.error);
    if (heldId) await api(`/api/admin/pos/held?id=${heldId}`, undefined, "DELETE");
    reset();
    void loadHeld();
  }

  function resume(h: Held) {
    reset();
    setLines(h.payload.lines ?? []);
    setPhone(h.payload.phone ?? "");
    setName(h.payload.name ?? "");
    setBillDiscount(h.payload.billDiscount ?? "");
    setCoupon(h.payload.coupon ?? "");
    setHeldId(h.id);
  }

  async function complete() {
    setBusy(true);
    setError(null);
    const res = await api<Done>("/api/admin/pos/sales", {
      items: lines.map((l) => ({ product_id: l.product_id, variant_id: l.variant_id, quantity: l.quantity, discount: l.discount })),
      payments: pays.map((p) => ({ method: p.method, amount: Number(p.amount) || 0, reference: p.reference })),
      customer_phone: phone,
      customer_name: name,
      marketing_consent: consent,
      coupon_code: couponOff ? couponOff.code : "",
      bill_discount: Number(billDiscount) || 0,
      held_id: heldId,
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setDone(res.data);
    void loadHeld();
  }

  const setLine = (key: string, patch: Partial<CartLine>) => {
    setCouponOff(null);
    setLines((current) => current.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };
  const setPay = (i: number, patch: Partial<Pay>) => setPays((current) => current.map((p, n) => (n === i ? { ...p, ...patch } : p)));

  if (done) {
    return (
      <div className={`${card} max-w-md mx-auto p-6 text-center flex flex-col gap-3`}>
        <h3 className="font-display text-xl font-bold text-primary">{t("shop.pos.saleDone", { no: done.receipt_no })}</h3>
        <p className="text-3xl font-bold">{taka(done.total)}</p>
        {done.change_due > 0 && <p className="text-lg font-semibold text-badge-discount">{t("shop.pos.changeToGive", { amount: taka(done.change_due) })}</p>}
        <div className="flex gap-2 justify-center flex-wrap">
          <a className={btnGhost} href={`/admin/pos/receipt/${done.sale_id}`} target="_blank" rel="noreferrer">
            <Printer className="w-4 h-4" /> {t("shop.pos.printA4")}
          </a>
          <a className={btnGhost} href={`/admin/pos/receipt/${done.sale_id}?size=thermal`} target="_blank" rel="noreferrer">
            <Printer className="w-4 h-4" /> {t("shop.pos.printThermal")}
          </a>
        </div>
        <button
          className={btnPrimary}
          autoFocus
          onClick={() => {
            setDone(null);
            reset();
          }}
        >
          {t("shop.pos.newSale")}
        </button>
      </div>
    );
  }

  return (
    <div className="grid lg:grid-cols-[1fr_420px] gap-4 items-start">
      {/* Find products */}
      <section className="flex flex-col gap-3 min-w-0">
        {!sessionOpen && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 text-amber-900 text-sm p-3 flex items-center justify-between gap-3">
            <span>{t("shop.pos.drawerClosed")}</span>
            <button className={btnGhost} onClick={onGoToDay}>
              {t("shop.pos.goToDay")}
            </button>
          </div>
        )}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void search(q);
          }}
        >
          <div className="relative flex-1">
            <ScanLine className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("shop.pos.searchPlaceholder")} className={`${field} pl-9 py-3 text-base`} autoComplete="off" />
          </div>
          <button className={btnPrimary}>{t("shop.common.search")}</button>
        </form>

        {held.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center text-xs">
            <span className="text-text-muted font-semibold">{t("shop.pos.heldBills")}:</span>
            {held.map((h) => (
              <button key={h.id} className={`${btnGhost} !py-1 !px-2 text-xs ${heldId === h.id ? "!border-primary" : ""}`} onClick={() => resume(h)}>
                {h.label} · {h.payload.lines?.length ?? 0}
              </button>
            ))}
          </div>
        )}

        {searched && results.length === 0 && <p className="text-sm text-text-muted">{t("shop.pos.noResults")}</p>}
        <ul className="grid sm:grid-cols-2 gap-2">
          {results.map((p) => (
            <li key={p.product_id} className={`${card} p-3 flex gap-3`}>
              {p.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.image} alt="" className="w-14 h-14 rounded object-cover bg-surface-subtle flex-shrink-0" />
              ) : (
                <div className="w-14 h-14 rounded bg-surface-subtle flex-shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">{p.title}</p>
                <p className="text-sm text-primary font-bold">
                  {taka(p.price)} {p.base_price > p.price && <s className="text-text-muted font-normal text-xs">{taka(p.base_price)}</s>}
                </p>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {p.variants.map((v) => (
                    <button
                      key={v.variant_id ?? "one"}
                      onClick={() => addLine(p, v)}
                      className={`px-2 py-1 rounded border text-xs font-semibold ${v.available > 0 ? "border-primary text-primary hover:bg-primary hover:text-primary-foreground" : "border-border-light text-text-muted"}`}
                      title={v.sku ?? v.barcode ?? undefined}
                    >
                      {v.label || t("shop.common.add")} · {v.available > 0 ? t("shop.pos.left", { n: v.available }) : t("shop.pos.outOfStock")}
                    </button>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* The bill */}
      <section className={`${card} p-3 flex flex-col gap-3`}>
        <div className="flex items-center justify-between">
          <h3 className="font-display font-bold text-primary">{t("shop.pos.cart")}</h3>
          <div className="flex gap-1.5">
            <button className={`${btnGhost} !py-1 text-xs`} onClick={hold} disabled={!lines.length} title={t("shop.pos.hold")}>
              <PauseCircle className="w-4 h-4" /> {t("shop.pos.hold")}
            </button>
            <button className={`${btnGhost} !py-1 text-xs`} onClick={reset} disabled={!lines.length}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {lines.length === 0 ? (
          <p className="text-sm text-text-muted py-6 text-center">{t("shop.pos.emptyCart")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border-light">
            {lines.map((l) => (
              <li key={l.key} className="py-2 flex flex-col gap-1.5">
                <div className="flex justify-between gap-2 text-sm">
                  <span className="min-w-0">
                    <span className="font-semibold">{l.title}</span>
                    {l.label && <span className="text-text-muted"> · {l.label}</span>}
                  </span>
                  <strong className="whitespace-nowrap">{taka(Math.max(0, l.price * l.quantity - l.discount))}</strong>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <button className="p-1 rounded border border-border-light" onClick={() => (l.quantity > 1 ? setLine(l.key, { quantity: l.quantity - 1 }) : setLines((c) => c.filter((x) => x.key !== l.key)))}>
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <input value={l.quantity} onChange={(e) => setLine(l.key, { quantity: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} className="w-12 text-center border border-border-light rounded py-1 bg-surface-subtle" inputMode="numeric" />
                  <button className="p-1 rounded border border-border-light" onClick={() => setLine(l.key, { quantity: l.quantity + 1 })}>
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-text-muted">× {taka(l.price)}</span>
                  {l.quantity > l.available && <span className="text-badge-discount font-semibold">{t("shop.pos.left", { n: l.available })}</span>}
                  <label className="ml-auto flex items-center gap-1 text-text-muted">
                    −৳
                    <input value={l.discount || ""} onChange={(e) => setLine(l.key, { discount: Math.max(0, Number(e.target.value) || 0) })} placeholder={t("shop.pos.lineDiscount")} className="w-16 border border-border-light rounded py-1 px-1.5 bg-surface-subtle" inputMode="decimal" />
                  </label>
                  <button className="p-1 text-text-muted hover:text-badge-discount" onClick={() => setLines((c) => c.filter((x) => x.key !== l.key))} title={t("shop.common.remove")}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Customer */}
        <div className="grid grid-cols-2 gap-2">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t("shop.pos.customerPhone")} className={field} inputMode="tel" />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("shop.pos.customerName")} className={field} />
          {phone.replace(/\D/g, "").length >= 11 && (
            <div className="col-span-2 text-xs flex flex-col gap-1">
              {known ? (
                <span className={known.is_blacklisted ? "text-badge-discount font-semibold" : "text-green-700"}>
                  {known.is_blacklisted ? t("shop.pos.blacklisted") : t("shop.pos.returning", { amount: taka(known.stats?.total_spent ?? 0) })}
                </span>
              ) : (
                <span className="text-text-muted">{t("shop.pos.newCustomer")}</span>
              )}
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                {t("shop.pos.consent")}
              </label>
            </div>
          )}
        </div>

        {/* Coupon and bill discount */}
        <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
          <input
            value={coupon}
            onChange={(e) => {
              setCoupon(e.target.value.toUpperCase());
              setCouponOff(null);
            }}
            placeholder={t("shop.pos.coupon")}
            className={field}
          />
          <button className={btnGhost} onClick={applyCoupon} disabled={!coupon.trim() || !lines.length}>
            {t("shop.pos.apply")}
          </button>
          <input value={billDiscount} onChange={(e) => setBillDiscount(e.target.value)} placeholder={t("shop.pos.billDiscount")} className={field} inputMode="decimal" />
        </div>

        <dl className="text-sm flex flex-col gap-1 border-t border-border-light pt-2">
          <div className="flex justify-between">
            <dt className="text-text-muted">{t("shop.pos.subtotal")}</dt>
            <dd>{taka(totals.subtotal)}</dd>
          </div>
          {couponOff && (
            <div className="flex justify-between text-green-700">
              <dt>{t("shop.pos.couponOff", { code: couponOff.code })}</dt>
              <dd>−{taka(couponOff.amount)}</dd>
            </div>
          )}
          {totals.manual > 0 && (
            <div className={`flex justify-between ${overLimit ? "text-badge-discount font-semibold" : ""}`}>
              <dt>{t("shop.pos.discount")}</dt>
              <dd>−{taka(totals.manual)}</dd>
            </div>
          )}
          {overLimit && <p className="text-xs text-badge-discount">{t("shop.pos.discountLimit", { percent: maxDiscount })}</p>}
          <div className="flex justify-between text-xl font-bold text-primary">
            <dt>{t("shop.pos.toPay")}</dt>
            <dd>{taka(totals.total)}</dd>
          </div>
        </dl>

        {/* Payment */}
        <div className="flex flex-col gap-2">
          {pays.map((p, i) => (
            <div key={i} className="grid grid-cols-[110px_1fr_1fr_auto] gap-1.5 items-center">
              <select value={p.method} onChange={(e) => setPay(i, { method: e.target.value as PayMethod })} className={field}>
                {PAY_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {t(`shop.method.${m}`)}
                  </option>
                ))}
              </select>
              <input value={p.amount} onChange={(e) => setPay(i, { amount: e.target.value })} placeholder={t("shop.common.amount")} className={field} inputMode="decimal" />
              <input value={p.reference} onChange={(e) => setPay(i, { reference: e.target.value })} placeholder={p.method === "cash" ? "" : t("shop.pos.reference")} className={field} disabled={p.method === "cash"} />
              <button className="p-1 text-text-muted disabled:opacity-30" disabled={pays.length === 1} onClick={() => setPays((c) => c.filter((_, n) => n !== i))}>
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          <div className="flex gap-2 text-xs">
            <button className={`${btnGhost} !py-1 text-xs`} onClick={() => setPays((c) => c.map((p, n) => (n === c.length - 1 ? { ...p, amount: String(Math.round((totals.remaining + (Number(p.amount) || 0)) * 100) / 100) } : p)))} disabled={!lines.length}>
              {t("shop.pos.exact")}
            </button>
            <button className={`${btnGhost} !py-1 text-xs`} onClick={() => setPays((c) => [...c, { method: "bkash", amount: totals.remaining ? String(totals.remaining) : "", reference: "" }])} disabled={pays.length >= 4}>
              <Plus className="w-3.5 h-3.5" /> {t("shop.pos.addPayment")}
            </button>
            <span className="ml-auto self-center font-semibold">
              {totals.remaining > 0 ? <span className="text-badge-discount">{t("shop.pos.remaining", { amount: taka(totals.remaining) })}</span> : totals.change > 0 ? <span className="text-green-700">{t("shop.pos.change", { amount: taka(totals.change) })}</span> : null}
            </span>
          </div>
        </div>

        {error && <p className="text-sm text-badge-discount bg-badge-discount/10 rounded p-2">{error}</p>}

        <button className={`${btnPrimary} !py-3 text-base`} disabled={busy || !lines.length || !sessionOpen || totals.remaining > 0 || overLimit} onClick={complete}>
          {busy ? t("shop.common.saving") : t("shop.pos.complete", { amount: taka(totals.total) })}
        </button>
      </section>
    </div>
  );
}
