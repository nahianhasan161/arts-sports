"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, PauseCircle, Printer, ScanLine, Shirt, Ticket, Trash2, UserRound, Wallet, X, ShoppingCart, LayoutGrid, ImageOff, LifeBuoy } from "lucide-react";
import { useT } from "@/i18n/client";
import { taka, type CartLine, type PosProduct, type PosVariant } from "@/lib/pos/types";
import { OFFLINE, REGISTER } from "@/components/admin/nav";
import { LanguageToggle, ThemeToggle } from "@/components/layout/Preferences";
import { api, btnGhost, btnPrimary, field } from "../api";
import { DayTab, type SessionInfo } from "../DayTab";
import { CustomTab } from "../CustomTab";
import { Dialog, Numpad, applyKey, padSide, type PadKey } from "./parts";
import { PaymentScreen, type Pay } from "./PaymentScreen";

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

interface Done {
  sale_id: string;
  receipt_no: string;
  total: number;
  change_due: number;
}

interface Listing {
  products: PosProduct[];
  scanned: string | null;
  categories?: { id: string; name: string }[];
}

type Popup = "customer" | "discount" | "held" | "custom" | "drawer" | null;
type Mode = "qty" | "disc";

/**
 * The register (roadmap 4.1–4.3), full screen. Left: the bill with its
 * number pad and the Payment button. Right: categories and the product
 * grid; a barcode scan goes straight into the bill.
 */
