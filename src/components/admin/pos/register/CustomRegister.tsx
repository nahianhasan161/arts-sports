"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, LayoutGrid, ListOrdered, Palette, Printer, Search, Shirt, UserRound } from "lucide-react";
import { useT } from "@/i18n/client";
import { taka, type PayMethod } from "@/lib/pos/types";
import { advanceFor, estimate } from "@/lib/custom-jersey/pricing";
import { SIZES, SPORTS, orderTotal, type Collar, type CustomJerseyConfig, type RosterRow, type Sleeve, type UploadedFile } from "@/lib/custom-jersey/types";
import { RosterEditor } from "@/components/custom-jersey/RosterEditor";
import { api, btnGhost, btnPrimary, field } from "../api";
import { CustomTab } from "../CustomTab";
import { Dialog, OrderPad, applyKey, type OrderMode, type PadKey } from "./parts";
import { PaymentScreen, type Pay } from "./PaymentScreen";
import { DesignRefs, MAX_REFS, type DesignRef } from "./DesignRefs";
import type { DesignRow } from "@/lib/custom-jersey/designs";
import { CustomerInput } from "@/components/admin/pickers";

/** The custom-order API takes these (no "other"). */
const METHODS: readonly PayMethod[] = ["cash", "card", "bkash", "nagad"];
type Size = (typeof SIZES)[number];
type Popup = "customer" | "design" | "delivery" | "list" | null;
const EXTRAS = [
  ["with_names", "names"],
  ["with_numbers", "numbers"],
  ["with_logo", "logo"],
  ["with_shorts", "shorts"],
] as const;
type Extras = Record<(typeof EXTRAS)[number][0], boolean>;
const NO_EXTRAS: Extras = { with_names: false, with_numbers: false, with_logo: false, with_shorts: false };
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * A custom jersey order in the register's layout, so staff learn one screen:
 * tiles on the right (sport, fabric, style, sizes), the order slip and the
 * number pad on the left, then the same payment screen as a sale. The price
 * is the website's estimate; the server works it out again.
 */
