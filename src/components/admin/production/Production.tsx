"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowLeft, Factory, Plus, Trash2 } from "lucide-react";
import { useT } from "@/i18n/client";
import { taka } from "@/lib/pos/types";
import { useUrlState } from "@/lib/url-state";
import { api, btnGhost, btnPrimary, card, dateTime, field } from "@/components/admin/pos/api";
import { WASTAGE_REASONS, type WastageReason } from "@/lib/custom-jersey/fabric-stock";
import {
  COLLARS, EXTRA_COST_KINDS, PRINT_BASES, SLEEVES, lineGarmentCost, printCost, styleKey,
  type BatchCost, type BatchDetail, type BatchLine, type BatchListRow, type BatchOrderOption, type BatchStatus,
  type GarmentRates, type PrintBasis, type StyleKey,
} from "@/lib/custom-jersey/production";
import { SupplierPicker, type SupplierOption } from "@/components/admin/pickers";

const URL_ = "/api/admin/production";
const kgFmt = (v: number) => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 }).format(Number(v) || 0);
const num = (v: string) => (v === "" ? NaN : Number(v));
const lbl = "flex flex-col gap-0.5 text-xs";
const h2 = "font-display text-base uppercase font-bold text-primary";

type Supplier = SupplierOption;
interface ListData {
  batches: BatchListRow[];
  suppliers: Supplier[];
  rates: GarmentRates;
}
interface StockItem { id: string; name_en: string; name_bn: string | null; is_active: boolean; on_hand: number; avg_cost: number | null }
interface DetailData extends ListData {
  batch: BatchDetail;
  orders: BatchOrderOption[];
  fabrics: (StockItem & { kg_per_piece: number | null })[];
  accessories: (StockItem & { kind: string; per_jersey: number | null })[];
}

const STATUS_STYLE: Record<BatchStatus, string> = {
  open: "bg-primary/10 text-primary",
  done: "bg-green-600/10 text-green-700 dark:text-green-400",
  void: "bg-badge-discount/10 text-badge-discount",
};

/** Production batches: what a custom jersey costs to make. */
export default function Production() {
  const [batchId, setBatchId] = useUrlState<string>("batch", "");
  return batchId ? <BatchView id={batchId} onBack={() => setBatchId("")} /> : <BatchList onOpen={setBatchId} />;
}

function ErrorBox({ error }: { error: string | null }) {
  if (!error) return null;
  return <div className="flex items-center gap-2 text-sm text-badge-discount bg-badge-discount/10 rounded-lg px-3 py-2" role="alert"><AlertCircle className="w-4 h-4 shrink-0" /> {error}</div>;
}

/* ====================================================================== */
/* List                                                                   */
/* ====================================================================== */