export function Register() {
  const { t } = useT();
  const searchRef = useRef<HTMLInputElement>(null);
  const [info, setInfo] = useState<SessionInfo | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  // The shop chosen on the dashboard card (?shop=), used until a drawer is open.
  const [wantedShop, setWantedShop] = useState("");

  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const [products, setProducts] = useState<PosProduct[] | null>(null);
  const [picking, setPicking] = useState<PosProduct | null>(null);

  const [lines, setLines] = useState<CartLine[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("qty");
  // What has been typed on the pad for the selected line, so "1" then "2" gives 12.
  const [typed, setTyped] = useState<{ key: string; mode: Mode; text: string } | null>(null);

  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  // The customer found for a number, kept with that number so a changed number never shows the old match.
  const [lookup, setLookup] = useState<{ phone: string; customer: KnownCustomer | null } | null>(null);
  const known = lookup?.phone === phone ? lookup.customer : null;
  const [consent, setConsent] = useState(false);
  const [coupon, setCoupon] = useState("");
  const [couponOff, setCouponOff] = useState<{ code: string; amount: number } | null>(null);
  const [billDiscount, setBillDiscount] = useState("");
  const [note, setNote] = useState("");

  const [held, setHeld] = useState<Held[]>([]);
  const [heldId, setHeldId] = useState<string | null>(null);
  const [screen, setScreen] = useState<"bill" | "pay">("bill");
  const [pays, setPays] = useState<Pay[]>([]);
  const [done, setDone] = useState<Done | null>(null);
  const [popup, setPopup] = useState<Popup>(null);
  const [pane, setPane] = useState<"products" | "bill">("products"); // phones show one at a time
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openShop, setOpenShop] = useState("");
  const [float, setFloat] = useState("");

  const loadInfo = useCallback(async () => {
    const res = await api<SessionInfo>("/api/admin/pos/session");
    if (!res.ok) return setFatal(res.error);
    setFatal(null);
    setInfo(res.data);
  }, []);
  const loadHeld = useCallback(async () => {
    const res = await api<{ held: Held[] }>("/api/admin/pos/held");
    if (res.ok) setHeld(res.data.held);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setWantedShop(new URLSearchParams(window.location.search).get("shop") ?? "");
      void loadInfo();
      void loadHeld();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadInfo, loadHeld]);

  const sessionOpen = Boolean(info?.session);
  const showroomId = info?.session?.showroom_id ?? info?.showrooms.find((s) => s.id === wantedShop)?.id ?? info?.showrooms[0]?.id ?? "";
  const shopName = info?.showrooms.find((s) => s.id === showroomId)?.name ?? "";
  const maxDiscount = info?.max_discount_percent ?? 0;
  const canManage = info?.can_manage ?? false;

  const addLine = useCallback((p: PosProduct, v: PosVariant) => {
    const key = `${p.product_id}:${v.variant_id ?? ""}`;
    setError(null);
    setCouponOff(null);
    setPicking(null);
    setSelected(key);
    setMode("qty");
    setTyped(null);
    setLines((current) => {
      if (current.some((l) => l.key === key)) return current.map((l) => (l.key === key ? { ...l, quantity: l.quantity + 1 } : l));
      return [...current, { key, product_id: p.product_id, variant_id: v.variant_id, title: p.title, label: v.label, price: p.price, available: v.available, quantity: 1, discount: 0 }];
    });
  }, []);

  // The grid: the chosen category, or what the search box says. The newest answer wins.
  const request = useRef(0);
  const gotCategories = useRef(false);
  const list = useCallback(
    async (term: string, submitted: boolean) => {
      if (!showroomId) return;
      const mine = ++request.current;
      const params = new URLSearchParams({ showroom_id: showroomId });
      if (term) params.set("q", term);
      else if (category) params.set("category_id", category);
      if (!gotCategories.current) params.set("categories", "1");
      const res = await api<Listing>(`/api/admin/pos/products?${params}`);
      if (mine !== request.current) return;
      if (!res.ok) return setError(res.error);
      if (res.data.categories) {
        gotCategories.current = true;
        setCategories(res.data.categories);
      }
      // A barcode scan (the scanner presses Enter): straight into the bill, ready for the next scan.
      if (submitted && res.data.scanned) {
        const product = res.data.products.find((p) => p.variants.some((v) => v.variant_id === res.data.scanned));
        const variant = product?.variants.find((v) => v.variant_id === res.data.scanned);
        if (product && variant) {
          addLine(product, variant);
          setQ("");
          searchRef.current?.focus();
          return;
        }
      }
      setProducts(res.data.products);
    },
    [showroomId, category, addLine]
  );

  useEffect(() => {
    const term = q.trim();
    if (term.length === 1) return;
    const timer = setTimeout(() => void list(term, false), term ? 300 : 0);
    return () => clearTimeout(timer);
  }, [q, list]);

  // Phone number -> the customer we already know (website and shop share one list).
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
    return { subtotal, manual: lineDiscounts + bill, total: Math.round((afterLines - bill) * 100) / 100, pieces: lines.reduce((s, l) => s + l.quantity, 0) };
  }, [lines, couponOff, billDiscount]);
  const overLimit = !canManage && totals.manual > (totals.subtotal * maxDiscount) / 100 + 0.001;

  function reset() {
    setLines([]);
    setSelected(null);
    setTyped(null);
    setMode("qty");
    setPhone("");
    setName("");
    setLookup(null);
    setConsent(false);
    setCoupon("");
    setCouponOff(null);
    setBillDiscount("");
    setNote("");
    setPays([]);
    setHeldId(null);
    setError(null);
    setScreen("bill");
    setPane("products");
    setQ("");
    searchRef.current?.focus();
  }

  const setLine = (key: string, patch: Partial<CartLine>) => {
    setCouponOff(null);
    setLines((current) => current.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };
  const removeLine = (key: string) => {
    setCouponOff(null);
    setLines((current) => current.filter((l) => l.key !== key));
    setSelected((s) => (s === key ? null : s));
    setTyped(null);
  };

  function press(key: PadKey) {
    const line = lines.find((l) => l.key === selected);
    if (!line) return;
    const same = typed && typed.key === line.key && typed.mode === mode;
    // A digit starts a new number; backspace works on the number already there.
    const before = same ? typed.text : key === "back" ? String(mode === "qty" ? line.quantity : line.discount || "") : "";
    const text = applyKey(before, key);
    if (mode === "qty") {
      const quantity = Math.floor(Number(text) || 0);
      if (text === "" || quantity < 1) {
        if (key === "back" || key === "clear") return removeLine(line.key);
        return;
      }
      setLine(line.key, { quantity });
    } else {
      setLine(line.key, { discount: Math.max(0, Number(text) || 0) });
    }
    setTyped({ key: line.key, mode, text });
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
    setPopup(null);
    setPane("bill");
  }

  async function dropHeld(id: string) {
    await api(`/api/admin/pos/held?id=${id}`, undefined, "DELETE");
    if (heldId === id) setHeldId(null);
    void loadHeld();
  }

  function goToPay() {
    setError(null);
    // The usual case is cash for the exact amount: one tap on Validate finishes it.
    setPays([{ method: "cash", amount: String(totals.total), reference: "" }]);
    setScreen("pay");
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
      note,
      held_id: heldId,
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setDone(res.data);
    void loadHeld();
    // Stock on the cards has changed.
    void list(q.trim(), false);
  }

  async function openRegister() {
    setBusy(true);
    const res = await api("/api/admin/pos/session", { action: "open", showroom_id: openShop || showroomId, opening_float: Number(float) || 0 });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setError(null);
    setFloat("");
    await loadInfo();
  }

  if (fatal) {
    return (
      <div className="h-screen bg-surface flex flex-col items-center justify-center gap-4 p-6">
        <p className="text-sm text-badge-discount bg-badge-discount/10 rounded-lg p-3 max-w-xl">{fatal}</p>
        <Link href={OFFLINE} className={btnGhost}>
          <ArrowLeft className="w-4 h-4" /> {t("shop.register.backToShop")}
        </Link>
      </div>
    );
  }
  if (!info) return <div className="h-screen bg-surface flex items-center justify-center text-sm text-text-muted">{t("shop.common.loading")}</div>;

  const customerLabel = name || phone || t("shop.register.customer");
  const hasDiscount = Boolean(couponOff) || Number(billDiscount) > 0 || Boolean(note);
  const selectedLine = lines.find((l) => l.key === selected);

  const customerDialog = popup === "customer" && (
    <Dialog title={t("shop.register.customer")} onClose={() => setPopup(null)}>
      <div className="flex flex-col gap-3">
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t("shop.pos.customerPhone")} className={`${field} py-3 text-base`} inputMode="tel" autoFocus />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("shop.pos.customerName")} className={`${field} py-3 text-base`} />
        {phone.replace(/\D/g, "").length >= 11 && (
          <div className="text-sm flex flex-col gap-2">
            {known ? (
              <span className={known.is_blacklisted ? "text-badge-discount font-semibold" : "text-emerald-600"}>{known.is_blacklisted ? t("shop.pos.blacklisted") : t("shop.pos.returning", { amount: taka(known.stats?.total_spent ?? 0) })}</span>
            ) : (
              <span className="text-text-muted">{t("shop.pos.newCustomer")}</span>
            )}
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              {t("shop.pos.consent")}
            </label>
          </div>
        )}
        <p className="text-xs text-text-muted">{t("shop.register.customerShared")}</p>
        <div className="flex gap-2">
          <button
            type="button"
            className={`${btnGhost} flex-1`}
            onClick={() => {
              setPhone("");
              setName("");
              setLookup(null);
              setConsent(false);
            }}
          >
            {t("shop.sales.walkIn")}
          </button>
          <button type="button" className={`${btnPrimary} flex-1`} onClick={() => setPopup(null)}>
            {t("shop.register.done")}
          </button>
        </div>
      </div>
    </Dialog>
  );

  return (
    <div className="h-screen flex flex-col bg-surface overflow-hidden">
      {/* Top bar */}
      <header className="h-14 bg-rail text-rail-text flex items-center gap-2 px-2 sm:px-4 flex-shrink-0">
        <Link href={OFFLINE} className="inline-flex items-center gap-1.5 h-9 px-2.5 rounded-lg text-sm font-semibold hover:bg-white/10" title={t("shop.register.backToShop")}>
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden md:inline">{t("shop.register.backToShop")}</span>
        </Link>
        <div className="hidden sm:block leading-tight pl-2 border-l border-white/10 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{shopName}</p>
          <p className="text-[11px] text-rail-muted">{sessionOpen ? t("shop.register.open") : t("shop.register.closed")}</p>
        </div>

        <form
          className="relative flex-1 max-w-xl mx-auto"
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim()) void list(q.trim(), true);
          }}
        >
          <ScanLine className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-rail-muted" />
          <input
            ref={searchRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => setPane("products")}
            placeholder={t("shop.pos.searchPlaceholder")}
            className="w-full h-10 rounded-lg bg-white/10 border border-white/10 pl-9 pr-9 text-sm text-white placeholder:text-rail-muted focus:outline-none focus:border-accent-gold"
            autoComplete="off"
            autoFocus
          />
          {q && (
            <button type="button" onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-rail-muted hover:text-white" aria-label={t("shop.common.cancel")}>
              <X className="w-4 h-4" />
            </button>
          )}
        </form>

        <button type="button" onClick={() => setPopup("held")} className="relative inline-flex items-center gap-1.5 h-9 px-2.5 rounded-lg text-sm font-semibold hover:bg-white/10" title={t("shop.pos.heldBills")}>
          <PauseCircle className="w-4 h-4" />
          <span className="hidden lg:inline">{t("shop.pos.heldBills")}</span>
          {held.length > 0 && <span className="min-w-5 h-5 px-1 rounded-full bg-accent-gold text-rail text-[11px] font-bold flex items-center justify-center">{held.length}</span>}
        </button>
        <button type="button" onClick={() => setPopup("drawer")} className="inline-flex items-center gap-1.5 h-9 px-2.5 rounded-lg text-sm font-semibold hover:bg-white/10" title={t("shop.register.cashDrawer")}>
          <Wallet className="w-4 h-4" />
          <span className="hidden lg:inline">{t("shop.register.cashDrawer")}</span>
        </button>
        <a href={`${OFFLINE}/help`} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center h-9 w-9 rounded-lg hover:bg-white/10" title={t("admin.nav.shopHelp.name")} aria-label={t("admin.nav.shopHelp.name")}>
          <LifeBuoy className="w-4 h-4" />
        </a>
        <span className="hidden md:flex items-center gap-1">
          <LanguageToggle tone="dark" />
          <ThemeToggle tone="dark" />
        </span>
      </header>

      {done ? (
        <div className="flex-1 flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-md rounded-2xl border border-border-light bg-surface-card p-6 text-center flex flex-col gap-3">
            <h2 className="font-display text-xl font-bold text-primary">{t("shop.pos.saleDone", { no: done.receipt_no })}</h2>
            <p className="text-4xl font-bold tabular-nums">{taka(done.total)}</p>
            {done.change_due > 0 && <p className="text-lg font-semibold text-badge-discount">{t("shop.pos.changeToGive", { amount: taka(done.change_due) })}</p>}
            <div className="grid grid-cols-2 gap-2">
              <a className={btnGhost} href={`${REGISTER}/receipt/${done.sale_id}?size=thermal`} target="_blank" rel="noreferrer">
                <Printer className="w-4 h-4" /> {t("shop.pos.printThermal")}
              </a>
              <a className={btnGhost} href={`${REGISTER}/receipt/${done.sale_id}`} target="_blank" rel="noreferrer">
                <Printer className="w-4 h-4" /> {t("shop.pos.printA4")}
              </a>
            </div>
            <button
              type="button"
              className="h-14 rounded-xl bg-accent-gold text-white text-lg font-bold hover:opacity-90"
              autoFocus
              onClick={() => {
                setDone(null);
                reset();
              }}
            >
              {t("shop.pos.newSale")}
            </button>
          </div>
        </div>
      ) : screen === "pay" ? (
        <PaymentScreen total={totals.total} pays={pays} setPays={setPays} customerLabel={customerLabel} onCustomer={() => setPopup("customer")} onBack={() => setScreen("bill")} onValidate={complete} busy={busy} error={error} blocked={overLimit ? t("shop.pos.discountLimit", { percent: maxDiscount }) : null} />
      ) : (
        <div className="flex-1 min-h-0 flex">
          {/* The bill */}
          <section className={`${pane === "bill" ? "flex" : "hidden"} lg:flex w-full lg:w-[400px] xl:w-[440px] flex-col bg-surface-card border-r border-border-light flex-shrink-0`}>
            <div className="flex-1 min-h-0 overflow-y-auto">
              {lines.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center gap-2 text-text-muted p-6 text-center">
                  <ShoppingCart className="w-10 h-10 opacity-40" />
                  <p className="text-sm">{t("shop.pos.emptyCart")}</p>
                </div>
              ) : (
                <ul>
                  {lines.map((l) => {
                    const active = l.key === selected;
                    return (
                      <li key={l.key} className={`border-b border-border-light ${active ? "bg-accent-gold-soft" : ""}`}>
                        <div className="flex items-start gap-1 pr-1">
                          <button
                            type="button"
                            className="flex-1 min-w-0 text-left px-3 py-2.5"
                            onClick={() => {
                              setSelected(l.key);
                              setTyped(null);
                            }}
                          >
                            <span className="flex justify-between gap-2 text-sm">
                              <span className="font-semibold text-on-surface truncate">{l.title}</span>
                              <strong className="whitespace-nowrap tabular-nums">{taka(Math.max(0, l.price * l.quantity - l.discount))}</strong>
                            </span>
                            <span className="block text-xs text-text-muted mt-0.5">
                              <b className="text-on-surface">{l.quantity}</b> × {taka(l.price)}
                              {l.label && ` · ${l.label}`}
                              {l.discount > 0 && <span className="text-emerald-600"> · −{taka(l.discount)}</span>}
                              {l.quantity > l.available && <span className="text-badge-discount font-semibold"> · {t("shop.pos.left", { n: l.available })}</span>}
                            </span>
                          </button>
                          {active && (
                            <button type="button" onClick={() => removeLine(l.key)} className="mt-2 p-1.5 rounded text-text-muted hover:text-badge-discount" aria-label={t("shop.common.remove")}>
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="border-t border-border-light p-3 flex flex-col gap-2.5 flex-shrink-0">
              <div className="flex items-end justify-between">
                <div className="text-xs text-text-muted">
                  <p>{t("shop.register.pieces", { n: totals.pieces })}</p>
                  {couponOff && <p className="text-emerald-600">{t("shop.pos.couponOff", { code: couponOff.code })} −{taka(couponOff.amount)}</p>}
                  {totals.manual > 0 && <p className={overLimit ? "text-badge-discount font-semibold" : ""}>{t("shop.pos.discount")} −{taka(totals.manual)}</p>}
                </div>
                <p className="text-2xl font-bold text-primary tabular-nums">{taka(totals.total)}</p>
              </div>
              {overLimit && <p className="text-xs text-badge-discount">{t("shop.pos.discountLimit", { percent: maxDiscount })}</p>}
              {error && <p className="text-sm text-badge-discount bg-badge-discount/10 rounded p-2">{error}</p>}

              <div className="grid grid-cols-4 gap-1.5 text-xs font-semibold">
                {(
                  [
                    { id: "customer", icon: UserRound, label: name || phone || t("shop.register.customer"), on: Boolean(phone || name) },
                    { id: "discount", icon: Ticket, label: t("shop.register.offers"), on: hasDiscount },
                    { id: "hold", icon: PauseCircle, label: t("shop.pos.hold"), on: false },
                    { id: "custom", icon: Shirt, label: t("shop.pos.tabs.custom"), on: false },
                  ] as const
                ).map((a) => (
                  <button key={a.id} type="button" onClick={() => (a.id === "hold" ? void hold() : setPopup(a.id))} disabled={a.id === "hold" && !lines.length} className={`h-14 rounded-lg border flex flex-col items-center justify-center gap-1 px-1 disabled:opacity-40 ${a.on ? "border-accent-gold text-accent-gold bg-accent-gold-soft" : "border-border-light text-on-surface-variant bg-surface-card hover:bg-surface-subtle"}`}>
                    <a.icon className="w-4 h-4" />
                    <span className="truncate max-w-full">{a.label}</span>
                  </button>
                ))}
              </div>

              <Numpad
                onKey={press}
                disabled={!selectedLine}
                side={
                  <>
                    <button type="button" className={padSide(mode === "qty")} onClick={() => { setMode("qty"); setTyped(null); }}>
                      {t("shop.common.qty")}
                    </button>
                    <button type="button" className={padSide(mode === "disc")} onClick={() => { setMode("disc"); setTyped(null); }}>
                      {t("shop.register.disc")}
                    </button>
                    <button type="button" className={`${padSide(false)} row-span-2`} disabled={!lines.length} onClick={reset} title={t("shop.register.clearBill")}>
                      <Trash2 className="w-4 h-4 mx-auto" />
                    </button>
                  </>
                }
              />

              <button type="button" onClick={goToPay} disabled={!lines.length || !sessionOpen} className="h-14 rounded-xl bg-accent-gold text-white text-lg font-bold hover:opacity-90 disabled:opacity-40">
                {t("shop.register.payment")} · {taka(totals.total)}
              </button>
            </div>
          </section>

          {/* Products */}
          <section className={`${pane === "products" ? "flex" : "hidden"} lg:flex flex-1 min-w-0 flex-col`}>
            {!q && categories.length > 0 && (
              <div className="flex gap-2 overflow-x-auto no-scrollbar px-3 py-2.5 border-b border-border-light bg-surface-card flex-shrink-0">
                {[{ id: "", name: t("shop.register.all") }, ...categories].map((c) => (
                  <button key={c.id} type="button" onClick={() => setCategory(c.id)} className={`px-3.5 h-9 rounded-full text-sm font-semibold whitespace-nowrap ${category === c.id ? "bg-primary text-primary-foreground" : "bg-surface-subtle text-on-surface-variant hover:bg-surface-container"}`}>
                    {c.name}
                  </button>
                ))}
              </div>
            )}
            <div className="flex-1 overflow-y-auto p-3">
              {products === null ? (
                <p className="text-sm text-text-muted p-4">{t("shop.common.loading")}</p>
              ) : products.length === 0 ? (
                <p className="text-sm text-text-muted p-4">{q ? t("shop.pos.noResults") : t("shop.register.noProducts")}</p>
              ) : (
                <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2.5">
                  {products.map((p) => {
                    const stock = p.variants.reduce((s, v) => s + v.available, 0);
                    return (
                      <li key={p.product_id}>
                        <button
                          type="button"
                          onClick={() => (p.variants.length === 1 ? addLine(p, p.variants[0]) : setPicking(p))}
                          className={`w-full h-full text-left rounded-xl border border-border-light bg-surface-card overflow-hidden hover:border-accent-gold active:scale-[0.98] transition ${stock > 0 ? "" : "opacity-60"}`}
                        >
                          <span className="relative block aspect-square bg-surface-subtle">
                            {p.image ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={p.image} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                            ) : (
                              <ImageOff className="absolute inset-0 m-auto w-8 h-8 text-text-muted/40" />
                            )}
                            <span className="absolute top-1.5 right-1.5 rounded-md bg-rail/85 text-white text-xs font-bold px-1.5 py-0.5 tabular-nums">{taka(p.price)}</span>
                            <span className={`absolute bottom-1.5 left-1.5 rounded-md text-[11px] font-semibold px-1.5 py-0.5 ${stock > 0 ? "bg-surface-card/90 text-on-surface" : "bg-badge-discount text-white"}`}>{stock > 0 ? t("shop.pos.left", { n: stock }) : t("shop.register.soldOut")}</span>
                          </span>
                          <span className="block px-2 py-1.5 text-xs sm:text-sm font-semibold text-on-surface leading-snug line-clamp-2">{p.title}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        </div>
      )}

      {/* Phones: switch between the products and the bill. */}
      {!done && screen === "bill" && (
        <div className="lg:hidden grid grid-cols-2 border-t border-border-light bg-surface-card flex-shrink-0">
          <button type="button" onClick={() => setPane("products")} className={`h-12 flex items-center justify-center gap-2 text-sm font-semibold ${pane === "products" ? "text-accent-gold" : "text-on-surface-variant"}`}>
            <LayoutGrid className="w-4 h-4" /> {t("shop.register.products")}
          </button>
          <button type="button" onClick={() => setPane("bill")} className={`h-12 flex items-center justify-center gap-2 text-sm font-semibold ${pane === "bill" ? "text-accent-gold" : "text-on-surface-variant"}`}>
            <ShoppingCart className="w-4 h-4" /> {t("shop.pos.cart")} · {taka(totals.total)}
            {totals.pieces > 0 && <span className="min-w-5 h-5 px-1 rounded-full bg-accent-gold text-white text-[11px] font-bold flex items-center justify-center">{totals.pieces}</span>}
          </button>
        </div>
      )}

      {/* Size / colour of the tapped product */}
      {picking && (
        <Dialog title={picking.title} onClose={() => setPicking(null)}>
          <p className="text-sm text-text-muted mb-3">
            {t("shop.register.chooseVariant")} · <b className="text-on-surface">{taka(picking.price)}</b>
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {picking.variants.map((v) => (
              <button key={v.variant_id ?? "one"} type="button" onClick={() => addLine(picking, v)} title={v.sku ?? v.barcode ?? undefined} className={`rounded-xl border p-3 text-left ${v.available > 0 ? "border-border-light hover:border-accent-gold" : "border-border-light opacity-50"}`}>
                <span className="block text-sm font-bold text-on-surface">{v.label || t("shop.common.add")}</span>
                <span className={`block text-xs ${v.available > 0 ? "text-text-muted" : "text-badge-discount"}`}>{v.available > 0 ? t("shop.pos.left", { n: v.available }) : t("shop.register.soldOut")}</span>
              </button>
            ))}
          </div>
        </Dialog>
      )}

      {customerDialog}

      {popup === "discount" && (
        <Dialog title={t("shop.register.offers")} onClose={() => setPopup(null)}>
          <div className="flex flex-col gap-3">
            <label className="text-sm font-semibold flex flex-col gap-1">
              {t("shop.pos.coupon")}
              <span className="flex gap-2">
                <input
                  value={coupon}
                  onChange={(e) => {
                    setCoupon(e.target.value.toUpperCase());
                    setCouponOff(null);
                  }}
                  className={`${field} font-normal`}
                />
                <button type="button" className={btnGhost} onClick={applyCoupon} disabled={!coupon.trim() || !lines.length}>
                  {t("shop.pos.apply")}
                </button>
              </span>
            </label>
            {couponOff && <p className="text-sm text-emerald-600">{t("shop.pos.couponOff", { code: couponOff.code })}: −{taka(couponOff.amount)}</p>}
            <label className="text-sm font-semibold flex flex-col gap-1">
              {t("shop.pos.billDiscount")}
              <input value={billDiscount} onChange={(e) => setBillDiscount(e.target.value)} className={`${field} font-normal`} inputMode="decimal" />
            </label>
            {!canManage && <p className="text-xs text-text-muted">{t("shop.pos.discountLimit", { percent: maxDiscount })}</p>}
            <label className="text-sm font-semibold flex flex-col gap-1">
              {t("shop.common.note")}
              <input value={note} onChange={(e) => setNote(e.target.value)} className={`${field} font-normal`} maxLength={500} />
            </label>
            {error && <p className="text-sm text-badge-discount">{error}</p>}
            <button type="button" className={btnPrimary} onClick={() => setPopup(null)}>
              {t("shop.register.done")}
            </button>
          </div>
        </Dialog>
      )}

      {popup === "held" && (
        <Dialog title={t("shop.pos.heldBills")} onClose={() => setPopup(null)}>
          {held.length === 0 ? (
            <p className="text-sm text-text-muted">{t("shop.register.noHeld")}</p>
          ) : (
            <ul className="divide-y divide-border-light">
              {held.map((h) => {
                const sum = (h.payload.lines ?? []).reduce((s, l) => s + l.price * l.quantity - l.discount, 0);
                return (
                  <li key={h.id} className="flex items-center gap-2 py-2">
                    <button type="button" className="flex-1 text-left min-w-0" onClick={() => resume(h)}>
                      <span className="block text-sm font-semibold truncate">{h.label || t("shop.sales.walkIn")}</span>
                      <span className="block text-xs text-text-muted">
                        {t("shop.register.pieces", { n: (h.payload.lines ?? []).reduce((s, l) => s + l.quantity, 0) })} · {taka(sum)}
                      </span>
                    </button>
                    <button type="button" className={btnPrimary} onClick={() => resume(h)}>
                      {t("shop.register.resume")}
                    </button>
                    <button type="button" className="p-2 text-text-muted hover:text-badge-discount" onClick={() => void dropHeld(h.id)} aria-label={t("shop.common.remove")}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Dialog>
      )}

      {popup === "custom" && (
        <Dialog title={t("shop.pos.tabs.custom")} onClose={() => setPopup(null)} wide>
          <CustomTab />
        </Dialog>
      )}

      {popup === "drawer" && sessionOpen && (
        <Dialog title={t("shop.register.cashDrawer")} onClose={() => setPopup(null)} wide>
          <DayTab info={info} reload={loadInfo} />
        </Dialog>
      )}

      {/* Nothing can be sold until the drawer is counted and opened. */}
      {!sessionOpen && (
        <Dialog title={t("shop.day.openTitle")}>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-text-muted">{t("shop.register.openHint")}</p>
            {info.showrooms.length === 0 && <p className="text-sm text-badge-discount">{t("admin.store.noShops")}</p>}
            {info.showrooms.length > 1 && (
              <select value={openShop || showroomId} onChange={(e) => setOpenShop(e.target.value)} className={`${field} py-3 text-base`}>
                {info.showrooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            )}
            <label className="text-sm font-semibold flex flex-col gap-1">
              {t("shop.day.openingFloat")}
              <input value={float} onChange={(e) => setFloat(e.target.value)} className={`${field} py-3 text-lg font-normal`} inputMode="decimal" placeholder="0" autoFocus />
            </label>
            {error && <p className="text-sm text-badge-discount">{error}</p>}
            <button type="button" className="h-12 rounded-xl bg-accent-gold text-white font-bold hover:opacity-90 disabled:opacity-40" disabled={busy || info.showrooms.length === 0} onClick={openRegister}>
              {t("shop.register.openRegister")}
            </button>
            <Link href={OFFLINE} className={btnGhost}>
              <ArrowLeft className="w-4 h-4" /> {t("shop.register.backToShop")}
            </Link>
          </div>
        </Dialog>
      )}
    </div>
  );
}