export function CustomRegister() {
  const { t, locale } = useT();
  const [mode, setMode] = useState<"new" | "find">("new");
  const [config, setConfig] = useState<CustomJerseyConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<{ id: string; number: string; warning: string | null; paid: number } | null>(null);
  const [popup, setPopup] = useState<Popup>(null);
  const [pane, setPane] = useState<"tiles" | "slip">("tiles");
  const [screen, setScreen] = useState<"slip" | "pay">("slip");

  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [sport, setSport] = useState<(typeof SPORTS)[number]>("football");
  const [fabricId, setFabricId] = useState("");
  const [sleeve, setSleeve] = useState<Sleeve>("short");
  const [collar, setCollar] = useState<Collar>("round");
  const [extras, setExtras] = useState<Extras>(NO_EXTRAS);
  const [counts, setCounts] = useState<Partial<Record<Size, number>>>({});
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [selected, setSelected] = useState<Size | null>(null);
  const [padMode, setPadMode] = useState<OrderMode>("qty");
  const [typed, setTyped] = useState<string | null>(null);
  const [neededBy, setNeededBy] = useState("");
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<DesignRef[]>([]);
  const [uploading, setUploading] = useState(false);
  const [delivery, setDelivery] = useState<"pickup" | "delivery">("pickup");
  const [zone, setZone] = useState<"dhaka" | "outside">("dhaka");
  const [address, setAddress] = useState("");
  const [confirm, setConfirm] = useState<"now" | "later">("now");
  const [price, setPrice] = useState("");
  const [take, setTake] = useState<"advance" | "full">("advance");
  const [pays, setPays] = useState<Pay[]>([]);

  useEffect(() => {
    void api<CustomJerseyConfig>("/api/custom-jersey/config").then((res) => {
      if (!res.ok) return setError(res.error);
      setConfig(res.data);
      setFabricId((f) => f || res.data.fabrics[0]?.id || "");
    });
  }, []);

  // Opened from the design catalogue with ?designs=a,b: those designs start on the slip.
  useEffect(() => {
    const ids = new URLSearchParams(window.location.search).get("designs");
    if (!ids) return;
    window.history.replaceState(null, "", window.location.pathname);
    void api<{ designs: DesignRow[] }>(`/api/admin/pos/designs?ids=${encodeURIComponent(ids)}`).then((res) => {
      if (!res.ok) return setError(res.error);
      setFiles((l) => [
        ...l,
        ...res.data.designs
          .filter((d) => d.image_url && !l.some((r) => r.design_id === d.id))
          .slice(0, MAX_REFS - l.length)
          .map((d) => ({ path: d.image_url, name: d.title || d.caption || "design", mime: "image/*", size: 0, kind: "reference" as const, design_id: d.id, preview: d.image_url })),
      ]);
      setPane("slip");
    });
  }, []);

  // A known customer's name fills in from their number.
  useEffect(() => {
    if (!/^01\d{9}$/.test(phone)) return;
    let cancelled = false;
    void api<{ customer: { name: string | null } | null }>(`/api/admin/pos/customer?phone=${phone}`).then((res) => {
      if (!cancelled && res.ok && res.data.customer?.name) setName((n) => n || res.data.customer!.name!);
    });
    return () => {
      cancelled = true;
    };
  }, [phone]);

  // With a names list, the list decides the sizes; otherwise the counts do.
  const usingList = roster.length > 0;
  const sizedRoster: RosterRow[] = useMemo(() => {
    if (usingList) return roster.filter((r) => r.size);
    return SIZES.flatMap((size) => Array.from({ length: Math.max(0, Math.min(500, counts[size] ?? 0)) }, () => ({ player_name: "", player_number: "", size, sleeve })));
  }, [usingList, roster, counts, sleeve]);
  const perSize = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of sizedRoster) m.set(r.size, (m.get(r.size) ?? 0) + 1);
    return m;
  }, [sizedRoster]);
  const slipLines = SIZES.filter((s) => (perSize.get(s) ?? 0) > 0);

  const fabric = config?.fabrics.find((f) => f.id === fabricId);
  const deliveryCharge = delivery === "pickup" || !config ? 0 : zone === "dhaka" ? config.delivery.dhaka : config.delivery.outside;
  const est = useMemo(() => {
    if (!config || !fabric || sizedRoster.length === 0) return null;
    return estimate(
      { fabricPrice: fabric.price_per_piece, fabricTiers: fabric.price_tiers, quantity: sizedRoster.length, sleeve, collar, withShorts: extras.with_shorts, withNames: extras.with_names, withNumbers: extras.with_numbers, withLogo: extras.with_logo, roster: sizedRoster, neededBy: neededBy || null },
      config.pricing
    );
  }, [config, fabric, sizedRoster, sleeve, collar, extras, neededBy]);

  const agreed = price === "" ? (est?.total ?? 0) : Number(price) || 0;
  const total = orderTotal({ final_price: agreed, delivery_charge: deliveryCharge });
  const advance = config ? advanceFor(total, config.pricing) : 0;
  const target = take === "full" ? total : advance;

  const fabricName = (f: { name_en: string; name_bn: string | null }) => (locale === "bn" && f.name_bn ? f.name_bn : f.name_en);
  const customerLabel = name || phone || t("shop.customReg.customer");

  function reset() {
    setPhone("");
    setName("");
    setSport("football");
    setFabricId(config?.fabrics[0]?.id ?? "");
    setSleeve("short");
    setCollar("round");
    setExtras(NO_EXTRAS);
    setCounts({});
    setRoster([]);
    setSelected(null);
    setPadMode("qty");
    setTyped(null);
    setNeededBy("");
    setNotes("");
    setFiles([]);
    setDelivery("pickup");
    setZone("dhaka");
    setAddress("");
    setConfirm("now");
    setPrice("");
    setTake("advance");
    setPays([]);
    setScreen("slip");
    setError(null);
    setSaved(null);
  }

  function addSize(size: Size) {
    if (usingList) {
      setRoster((r) => [...r, { player_name: "", player_number: "", size, sleeve }]);
    } else {
      setCounts((c) => ({ ...c, [size]: Math.min(500, (c[size] ?? 0) + 1) }));
    }
    setSelected(size);
    setPadMode("qty");
    setTyped(null);
  }

  function removeSize(size: Size) {
    if (usingList) setRoster((r) => r.filter((row) => row.size !== size));
    else setCounts((c) => ({ ...c, [size]: 0 }));
    setSelected(null);
    setTyped(null);
  }

  function press(key: PadKey) {
    const buf = applyKey(typed ?? "", key);
    setTyped(buf);
    if (padMode === "price") return setPrice(buf);
    if (!selected || usingList) return;
    const n = Math.min(500, Math.floor(Number(buf) || 0));
    setCounts((c) => ({ ...c, [selected]: n }));
  }

  async function upload(list: FileList | File[] | null) {
    if (!list?.length) return;
    setUploading(true);
    for (const file of Array.from(list).slice(0, MAX_REFS - files.length)) {
      const form = new FormData();
      form.append("file", file);
      form.append("kind", "design");
      try {
        const res = await fetch("/api/custom-jersey/upload", { method: "POST", body: form });
        const json = await res.json();
        if (!res.ok) setError(json.error ?? t("shop.customNew.uploadFailed"));
        else setFiles((f) => [...f, { path: json.path, name: json.name, mime: json.mime, size: json.size, kind: "design", preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : null }]);
      } catch {
        setError(t("shop.customNew.uploadFailed"));
      }
    }
    setUploading(false);
  }

  /** The slip is ready: check what's missing, then pay (price agreed) or save (mockup first). */
  function next() {
    setError(null);
    if (!/^01\d{9}$/.test(phone) || !name.trim()) return setPopup("customer");
    if (delivery === "delivery" && !address.trim()) return setPopup("delivery");
    if (est?.tooSoon) return setError(t("shop.customNew.tooSoon", { days: String(config?.pricing.rush.min_days ?? "") }));
    if (confirm === "later") return void save([]);
    setPays([]);
    setScreen("pay");
  }

  /** Cash over the amount is change; only what's kept is recorded. */
  function keptPayments(list: Pay[]) {
    let left = target;
    const out: { method: PayMethod; amount: number; trx: string }[] = [];
    for (const p of list) {
      const amount = Math.min(left, Number(p.amount) || 0);
      if (amount > 0) out.push({ method: p.method, amount: round2(amount), trx: p.reference });
      left = round2(left - amount);
    }
    return out;
  }

  async function save(list: Pay[]) {
    const kept = keptPayments(list);
    setBusy(true);
    setError(null);
    const first = kept[0];
    const res = await api<{ id: string; order_number: string; payment_error: string | null }>("/api/admin/pos/custom", {
      action: "create",
      customer_name: name,
      customer_phone: phone,
      sport,
      fabric_id: fabricId,
      sleeve,
      collar,
      ...extras,
      roster: sizedRoster,
      needed_by: neededBy || null,
      notes,
      files: files.map((f): UploadedFile => ({ path: f.path, name: f.name, mime: f.mime, size: f.size, kind: f.kind, note: f.note, product_id: f.product_id })),
      delivery_method: delivery,
      delivery_zone: zone,
      delivery_address: address,
      confirm,
      final_price: confirm === "now" ? agreed : undefined,
      pay_amount: confirm === "now" && first ? first.amount : 0,
      pay_method: first?.method ?? "cash",
      pay_trx: first?.trx ?? "",
    });
    if (!res.ok) {
      setBusy(false);
      return setError(res.error);
    }
    // A split payment: the first part went with the order, the rest go one by one.
    let warning = res.data.payment_error;
    let paid = warning ? 0 : (first?.amount ?? 0);
    for (const p of warning ? [] : kept.slice(1)) {
      const r = await api("/api/admin/pos/custom", { id: res.data.id, action: "payment", amount: p.amount, method: p.method, trx_id: p.trx });
      if (!r.ok) {
        warning = r.error;
        break;
      }
      paid += p.amount;
    }
    setBusy(false);
    setSaved({ id: res.data.id, number: res.data.order_number, warning, paid });
  }

  // ---- Screens -----------------------------------------------------------

  const subTabs = (
    <div className="h-12 bg-surface-card border-b border-border-light flex items-center gap-2 px-2 flex-shrink-0">
      <div className="flex rounded-md border border-border-light overflow-hidden text-sm font-semibold">
        <button type="button" onClick={() => setMode("new")} className={`h-9 px-3 border-r border-border-light flex items-center gap-1.5 ${mode === "new" ? "bg-primary/10 text-on-surface" : "text-on-surface-variant hover:bg-surface-subtle"}`}>
          <Shirt className="w-4 h-4" /> {t("shop.customReg.newTab")}
        </button>
        <button type="button" onClick={() => setMode("find")} className={`h-9 px-3 flex items-center gap-1.5 ${mode === "find" ? "bg-primary/10 text-on-surface" : "text-on-surface-variant hover:bg-surface-subtle"}`}>
          <Search className="w-4 h-4" /> {t("shop.customReg.findTab")}
        </button>
      </div>
      {mode === "new" && !saved && (
        <button type="button" onClick={reset} className="ml-auto h-9 px-3 rounded-md border border-border-light text-sm text-on-surface-variant hover:bg-surface-subtle">
          {t("shop.customReg.clear")}
        </button>
      )}
    </div>
  );

  if (mode === "find") {
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        {subTabs}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4">
          <div className="mx-auto w-full max-w-3xl">
            <CustomTab hideNew />
          </div>
        </div>
      </div>
    );
  }

  if (saved) {
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        {subTabs}
        <div className="flex-1 flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-md rounded-2xl border border-border-light bg-surface-card p-6 text-center flex flex-col gap-3">
            <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
            <h2 className="font-display text-xl font-bold text-primary">{t("shop.customNew.saved", { number: saved.number })}</h2>
            {saved.paid > 0 && <p className="text-lg font-semibold tabular-nums">{t("shop.customReg.paidNow", { amount: taka(saved.paid) })}</p>}
            {saved.warning && <p className="text-sm text-badge-discount bg-badge-discount/10 rounded p-2">{saved.warning}</p>}
            <a className={btnGhost} href={`/admin/offline/pos/custom-receipt/${saved.id}`} target="_blank" rel="noreferrer">
              <Printer className="w-4 h-4" /> {t("shop.custom.printReceipt")}
            </a>
            <button type="button" autoFocus onClick={reset} className="h-14 rounded-xl bg-accent-gold text-white text-lg font-bold hover:opacity-90">
              {t("shop.customReg.another")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === "pay") {
    const choice = (k: "advance" | "full", label: string, amount: number) => (
      <button type="button" onClick={() => { setTake(k); setPays([]); }} className={`h-12 px-3 rounded-lg border flex items-center justify-between gap-2 text-sm font-semibold ${take === k ? "border-accent-gold ring-1 ring-accent-gold bg-accent-gold/10" : "border-border-light bg-surface-card hover:border-accent-gold"}`}>
        <span>{label}</span>
        <span className="tabular-nums">{taka(amount)}</span>
      </button>
    );
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        {subTabs}
        <PaymentScreen
          total={target}
          pays={pays}
          setPays={setPays}
          customerLabel={customerLabel}
          onCustomer={() => setPopup("customer")}
          onBack={() => setScreen("slip")}
          onValidate={() => void save(pays)}
          busy={busy}
          error={error}
          blocked={null}
          methods={METHODS}
          extra={
            <div className="mt-2 flex flex-col gap-2">
              <p className="text-xs font-semibold text-text-muted">{t("shop.customReg.takeNow")}</p>
              {choice("advance", t("shop.customReg.advance", { percent: String(config?.pricing.advance_percent ?? "") }), advance)}
              {choice("full", t("shop.customNew.fillFull"), total)}
              <p className="text-xs text-text-muted">{t("shop.customReg.orderTotal", { amount: taka(total) })}</p>
            </div>
          }
        />
        {popup === "customer" && customerDialog()}
      </div>
    );
  }

  // ---- Dialogs -----------------------------------------------------------

  function customerDialog() {
    return (
      <Dialog title={t("shop.customReg.customer")} onClose={() => setPopup(null)}>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-on-surface-variant">{t("shop.customNew.phone")}</span>
            <CustomerInput autoFocus value={phone} onChange={(v) => setPhone(v.replace(/[^\d]/g, "").slice(0, 11))} onPick={(c) => { setPhone(c.phone); setName(c.name ?? ""); }} minChars={3} placeholder="01XXXXXXXXX" inputMode="numeric" className={`${field} h-11 text-base`} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-on-surface-variant">{t("shop.customNew.name")}</span>
            <CustomerInput value={name} onChange={setName} onPick={(c) => { setPhone(c.phone); setName(c.name ?? ""); }} className={`${field} h-11 text-base`} />
          </label>
          {(!/^01\d{9}$/.test(phone) || !name.trim()) && <p className="text-xs text-text-muted">{t("shop.customReg.needCustomer")}</p>}
          <button type="button" className={`${btnPrimary} h-11`} onClick={() => setPopup(null)}>
            {t("shop.customNew.done")}
          </button>
        </div>
      </Dialog>
    );
  }

  const tile = (on: boolean) =>
    `relative h-16 px-3 rounded-md border text-sm font-semibold text-on-surface transition active:scale-[0.98] flex items-center justify-center text-center ${on ? "border-accent-gold bg-accent-gold/20 ring-2 ring-accent-gold" : "border-border-light bg-surface-card hover:border-accent-gold"}`;
  const heading = "text-xs font-semibold uppercase tracking-wide text-text-muted mb-1.5 mt-3 first:mt-0";
  const slipBtn = (on: boolean) => `h-10 px-3 rounded-md border text-sm flex items-center gap-1.5 min-w-0 ${on ? "border-primary bg-primary/10 text-on-surface font-semibold" : "border-border-light bg-surface-subtle text-on-surface hover:bg-surface-container"}`;
  const options = [
    t(`customJersey.sport.${sport}`),
    fabric ? fabricName(fabric) : "",
    t(`customJersey.options.${sleeve}`),
    t(`customJersey.options.${collar}`),
    ...EXTRAS.filter(([k]) => extras[k]).map(([, text]) => t(`customJersey.options.${text}`)),
  ].filter(Boolean);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {subTabs}
      <div className="flex-1 min-h-0 flex">
        {/* The order slip */}
        <section className={`${pane === "slip" ? "flex" : "hidden"} lg:flex w-full lg:w-[420px] xl:w-[450px] flex-col bg-surface-card border-r border-border-light flex-shrink-0`}>
          <div className="flex-1 min-h-0 overflow-y-auto">
            <p className="px-3 pt-2 pb-1 text-xs text-text-muted">{options.join(" · ")}</p>
            {slipLines.length === 0 ? (
              <div className="h-[calc(100%-2rem)] flex flex-col items-center justify-center gap-2 text-text-muted p-6 text-center">
                <Shirt className="w-10 h-10 opacity-40" />
                <p className="text-sm">{t("shop.customReg.empty")}</p>
              </div>
            ) : (
              <ul>
                {slipLines.map((s) => {
                  const n = perSize.get(s) ?? 0;
                  const active = s === selected && padMode === "qty";
                  return (
                    <li key={s}>
                      <button type="button" className={`w-full text-left px-3 py-2 text-sm ${active ? "bg-primary/10" : "hover:bg-surface-subtle"}`} onClick={() => { setSelected(s); setPadMode("qty"); setTyped(null); }}>
                        <span className="flex items-baseline gap-3">
                          <b className="tabular-nums text-on-surface">{n}</b>
                          <span className="flex-1 min-w-0 truncate text-on-surface">{t("shop.customReg.sizeLine", { size: s })}</span>
                          {est && <b className="whitespace-nowrap tabular-nums text-on-surface">{taka(est.perPiece * n)}</b>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="px-2 pb-2 flex flex-col gap-2 flex-shrink-0">
            <div className="px-1 pt-2 border-t border-border-light text-sm">
              {est && (
                <p className="flex justify-between text-xs text-text-muted">
                  <span>
                    {t("shop.customNew.estimate")} ({taka(est.perPiece)}/{t("shop.customNew.each")})
                    {est.isRush && <span className="ml-1 text-badge-discount font-semibold">{t("shop.customNew.rush")}</span>}
                  </span>
                  <span className="tabular-nums">{taka(est.total)}</span>
                </p>
              )}
              {price !== "" && (
                <p className={`flex justify-between text-xs ${padMode === "price" ? "text-primary font-semibold" : "text-text-muted"}`}>
                  <span>{t("shop.customReg.agreed")}</span>
                  <span className="tabular-nums">{taka(agreed)}</span>
                </p>
              )}
              {deliveryCharge > 0 && (
                <p className="flex justify-between text-xs text-text-muted">
                  <span>{t("shop.customReg.delivery")}</span>
                  <span className="tabular-nums">{taka(deliveryCharge)}</span>
                </p>
              )}
              <p className="flex justify-between items-baseline text-on-surface">
                <span className="font-bold">
                  {t("shop.register.total")} <span className="text-xs font-normal text-text-muted">· {t("shop.register.pieces", { n: sizedRoster.length })}</span>
                </span>
                <span className="text-lg font-bold tabular-nums">{taka(total)}</span>
              </p>
              {confirm === "now" && total > 0 && <p className="flex justify-between text-xs text-text-muted"><span>{t("shop.customReg.advance", { percent: String(config?.pricing.advance_percent ?? "") })}</span><span className="tabular-nums">{taka(advance)}</span></p>}
            </div>
            {usingList && <p className="text-xs text-on-surface-variant bg-surface-subtle rounded p-2">{t("shop.customReg.listInUse")}</p>}
            {error && <p className="text-sm text-badge-discount bg-badge-discount/10 rounded p-2">{error}</p>}

            <div className="grid grid-cols-4 gap-2 border-t border-border-light pt-2">
              <button type="button" onClick={() => setPopup("customer")} className={`${slipBtn(Boolean(phone || name))} col-span-2`}>
                <UserRound className="w-4 h-4 flex-shrink-0" /> <span className="truncate">{customerLabel}</span>
              </button>
              <button type="button" onClick={() => setPopup("design")} className={slipBtn(Boolean(notes || files.length))} title={t("shop.customNew.design")}>
                <Palette className="w-4 h-4 flex-shrink-0" /> <span className="truncate">{t("shop.customNew.design")}</span>
              </button>
              <button type="button" onClick={() => setPopup("delivery")} className={slipBtn(Boolean(neededBy) || delivery === "delivery")} title={t("shop.customReg.dateDelivery")}>
                <CalendarDays className="w-4 h-4 flex-shrink-0" /> <span className="truncate">{neededBy ? neededBy.slice(5) : t("shop.customReg.date")}</span>
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setConfirm("now")} className={slipBtn(confirm === "now")}>
                <span className="truncate">{t("shop.customReg.priceNow")}</span>
              </button>
              <button type="button" onClick={() => setConfirm("later")} className={slipBtn(confirm === "later")}>
                <span className="truncate">{t("shop.customReg.mockupFirst")}</span>
              </button>
            </div>

            <OrderPad
              onKey={press}
              onSign={() => selected && removeSize(selected)}
              mode={padMode}
              setMode={(m) => {
                setPadMode(m);
                setTyped(null);
              }}
              noDisc
              disabled={padMode === "qty" ? !selected || usingList : confirm === "later"}
              labels={{ qty: t("shop.common.qty"), price: t("shop.register.price"), sign: t("shop.register.removeLine") }}
            />

            <button type="button" onClick={next} disabled={busy || !config || sizedRoster.length === 0} className="h-16 rounded-md bg-primary text-primary-foreground text-base font-semibold hover:opacity-90 disabled:opacity-50">
              {busy ? t("shop.customNew.saving") : confirm === "now" ? t("shop.register.payment") : t("shop.customNew.save")}
            </button>
          </div>
        </section>

        {/* Tiles: what to make */}
        <section className={`${pane === "tiles" ? "flex" : "hidden"} lg:flex flex-1 min-w-0 flex-col bg-surface`}>
          <div className="flex-1 overflow-y-auto p-2">
            <p className={heading}>{t("customJersey.sport.label")}</p>
            <div className="flex flex-nowrap gap-2 overflow-x-auto no-scrollbar pb-1">
              {SPORTS.map((s) => (
                <button key={s} type="button" onClick={() => setSport(s)} className={`shrink-0 min-w-[9rem] h-14 px-4 rounded-md text-sm font-medium text-on-surface transition ${sport === s ? "bg-accent-gold/70 ring-2 ring-accent-gold" : "bg-accent-gold/30 hover:bg-accent-gold/45"}`}>
                  {t(`customJersey.sport.${s}`)}
                </button>
              ))}
            </div>

            <p className={heading}>{t("shop.customNew.fabric")}</p>
            {!config ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
                {Array.from({ length: 4 }).map((_, i) => <span key={i} aria-hidden className="h-32 rounded-md bg-surface-subtle animate-pulse" />)}
              </div>
            ) : (
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
                {config.fabrics.map((f) => {
                  const on = f.id === fabricId;
                  return (
                    <li key={f.id}>
                      <button type="button" onClick={() => setFabricId(f.id)} className={`relative w-full h-32 flex flex-col text-left rounded-md border bg-surface-card overflow-hidden border-b-4 transition active:scale-[0.98] ${on ? "border-accent-gold ring-2 ring-accent-gold" : "border-border-light border-b-accent-gold/60 hover:border-accent-gold"}`}>
                        {f.image_url ? (
                          <span className="relative flex-1 min-h-0 bg-surface-subtle">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={f.image_url} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                          </span>
                        ) : null}
                        <span className={`px-2 py-1.5 text-sm text-on-surface leading-snug line-clamp-2 ${f.image_url ? "pr-8" : "flex-1 flex items-center justify-center text-center"}`}>{fabricName(f)}</span>
                        <span className="absolute top-1 right-1 rounded bg-surface-card/90 text-on-surface text-[11px] font-semibold px-1.5 py-0.5 tabular-nums">{taka(f.price_per_piece)}</span>
                        {on && <CheckCircle2 className="absolute top-1 left-1 w-5 h-5 text-accent-gold bg-surface-card rounded-full" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            <p className={heading}>{t("shop.customReg.style")}</p>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2">
              {(["short", "full"] as const).map((s) => (
                <button key={s} type="button" className={tile(sleeve === s)} onClick={() => setSleeve(s)}>
                  {t(`customJersey.options.${s}`)}
                </button>
              ))}
              {(["round", "v", "polo"] as const).map((c) => (
                <button key={c} type="button" className={tile(collar === c)} onClick={() => setCollar(c)}>
                  {t(`customJersey.options.${c}`)}
                </button>
              ))}
            </div>

            <p className={heading}>{t("shop.customReg.extras")}</p>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2">
              {EXTRAS.map(([key, text]) => (
                <button key={key} type="button" className={tile(extras[key])} onClick={() => setExtras((x) => ({ ...x, [key]: !x[key] }))}>
                  {t(`customJersey.options.${text}`)}
                </button>
              ))}
            </div>

            <p className={heading}>{t("shop.customReg.sizesHint")}</p>
            <div className="grid grid-cols-4 sm:grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2">
              {SIZES.map((s) => {
                const n = perSize.get(s) ?? 0;
                return (
                  <button key={s} type="button" onClick={() => addSize(s)} className={`relative h-20 rounded-md border bg-surface-card text-xl font-bold text-on-surface border-b-4 transition active:scale-[0.98] ${n ? "border-accent-gold" : "border-border-light border-b-accent-gold/60 hover:border-accent-gold"}`}>
                    {s}
                    {n > 0 && <span className="absolute bottom-1.5 right-1.5 min-w-6 h-6 px-1.5 rounded-md bg-neutral-900 text-white text-xs font-bold flex items-center justify-center tabular-nums">{n}</span>}
                  </button>
                );
              })}
              <button type="button" onClick={() => setPopup("list")} className={`h-20 rounded-md border-2 border-dashed text-sm font-semibold flex flex-col items-center justify-center gap-1 ${usingList ? "border-accent-gold bg-accent-gold/10 text-on-surface" : "border-accent-gold/60 text-accent-gold hover:bg-accent-gold/10"}`}>
                <ListOrdered className="w-5 h-5" /> {usingList ? t("shop.customReg.listCount", { n: roster.length }) : t("shop.customReg.list")}
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* Phones: switch between the tiles and the slip. */}
      <div className="lg:hidden grid grid-cols-2 border-t border-border-light bg-surface-card flex-shrink-0">
        <button type="button" onClick={() => setPane("tiles")} className={`h-12 flex items-center justify-center gap-2 text-sm font-semibold ${pane === "tiles" ? "text-accent-gold" : "text-on-surface-variant"}`}>
          <LayoutGrid className="w-4 h-4" /> {t("shop.customReg.options")}
        </button>
        <button type="button" onClick={() => setPane("slip")} className={`h-12 flex items-center justify-center gap-2 text-sm font-semibold ${pane === "slip" ? "text-accent-gold" : "text-on-surface-variant"}`}>
          <Shirt className="w-4 h-4" /> {t("shop.customReg.slip")} · {taka(total)}
          {sizedRoster.length > 0 && <span className="min-w-5 h-5 px-1 rounded-full bg-accent-gold text-white text-[11px] font-bold flex items-center justify-center">{sizedRoster.length}</span>}
        </button>
      </div>

      {popup === "customer" && customerDialog()}

      {popup === "design" && (
        <Dialog title={t("shop.customNew.design")} wide onClose={() => setPopup(null)}>
          <div className="flex flex-col gap-3">
            <textarea autoFocus value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} placeholder={t("shop.customNew.notesPlaceholder")} className={field} />
            <DesignRefs refs={files} setRefs={setFiles} uploading={uploading} onUpload={(l) => void upload(l)} />
            <button type="button" className={`${btnPrimary} h-11`} onClick={() => setPopup(null)}>
              {t("shop.customNew.done")}
            </button>
          </div>
        </Dialog>
      )}

      {popup === "delivery" && (
        <Dialog title={t("shop.customReg.dateDelivery")} onClose={() => setPopup(null)}>
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-on-surface-variant">{t("shop.customNew.neededBy")}</span>
              <input type="date" value={neededBy} onChange={(e) => setNeededBy(e.target.value)} className={`${field} h-11`} />
            </label>
            <span className="text-xs font-semibold text-on-surface-variant">{t("shop.customNew.handover")}</span>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className={tile(delivery === "pickup")} onClick={() => setDelivery("pickup")}>
                {t("customJersey.contact.pickup")}
              </button>
              <button type="button" className={tile(delivery === "delivery")} onClick={() => setDelivery("delivery")}>
                {t("customJersey.contact.delivery")}
              </button>
            </div>
            {delivery === "delivery" && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" className={tile(zone === "dhaka")} onClick={() => setZone("dhaka")}>
                    {t("shop.customNew.dhaka")} · {taka(config?.delivery.dhaka ?? 0)}
                  </button>
                  <button type="button" className={tile(zone === "outside")} onClick={() => setZone("outside")}>
                    {t("shop.customNew.outside")} · {taka(config?.delivery.outside ?? 0)}
                  </button>
                </div>
                <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder={t("shop.customNew.address")} className={`${field} h-11`} />
              </>
            )}
            <button type="button" className={`${btnPrimary} h-11`} onClick={() => setPopup(null)}>
              {t("shop.customNew.done")}
            </button>
          </div>
        </Dialog>
      )}

      {popup === "list" && (
        <Dialog title={t("shop.customReg.list")} onClose={() => setPopup(null)} wide>
          <div className="flex flex-col gap-3">
            <p className="text-xs text-text-muted">{t("shop.customReg.listHint")}</p>
            <RosterEditor rows={roster} onChange={setRoster} defaultSleeve={sleeve} />
            <button type="button" className={`${btnPrimary} h-11`} onClick={() => setPopup(null)}>
              {t("shop.customNew.done")}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