function BatchList({ onOpen }: { onOpen: (id: string) => void }) {
  const { t } = useT();
  const [data, setData] = useState<ListData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRates, setShowRates] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await api<ListData>(URL_);
    if (!res.ok) return setError(res.error);
    setError(null);
    setData(res.data);
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function create() {
    setBusy(true);
    const res = await api<{ id: string }>(URL_, { action: "save", lines: [], costs: [] });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onOpen(res.data.id);
  }

  return (
    <div className="p-space-base max-w-5xl space-y-5">
      <div>
        <h1 className="font-display text-xl uppercase font-bold text-primary mb-1 flex items-center gap-2"><Factory className="w-5 h-5" /> {t("shop.production.title")}</h1>
        <p className="text-sm text-text-muted">{t("shop.production.intro")}</p>
      </div>
      <ErrorBox error={error} />
      <div className="flex flex-wrap gap-2">
        <button className={btnPrimary} onClick={create} disabled={busy || !data}><Plus className="w-4 h-4" /> {t("shop.production.newBatch")}</button>
        <button className={showRates ? btnPrimary : btnGhost} onClick={() => setShowRates((s) => !s)} disabled={!data}>{t("shop.production.rates")}</button>
      </div>
      {showRates && data && <RatesForm rates={data.rates} onSaved={(rates) => setData({ ...data, rates })} onError={setError} />}

      {data && (
        <section>
          <h2 className={`${h2} mb-2`}>{t("shop.production.list")}</h2>
          <div className={`${card} divide-y divide-border-light`}>
            {data.batches.length === 0 && <p className="p-3 text-sm text-text-muted">{t("shop.production.empty")}</p>}
            {data.batches.map((b) => (
              <button key={b.id} onClick={() => onOpen(b.id)} className={`w-full text-left p-3 flex flex-wrap items-center gap-x-4 gap-y-1 hover:bg-surface-subtle ${b.status === "void" ? "opacity-60" : ""}`}>
                <span className="font-semibold tabular-nums">{b.batch_number}</span>
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${STATUS_STYLE[b.status]}`}>{t(`shop.production.status.${b.status}`)}</span>
                <span className="text-sm flex-1 min-w-40 truncate">
                  {b.title || b.orders.join(", ") || "—"}
                  {b.title && b.orders.length > 0 && <span className="text-text-muted"> · {b.orders.join(", ")}</span>}
                </span>
                <span className="text-xs text-text-muted">{dateTime(b.created_at)}</span>
                {b.totals && (
                  <span className="text-sm tabular-nums text-right ml-auto">
                    {t("shop.production.pieces", { n: b.totals.pieces })} · <span className="font-semibold">{taka(Number(b.totals.total_cost))}</span>
                    {b.totals.cost_per_piece !== null && <span className="block text-xs text-primary font-semibold">{t("shop.production.perPiece", { price: taka(Number(b.totals.cost_per_piece)) })}</span>}
                  </span>
                )}
              </button>
            ))}
          </div>
        </section>
      )}
      {!data && !error && <p className="text-sm text-text-muted">…</p>}
    </div>
  );
}

function RatesForm({ rates, onSaved, onError }: { rates: GarmentRates; onSaved: (r: GarmentRates) => void; onError: (e: string | null) => void }) {
  const { t } = useT();
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(rates).map(([k, x]) => [k, x ? String(x) : ""])));
  const [state, setState] = useState<"idle" | "busy" | "saved">("idle");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setState("busy");
    const res = await api<{ rates: GarmentRates }>(URL_, { action: "rates", rates: v });
    if (!res.ok) {
      setState("idle");
      return onError(res.error);
    }
    onError(null);
    onSaved(res.data.rates);
    setState("saved");
    setTimeout(() => setState("idle"), 1500);
  }

  return (
    <form onSubmit={save} className={`${card} p-3 space-y-3`}>
      <p className="text-xs text-text-muted">{t("shop.production.ratesIntro")}</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {SLEEVES.flatMap((s) => COLLARS.map((c) => [s, c] as const)).map(([s, c]) => {
          const k = styleKey(s, c);
          return (
            <label key={k} className={lbl}>
              {t(`shop.production.sleeve.${s}`)} · {t(`shop.production.collar.${c}`)}
              <input type="number" min={0} step="0.01" className={field} value={v[k] ?? ""} onChange={(e) => setV((o) => ({ ...o, [k]: e.target.value }))} placeholder="৳" />
            </label>
          );
        })}
        <label className={lbl}>{t("shop.production.shortsRate")}<input type="number" min={0} step="0.01" className={field} value={v.shorts ?? ""} onChange={(e) => setV((o) => ({ ...o, shorts: e.target.value }))} placeholder="৳" /></label>
      </div>
      <button className={btnPrimary} disabled={state === "busy"}>{state === "saved" ? t("shop.production.ratesSaved") : state === "busy" ? t("shop.production.saving") : t("shop.fabricStock.save")}</button>
    </form>
  );
}

/* ====================================================================== */
/* One batch                                                              */
/* ====================================================================== */

interface Draft {
  title: string;
  note: string;
  print_supplier_id: string;
  print_basis: PrintBasis;
  print_qty: string;
  print_rate: string;
  print_cost: string;
  garments_supplier_id: string;
  lines: BatchLine[];
  costs: { kind: BatchCost["kind"]; amount: string; note: string }[];
}

const toDraft = (b: BatchDetail): Draft => ({
  title: b.title ?? "",
  note: b.note ?? "",
  print_supplier_id: b.print_supplier_id ?? "",
  print_basis: b.print_basis,
  print_qty: b.print_qty === null ? "" : String(b.print_qty),
  print_rate: b.print_rate === null ? "" : String(b.print_rate),
  print_cost: b.print_basis === "lump" && b.print_cost ? String(b.print_cost) : "",
  garments_supplier_id: b.garments_supplier_id ?? "",
  lines: b.lines,
  costs: b.costs.map((c) => ({ kind: c.kind, amount: String(c.amount), note: c.note ?? "" })),
});

function BatchView({ id, onBack }: { id: string; onBack: () => void }) {
  const { t, locale } = useT();
  const [data, setData] = useState<DetailData | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<"idle" | "busy" | "saved">("idle");

  const load = useCallback(async (keepDraft = false) => {
    const res = await api<DetailData>(`${URL_}?id=${encodeURIComponent(id)}`);
    if (!res.ok) return setError(res.error);
    setError(null);
    setData(res.data);
    if (!keepDraft) {
      setDraft(toDraft(res.data.batch));
      setDirty(false);
    }
  }, [id]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const edit = (patch: Partial<Draft>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    setDirty(true);
  };

  if (!data || !draft) {
    return (
      <div className="p-space-base max-w-5xl space-y-3">
        <button className={`${btnGhost} !px-2`} onClick={onBack}><ArrowLeft className="w-4 h-4" /> {t("shop.production.back")}</button>
        <ErrorBox error={error} />
        {!error && <p className="text-sm text-text-muted">…</p>}
      </div>
    );
  }

  const b = data.batch;
  const open = b.status === "open";
  const pieces = draft.lines.reduce((s, l) => s + (l.pieces || 0), 0);
  const garments = draft.lines.reduce((s, l) => s + lineGarmentCost(l), 0);
  const fabricKg = b.materials.filter((m) => m.material === "fabric" && !m.voided_at).reduce((s, m) => s + m.amount, 0);
  const print = printCost(draft.print_basis, num(draft.print_qty), num(draft.print_rate), num(draft.print_cost));
  const name = (x: { name_en: string; name_bn: string | null }) => (locale === "bn" && x.name_bn) || x.name_en;

  async function save() {
    if (!draft) return;
    setSaving("busy");
    const res = await api(URL_, { action: "save", id, ...draft });
    if (!res.ok) {
      setSaving("idle");
      return setError(`${t("shop.production.failed")}: ${res.error}`);
    }
    setSaving("saved");
    setTimeout(() => setSaving("idle"), 1500);
    await load();
  }

  async function setStatus(status: BatchStatus) {
    let reason: string | null = null;
    if (status === "void") {
      reason = prompt(t("shop.production.voidReason"));
      if (!reason?.trim()) return;
    }
    if (dirty && status === "done") {
      const res = await api(URL_, { action: "save", id, ...draft });
      if (!res.ok) return setError(`${t("shop.production.failed")}: ${res.error}`);
    }
    const res = await api(URL_, { action: "status", id, status, reason });
    if (!res.ok) return setError(res.error);
    await load();
  }

  return (
    <div className="p-space-base max-w-5xl space-y-5 pb-24">
      <div className="flex flex-wrap items-center gap-2">
        <button className={`${btnGhost} !px-2`} onClick={onBack}><ArrowLeft className="w-4 h-4" /> {t("shop.production.back")}</button>
        <h1 className="font-display text-xl uppercase font-bold text-primary tabular-nums">{b.batch_number}</h1>
        <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${STATUS_STYLE[b.status]}`}>{t(`shop.production.status.${b.status}`)}</span>
        <span className="text-xs text-text-muted">{dateTime(b.created_at)}</span>
        <div className="ml-auto flex gap-2">
          {open && <button className={btnGhost} onClick={() => setStatus("done")}>{t("shop.production.markDone")}</button>}
          {b.status === "done" && <button className={btnGhost} onClick={() => setStatus("open")}>{t("shop.production.reopen")}</button>}
          {b.status !== "void" && <button className={`${btnGhost} text-badge-discount`} onClick={() => setStatus("void")}>{t("shop.production.voidBatch")}</button>}
        </div>
      </div>
      <ErrorBox error={error} />
      {b.status === "done" && <p className="text-sm text-text-muted">{t("shop.production.doneNote")}</p>}
      {b.status === "void" && <p className="text-sm text-badge-discount">{t("shop.production.voidNote", { reason: b.void_reason ?? "" })}</p>}

      <fieldset disabled={!open} className="space-y-5 disabled:opacity-90">
        <div className="grid sm:grid-cols-2 gap-2">
          <label className={lbl}>{t("shop.production.batchTitle")}<input className={field} value={draft.title} onChange={(e) => edit({ title: e.target.value })} placeholder={t("shop.production.batchTitleHint")} /></label>
          <label className={lbl}>{t("shop.production.note")}<input className={field} value={draft.note} onChange={(e) => edit({ note: e.target.value })} /></label>
        </div>

        <Lines draft={draft} orders={data.orders} rates={data.rates} onChange={(lines) => edit({ lines })} />

        {/* Printing */}
        <section className={`${card} p-3 space-y-2`}>
          <h2 className={h2}>{t("shop.production.printing")}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
            <label className={`${lbl} col-span-2`}>{t("shop.production.printShop")}
              <SupplierSelect category="printing" suppliers={data.suppliers} value={draft.print_supplier_id} onChange={(v) => edit({ print_supplier_id: v })} />
            </label>
            <label className={`${lbl} col-span-2`}>{t("shop.production.basis")}
              <select className={field} value={draft.print_basis} onChange={(e) => edit({ print_basis: e.target.value as PrintBasis })}>
                {PRINT_BASES.map((x) => <option key={x} value={x}>{t(`shop.production.bases.${x}`)}</option>)}
              </select>
            </label>
            {draft.print_basis === "lump" ? (
              <label className={`${lbl} col-span-2`}>{t("shop.production.printLump")}<input type="number" min={0} step="0.01" className={field} value={draft.print_cost} onChange={(e) => edit({ print_cost: e.target.value })} /></label>
            ) : (
              <>
                <label className={lbl}>{t(`shop.production.printQty.${draft.print_basis}`)}<input type="number" min={0} step={draft.print_basis === "kg" ? "0.001" : "1"} className={field} value={draft.print_qty} onChange={(e) => edit({ print_qty: e.target.value })} /></label>
                <label className={lbl}>{t(`shop.production.printRate.${draft.print_basis}`)}<input type="number" min={0} step="0.01" className={field} value={draft.print_rate} onChange={(e) => edit({ print_rate: e.target.value })} /></label>
              </>
            )}
            <div className="text-sm font-semibold col-span-2 pb-2">{t("shop.fabricStock.total", { amount: taka(print) })}</div>
          </div>
          {open && draft.print_basis === "kg" && fabricKg > 0 && String(fabricKg) !== draft.print_qty && (
            <button type="button" className="text-xs underline underline-offset-2 text-primary" onClick={() => edit({ print_qty: String(Math.round(fabricKg * 1000) / 1000) })}>{t("shop.production.useFabricKg", { kg: kgFmt(fabricKg) })}</button>
          )}
          {open && draft.print_basis === "piece" && pieces > 0 && String(pieces) !== draft.print_qty && (
            <button type="button" className="text-xs underline underline-offset-2 text-primary" onClick={() => edit({ print_qty: String(pieces) })}>{t("shop.production.usePieces", { n: pieces })}</button>
          )}
        </section>

        {/* Garments */}
        <section className={`${card} p-3 space-y-2`}>
          <h2 className={h2}>{t("shop.production.garments")}</h2>
          <div className="flex flex-wrap items-end gap-3">
            <label className={`${lbl} flex-1 min-w-48`}>{t("shop.production.garmentsFactory")}
              <SupplierSelect category="garments" suppliers={data.suppliers} value={draft.garments_supplier_id} onChange={(v) => edit({ garments_supplier_id: v })} />
            </label>
            <div className="text-sm font-semibold pb-2">{t("shop.production.garmentsTotal", { amount: taka(garments) })}</div>
          </div>
          <p className="text-xs text-text-muted">{t("shop.production.dueNote")}</p>
        </section>

        {/* Extras */}
        <section className={`${card} p-3 space-y-2`}>
          <h2 className={h2}>{t("shop.production.extras")}</h2>
          {draft.costs.map((c, i) => (
            <div key={i} className="grid grid-cols-[1fr_7rem_auto] sm:grid-cols-[12rem_8rem_1fr_auto] gap-2 items-center">
              <select className={field} value={c.kind} onChange={(e) => edit({ costs: draft.costs.map((x, j) => (j === i ? { ...x, kind: e.target.value as BatchCost["kind"] } : x)) })} aria-label={t("shop.production.extras")}>
                {EXTRA_COST_KINDS.map((k) => <option key={k} value={k}>{t(`shop.production.extraKinds.${k}`)}</option>)}
              </select>
              <input type="number" min={0} step="0.01" className={field} value={c.amount} onChange={(e) => edit({ costs: draft.costs.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)) })} placeholder={t("shop.production.amount")} aria-label={t("shop.production.amount")} />
              <input className={`${field} col-span-2 sm:col-span-1 row-start-2 sm:row-start-auto`} value={c.note} onChange={(e) => edit({ costs: draft.costs.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)) })} placeholder={t("shop.production.note")} aria-label={t("shop.production.note")} />
              <button type="button" className="text-text-muted hover:text-badge-discount p-1 row-start-1 col-start-3 sm:col-start-auto" onClick={() => edit({ costs: draft.costs.filter((_, j) => j !== i) })} aria-label={t("shop.production.remove")}><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
          <button type="button" className="text-sm text-primary font-semibold" onClick={() => edit({ costs: [...draft.costs, { kind: "travel", amount: "", note: "" }] })}>{t("shop.production.addExtra")}</button>
        </section>
      </fieldset>

      <Materials data={data} onChanged={() => load(true)} onError={setError} name={name} />

      <Summary data={data} />

      {open && (
        <div className="fixed bottom-0 inset-x-0 z-30 bg-surface-card/95 backdrop-blur border-t border-border-light px-4 py-3 flex items-center justify-end gap-3">
          {dirty && <span className="text-xs text-badge-discount mr-auto">{t("shop.production.unsaved")}</span>}
          <span className="text-sm tabular-nums">{t("shop.production.pieces", { n: pieces })}</span>
          <button className={btnPrimary} onClick={save} disabled={saving === "busy"}>{saving === "busy" ? t("shop.production.saving") : saving === "saved" ? t("shop.production.saved") : t("shop.production.save")}</button>
        </div>
      )}
    </div>
  );
}

function SupplierSelect({ suppliers, value, onChange, category }: { suppliers: Supplier[]; value: string; onChange: (v: string) => void; category: "printing" | "garments" }) {
  const { t } = useT();
  return (
    <SupplierPicker category={category} className={field} suppliers={suppliers} value={value} onChange={onChange} placeholder={t("shop.production.chooseSupplier")} />
  );
}

/* ---------- Jerseys in the batch ---------- */

function Lines({ draft, orders, rates, onChange }: { draft: Draft; orders: BatchOrderOption[]; rates: GarmentRates; onChange: (l: BatchLine[]) => void }) {
  const { t } = useT();
  const lines = draft.lines;
  const used = new Set(lines.map((l) => l.custom_order_id).filter(Boolean));
  const rate = (sleeve: BatchLine["sleeve"], collar: BatchLine["collar"]) => rates[styleKey(sleeve, collar) as StyleKey] ?? 0;
  const set = (i: number, patch: Partial<BatchLine>) => onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  function addOrder(id: string) {
    const o = orders.find((x) => x.id === id);
    if (!o) return;
    const left = Math.max(1, o.quantity - o.in_batches);
    onChange([...lines, {
      custom_order_id: o.id, order_number: o.order_number, customer_name: o.customer_name, label: null,
      pieces: left, sleeve: o.sleeve, collar: o.collar, shorts: o.with_shorts ? left : 0,
      garment_rate: rate(o.sleeve, o.collar), shorts_rate: o.with_shorts ? rates.shorts : 0,
    }]);
  }
  function addOther() {
    onChange([...lines, { custom_order_id: null, label: t("shop.production.otherDefault"), pieces: 1, sleeve: "short", collar: "round", shorts: 0, garment_rate: rate("short", "round"), shorts_rate: rates.shorts }]);
  }

  const cell = `${field} !px-2 !py-1.5`;
  return (
    <section className={`${card} p-3 space-y-2`}>
      <h2 className={h2}>{t("shop.production.jerseys")}</h2>
      {lines.length === 0 && <p className="text-sm text-text-muted">{t("shop.production.noLines")}</p>}
      {lines.map((l, i) => {
        const o = l.custom_order_id ? orders.find((x) => x.id === l.custom_order_id) : null;
        return (
          <div key={i} className="rounded-lg border border-border-light p-2 grid grid-cols-2 sm:grid-cols-[minmax(9rem,1.4fr)_4.5rem_1fr_1fr_4.5rem_5.5rem_5.5rem_auto] gap-2 items-end">
            <div className="col-span-2 sm:col-span-1 min-w-0">
              {l.custom_order_id ? (
                <div className="text-sm">
                  <span className="font-semibold">{l.order_number ?? o?.order_number}</span> <span className="text-text-muted">{l.customer_name ?? o?.customer_name}</span>
                  {o && <div className="text-[11px] text-text-muted">{o.quantity} pcs{o.fabric_name ? ` · ${o.fabric_name}` : ""}{o.in_batches > 0 ? ` · ${t("shop.production.alreadyIn", { n: o.in_batches })}` : ""}</div>}
                </div>
              ) : (
                <label className={lbl}>{t("shop.production.otherLabel")}<input className={cell} value={l.label ?? ""} onChange={(e) => set(i, { label: e.target.value })} /></label>
              )}
            </div>
            <label className={lbl}>{t("shop.fabricStock.pieces")}<input type="number" min={1} step={1} className={cell} value={l.pieces || ""} onChange={(e) => set(i, { pieces: Math.max(0, Math.floor(num(e.target.value)) || 0) })} /></label>
            <label className={lbl}>{t("shop.production.style")}
              <select className={cell} value={l.sleeve} onChange={(e) => { const sleeve = e.target.value as BatchLine["sleeve"]; set(i, { sleeve, garment_rate: rate(sleeve, l.collar) }); }}>
                {SLEEVES.map((s) => <option key={s} value={s}>{t(`shop.production.sleeve.${s}`)}</option>)}
              </select>
            </label>
            <label className={lbl}>&nbsp;
              <select className={cell} value={l.collar} onChange={(e) => { const collar = e.target.value as BatchLine["collar"]; set(i, { collar, garment_rate: rate(l.sleeve, collar) }); }}>
                {COLLARS.map((c) => <option key={c} value={c}>{t(`shop.production.collar.${c}`)}</option>)}
              </select>
            </label>
            <label className={lbl}>{t("shop.production.shorts")}<input type="number" min={0} step={1} className={cell} value={l.shorts || ""} onChange={(e) => set(i, { shorts: Math.max(0, Math.floor(num(e.target.value)) || 0), shorts_rate: l.shorts_rate || rates.shorts })} /></label>
            <label className={lbl}>{t("shop.production.rate")}<input type="number" min={0} step="0.01" className={cell} value={l.garment_rate || ""} onChange={(e) => set(i, { garment_rate: Math.max(0, num(e.target.value) || 0) })} /></label>
            <label className={lbl}>{t("shop.production.shortsRateShort")}<input type="number" min={0} step="0.01" className={cell} value={l.shorts_rate || ""} onChange={(e) => set(i, { shorts_rate: Math.max(0, num(e.target.value) || 0) })} disabled={!l.shorts} /></label>
            <div className="flex items-center gap-2 justify-end pb-1.5">
              <span className="text-sm font-semibold tabular-nums">{taka(lineGarmentCost(l))}</span>
              <button type="button" className="text-text-muted hover:text-badge-discount" onClick={() => onChange(lines.filter((_, j) => j !== i))} aria-label={t("shop.production.remove")}><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        );
      })}
      <div className="flex flex-wrap gap-2 items-center">
        <select className={`${field} !w-auto max-w-full`} value="" onChange={(e) => addOrder(e.target.value)} aria-label={t("shop.production.addOrder")}>
          <option value="">{t("shop.production.addOrder")}</option>
          {orders.filter((o) => !used.has(o.id)).map((o) => (
            <option key={o.id} value={o.id}>{o.order_number} · {o.customer_name} · {o.quantity} pcs{o.in_batches ? ` (${t("shop.production.alreadyIn", { n: o.in_batches })})` : ""}</option>
          ))}
        </select>
        <button type="button" className="text-sm text-primary font-semibold" onClick={addOther}>{t("shop.production.addOther")}</button>
      </div>
    </section>
  );
}

/* ---------- Fabric & accessories taken out ---------- */

function Materials({ data, onChanged, onError, name }: { data: DetailData; onChanged: () => Promise<void>; onError: (e: string | null) => void; name: (x: { name_en: string; name_bn: string | null }) => string }) {
  const { t } = useT();
  const b = data.batch;
  const open = b.status === "open";
  const [material, setMaterial] = useState<"fabric" | "accessory">("fabric");
  const [v, setV] = useState<Record<string, string>>({ kind: "used", reason: "cutting" });
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((o) => ({ ...o, [k]: e.target.value }));

  const batchPieces = b.lines.reduce((s, l) => s + l.pieces, 0);
  const orderPieces = (oid: string) => b.lines.filter((l) => l.custom_order_id === oid).reduce((s, l) => s + l.pieces, 0);
  const forPieces = num(v.pieces) > 0 ? num(v.pieces) : v.custom_order_id ? orderPieces(v.custom_order_id) : batchPieces;
  const items = material === "fabric" ? data.fabrics : data.accessories;
  const item = items.find((x) => x.id === v.item_id);

  // Suggest from "per piece": fabric kg per jersey, accessory pieces per jersey
  const suggestion = useMemo(() => {
    if (!item || !(forPieces > 0)) return null;
    if (material === "fabric") {
      const per = (item as DetailData["fabrics"][number]).kg_per_piece;
      return per ? Math.round(forPieces * Number(per) * 1000) / 1000 : null;
    }
    const per = (item as DetailData["accessories"][number]).per_jersey;
    return per ? forPieces * per : null;
  }, [item, forPieces, material]);

  const orderOptions = b.lines.filter((l) => l.custom_order_id);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const amount = material === "fabric" ? (num(v.kg) > 0 ? num(v.kg) : suggestion) : num(v.qty) > 0 ? num(v.qty) : suggestion;
    setBusy(true);
    const res = await api(URL_, {
      action: "use", batch_id: b.id, material, item_id: v.item_id, kind: v.kind, reason: v.reason,
      kg: material === "fabric" ? amount : undefined, qty: material === "accessory" ? amount : undefined,
      pieces: material === "fabric" ? forPieces : undefined, custom_order_id: v.custom_order_id, note: v.note,
    });
    setBusy(false);
    if (!res.ok) return onError(`${t("shop.production.failed")}: ${res.error}`);
    onError(null);
    setV({ kind: "used", reason: "cutting", item_id: v.item_id });
    await onChanged();
  }

  async function undo(id: string, mat: "fabric" | "accessory") {
    const reason = prompt(t("shop.production.undoReason"));
    if (!reason?.trim()) return;
    const res = await api(URL_, { action: "void_material", id, material: mat, reason });
    if (!res.ok) return onError(res.error);
    await onChanged();
  }

  const unit = (m: "fabric" | "accessory", amount: number) => (m === "fabric" ? t("shop.fabricStock.kg", { n: kgFmt(amount) }) : t("shop.accessoryStock.pcs", { n: amount }));

  return (
    <section className={`${card} p-3 space-y-3`}>
      <div>
        <h2 className={h2}>{t("shop.production.materials")}</h2>
        <p className="text-xs text-text-muted">{t("shop.production.materialsIntro")}</p>
      </div>
      <div className="divide-y divide-border-light">
        {b.materials.length === 0 && <p className="text-sm text-text-muted py-1">{t("shop.production.noMaterials")}</p>}
        {b.materials.map((m) => (
          <div key={m.id} className={`py-2 text-sm flex flex-wrap items-baseline gap-x-3 gap-y-0.5 ${m.voided_at ? "opacity-50 line-through" : ""}`}>
            <span className="text-xs text-text-muted">{t(m.material === "fabric" ? "shop.production.fabric" : "shop.production.accessory")}</span>
            <span className="font-semibold">{m.name}</span>
            <span className="tabular-nums">{unit(m.material, m.amount)}</span>
            {m.kind === "wastage" && <span className="text-badge-discount text-xs">{t("shop.production.wastage")}{m.reason ? ` · ${t(`shop.fabricStock.reasons.${m.reason as WastageReason}`)}` : ""}</span>}
            <span className="text-text-muted">{m.order_number ?? t("shop.production.shared")}</span>
            <span className="tabular-nums">{m.total_cost !== null ? taka(m.total_cost) : <span className="text-badge-discount text-xs">{t("shop.production.noCostYet")}</span>}</span>
            {m.note && <span className="text-text-muted italic">{m.note}</span>}
            {open && !m.voided_at && <button className="text-xs underline underline-offset-2 ml-auto text-text-muted hover:text-badge-discount no-underline" onClick={() => undo(m.id, m.material)}>{t("shop.production.undo")}</button>}
          </div>
        ))}
      </div>

      {open && (
        <form onSubmit={submit} className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-surface-subtle/60 rounded-lg p-2.5 border border-border-light items-end">
          <div className="col-span-2 sm:col-span-4 flex gap-1.5">
            {(["fabric", "accessory"] as const).map((m) => (
              <button key={m} type="button" className={`${material === m ? btnPrimary : btnGhost} !text-xs !px-2.5 !py-1.5`} onClick={() => { setMaterial(m); setV({ kind: "used", reason: "cutting" }); }}>{t(`shop.production.${m}`)}</button>
            ))}
            <select className={`${field} !w-auto !py-1 ml-auto`} value={v.kind} onChange={set("kind")} aria-label={t("shop.production.used")}>
              <option value="used">{t("shop.production.used")}</option>
              <option value="wastage">{t("shop.production.wastage")}</option>
            </select>
          </div>
          <label className={`${lbl} col-span-2`}>{t("shop.production.item")}
            <select required className={field} value={v.item_id ?? ""} onChange={set("item_id")}>
              <option value="">{t("shop.production.chooseItem")}</option>
              {items.filter((x) => material === "fabric" || x.is_active || x.id === v.item_id).map((x) => (
                <option key={x.id} value={x.id}>{name(x)} · {t("shop.production.inStock", { n: material === "fabric" ? `${kgFmt(x.on_hand)} kg` : x.on_hand })}</option>
              ))}
            </select>
          </label>
          <label className={`${lbl} col-span-2`}>{t("shop.production.forOrder")}
            <select className={field} value={v.custom_order_id ?? ""} onChange={set("custom_order_id")}>
              <option value="">{t("shop.production.shared")}</option>
              {orderOptions.map((l) => <option key={l.custom_order_id!} value={l.custom_order_id!}>{l.order_number} · {l.customer_name}</option>)}
            </select>
          </label>
          {v.kind === "wastage" && (
            <label className={`${lbl} col-span-2`}>{t("shop.fabricStock.reason")}
              <select className={field} value={v.reason} onChange={set("reason")}>
                {WASTAGE_REASONS.map((r) => <option key={r} value={r}>{t(`shop.fabricStock.reasons.${r}`)}</option>)}
              </select>
            </label>
          )}
          <label className={lbl}>{t("shop.production.forJerseys")}<input type="number" min={0} step={1} className={field} value={v.pieces ?? ""} onChange={set("pieces")} placeholder={String(forPieces || "")} /></label>
          {material === "fabric" ? (
            <label className={lbl}>{t("shop.production.kg")}<input type="number" min={0.001} step="0.001" className={field} value={v.kg ?? ""} onChange={set("kg")} placeholder={suggestion !== null ? String(suggestion) : ""} required={suggestion === null} /></label>
          ) : (
            <label className={lbl}>{t("shop.production.qty")}<input type="number" min={1} step={1} className={field} value={v.qty ?? ""} onChange={set("qty")} placeholder={suggestion !== null ? String(suggestion) : ""} required={suggestion === null} /></label>
          )}
          <label className={`${lbl} col-span-2`}>{t("shop.production.note")}<input className={field} value={v.note ?? ""} onChange={set("note")} /></label>
          {suggestion !== null && <div className="col-span-2 sm:col-span-4 text-xs text-text-muted">{t("shop.production.suggest", { n: unit(material, suggestion) })}</div>}
          <button type="submit" disabled={busy} className={`${btnPrimary} col-span-2 sm:col-span-4`}>{busy ? t("shop.production.saving") : t("shop.production.takeOut")}</button>
        </form>
      )}
    </section>
  );
}

/* ---------- Cost summary ---------- */

function Summary({ data }: { data: DetailData }) {
  const { t } = useT();
  const b = data.batch;
  const tot = b.totals;
  if (!tot) return null;
  const rows: ["fabric" | "accessories" | "printing" | "garments" | "extras", number][] = [
    ["fabric", Number(tot.fabric_cost)],
    ["accessories", Number(tot.accessory_cost)],
    ["printing", Number(tot.print_cost)],
    ["garments", Number(tot.garments_cost)],
    ["extras", Number(tot.extra_cost)],
  ];
  const total = Number(tot.total_cost);
  const perPiece = tot.cost_per_piece === null ? null : Number(tot.cost_per_piece);

  // Lines → orders
  const byOrder = new Map<string, { key: string; label: string; pieces: number; cost: number; price: number | null; final: boolean }>();
  for (const c of b.line_costs) {
    const line = b.lines.find((l) => l.id === c.line_id);
    const key = c.custom_order_id ?? `line:${c.line_id}`;
    const p = c.custom_order_id ? b.order_prices[c.custom_order_id] : undefined;
    const row = byOrder.get(key) ?? {
      key,
      label: line?.order_number ? `${line.order_number} · ${line.customer_name ?? ""}` : line?.label || "—",
      pieces: 0, cost: 0,
      price: p && p.quantity > 0 ? p.price / p.quantity : null,
      final: p?.final ?? false,
    };
    row.pieces += c.pieces;
    row.cost += c.total_cost;
    byOrder.set(key, row);
  }
  const orders = [...byOrder.values()];

  return (
    <section className={`${card} p-3 space-y-3`}>
      <h2 className={h2}>{t("shop.production.summary")}</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-center">
        {rows.map(([k, v]) => (
          <div key={k} className="bg-surface-subtle rounded p-2">
            <div className="text-xs text-text-muted">{t(`shop.production.costs.${k}`)}</div>
            <div className="font-semibold tabular-nums">{taka(v)}</div>
            {total > 0 && <div className="text-[11px] text-text-muted">{Math.round((v / total) * 100)}%</div>}
          </div>
        ))}
        <div className="bg-primary/10 rounded p-2">
          <div className="text-xs text-text-muted">{t("shop.production.costs.total")}</div>
          <div className="font-bold tabular-nums">{taka(total)}</div>
          <div className="text-[11px] text-text-muted">{t("shop.production.pieces", { n: tot.pieces })}</div>
        </div>
      </div>
      <div className="flex items-baseline justify-between bg-primary text-white rounded-lg px-4 py-3">
        <span className="text-sm font-semibold uppercase">{t("shop.production.perJersey")}</span>
        <span className="text-2xl font-bold tabular-nums">{perPiece !== null ? taka(perPiece) : "—"}</span>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-1">{t("shop.production.perOrder")}</h3>
        {orders.length === 0 ? (
          <p className="text-xs text-text-muted">{t("shop.production.saveFirst")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead className="text-xs text-text-muted text-right">
                <tr>
                  <th className="text-left font-normal py-1">{t("shop.production.order")}</th>
                  <th className="font-normal">{t("shop.production.colPieces")}</th>
                  <th className="font-normal">{t("shop.production.colCost")}</th>
                  <th className="font-normal">{t("shop.production.colPerPc")}</th>
                  <th className="font-normal">{t("shop.production.colPrice")}</th>
                  <th className="font-normal">{t("shop.production.colProfit")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light text-right">
                {orders.map((o) => {
                  const per = o.pieces ? o.cost / o.pieces : 0;
                  const profit = o.price !== null ? (o.price - per) * o.pieces : null;
                  return (
                    <tr key={o.key}>
                      <td className="text-left py-1.5 truncate max-w-56">{o.label}</td>
                      <td>{o.pieces}</td>
                      <td>{taka(Math.round(o.cost))}</td>
                      <td className="font-semibold">{taka(Math.round(per))}</td>
                      <td>{o.price !== null ? <>{taka(Math.round(o.price))}{!o.final && <span className="block text-[10px] text-text-muted">{t("shop.production.estimate")}</span>}</> : "—"}</td>
                      <td className={profit === null ? "" : profit >= 0 ? "text-green-600 dark:text-green-400 font-semibold" : "text-badge-discount font-semibold"}>{profit !== null ? taka(Math.round(profit)) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
