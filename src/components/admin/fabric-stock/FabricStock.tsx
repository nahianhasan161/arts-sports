"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Layers, Pencil, Plus, Trash2 } from "lucide-react";
import { useT } from "@/i18n/client";
import { taka } from "@/lib/pos/types";
import { api, btnGhost, btnPrimary, card, dateTime, field } from "@/components/admin/pos/api";
import { SUPPLIER_PAY_METHODS } from "@/lib/pos/purchase-types";
import { WASTAGE_REASONS, piecesFor, type FabricMove, type FabricWithStock } from "@/lib/custom-jersey/fabric-stock";
import { SupplierPicker, type SupplierOption } from "@/components/admin/pickers";

type Action = "purchase" | "used" | "wastage" | "adjust";
const ACTIONS: Action[] = ["purchase", "used", "wastage", "adjust"];
const kgFmt = (n: number) => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 }).format(Number(n) || 0);
const n = (v: string) => (v === "" ? NaN : Number(v));

interface Data {
  fabrics: FabricWithStock[];
  suppliers: SupplierOption[];
  moves: FabricMove[];
}

/** Fabric (raw material) for custom jerseys, in kg: buy, use per order, wastage. */
export default function FabricStock() {
  const { t, locale } = useT();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const res = await api<Data>(`/api/admin/fabric-stock${filter ? `?fabric_id=${encodeURIComponent(filter)}` : ""}`);
    if (!res.ok) return setError(res.error);
    setError(null);
    setData(res.data);
  }, [filter]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const name = (f: { name_en: string; name_bn: string | null }) => (locale === "bn" && f.name_bn) || f.name_en;
  const fabricName = (id: string) => {
    const f = data?.fabrics.find((x) => x.id === id);
    return f ? name(f) : "—";
  };

  async function undo(m: FabricMove) {
    const reason = prompt(t("shop.fabricStock.undoReason"));
    if (!reason?.trim()) return;
    const res = await api("/api/admin/fabric-stock", { action: "void", id: m.id, reason });
    if (!res.ok) return setError(res.error);
    await load();
  }

  return (
    <div className="p-space-base max-w-5xl space-y-6">
      <div>
        <h1 className="font-display text-xl uppercase font-bold text-primary mb-1 flex items-center gap-2"><Layers className="w-5 h-5" /> {t("shop.fabricStock.title")}</h1>
        <p className="text-sm text-text-muted">{t("shop.fabricStock.intro")}</p>
        <button className={`${btnPrimary} mt-3`} onClick={() => setAdding((a) => !a)}><Plus className="w-4 h-4" /> {t("shop.fabricStock.addFabric")}</button>
        {error && <div className="flex items-center gap-2 text-sm text-badge-discount bg-badge-discount/10 rounded-lg px-3 py-2 mt-3" role="alert"><AlertCircle className="w-4 h-4 shrink-0" /> {error}</div>}
      </div>

      {adding && (
        <FabricForm
          onDone={async () => {
            setAdding(false);
            await load();
          }}
          onCancel={() => setAdding(false)}
          onError={setError}
        />
      )}

      {!data ? (
        !error && <p className="text-sm text-text-muted">…</p>
      ) : data.fabrics.length === 0 ? (
        !adding && <p className="text-sm text-text-muted">{t("shop.fabricStock.noFabrics")}</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.fabrics.map((f) => (
            <FabricCard key={f.id} fabric={f} name={name(f)} suppliers={data.suppliers} onSaved={load} onError={setError} />
          ))}
        </div>
      )}

      {data && (
        <section>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <h2 className="font-display text-lg uppercase font-bold text-primary">{t("shop.fabricStock.history")}</h2>
            <select className={`${field} !w-auto ml-auto`} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label={t("shop.fabricStock.allFabrics")}>
              <option value="">{t("shop.fabricStock.allFabrics")}</option>
              {data.fabrics.map((f) => <option key={f.id} value={f.id}>{name(f)}</option>)}
            </select>
          </div>
          <div className={`${card} divide-y divide-border-light`}>
            {data.moves.length === 0 && <p className="p-3 text-sm text-text-muted">{t("shop.fabricStock.empty")}</p>}
            {data.moves.map((m) => {
              const supplier = m.supplier_id ? data.suppliers.find((s) => s.id === m.supplier_id)?.name : null;
              return (
                <div key={m.id} className={`p-3 text-sm flex flex-wrap items-baseline gap-x-3 gap-y-1 ${m.voided_at ? "opacity-50" : ""}`}>
                  <span className="text-xs text-text-muted w-36 shrink-0">{dateTime(m.created_at)}</span>
                  <span className="font-semibold">{t(`shop.fabricStock.kinds.${m.kind}`)}{m.reason ? ` · ${t(`shop.fabricStock.reasons.${m.reason}`)}` : ""}</span>
                  <span className={m.voided_at ? "line-through" : ""}>{fabricName(m.fabric_id)}</span>
                  <span className={`tabular-nums font-semibold ${m.kg > 0 ? "text-green-600 dark:text-green-400" : "text-badge-discount"} ${m.voided_at ? "line-through" : ""}`}>{m.kg > 0 ? "+" : "−"}{kgFmt(Math.abs(m.kg))} kg</span>
                  {m.pieces ? <span className="text-text-muted">{m.pieces} {t("shop.fabricStock.pieces")}</span> : null}
                  {m.kind === "purchase" && m.cost_per_kg !== null && <span className="text-text-muted">{taka(m.cost_per_kg)}/kg · {taka(m.total_cost ?? 0)}</span>}
                  {supplier && <span className="text-text-muted">{supplier}</span>}
                  {m.order_number && <span className="text-text-muted">{m.order_number}</span>}
                  {m.note && <span className="text-text-muted italic">{m.note}</span>}
                  {m.staff && <span className="text-xs text-text-muted">{t("shop.fabricStock.by", { name: m.staff })}</span>}
                  {m.voided_at ? (
                    <span className="text-xs text-badge-discount ml-auto">{t("shop.fabricStock.undone", { reason: m.void_reason ?? "" })}</span>
                  ) : (
                    <button className="text-xs underline underline-offset-2 ml-auto text-text-muted hover:text-badge-discount" onClick={() => undo(m)}>{t("shop.fabricStock.undo")}</button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function FabricForm({ fabric, onDone, onCancel, onError }: { fabric?: FabricWithStock; onDone: () => Promise<void>; onCancel: () => void; onError: (e: string | null) => void }) {
  const { t } = useT();
  const str = (x: number | null | undefined) => (x === null || x === undefined ? "" : String(x));
  const [v, setV] = useState({
    name_en: fabric?.name_en ?? "",
    name_bn: fabric?.name_bn ?? "",
    price_per_piece: str(fabric?.price_per_piece),
    kg_per_piece: str(fabric?.kg_per_piece),
    low_stock_kg: str(fabric?.low_stock_kg),
    is_active: fabric?.is_active ?? true,
  });
  const [tiers, setTiers] = useState<{ min: string; price: string }[]>(() => (fabric?.price_tiers ?? []).map((x) => ({ min: String(x.min), price: String(x.price) })));
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV((o) => ({ ...o, [k]: e.target.value }));
  const setTier = (i: number, k: "min" | "price", value: string) => setTiers((list) => list.map((x, j) => (j === i ? { ...x, [k]: value } : x)));
  const addTier = () =>
    setTiers((list) => {
      const last = list.length ? Number(list[list.length - 1].min) || 0 : 0;
      return [...list, { min: String(last ? last + 5 : 5), price: "" }];
    });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const filled = tiers.filter((x) => x.min.trim() && x.price.trim());
    const mins = filled.map((x) => Number(x.min));
    if (mins.some((m) => !Number.isInteger(m) || m < 2)) return onError(t("shop.fabricStock.tierMinWrong"));
    if (new Set(mins).size !== mins.length) return onError(t("shop.fabricStock.tierDuplicate"));
    setBusy(true);
    const price_tiers = filled.map((x) => ({ min: Number(x.min), price: Number(x.price) })).sort((a, b) => a.min - b.min);
    const res = await api("/api/admin/fabric-stock", { action: "fabric", id: fabric?.id, ...v, price_tiers });
    setBusy(false);
    if (!res.ok) return onError(`${t("shop.fabricStock.failed")}: ${res.error}`);
    onError(null);
    await onDone();
  }

  const lbl = "flex flex-col gap-0.5 text-xs";
  return (
    <form onSubmit={submit} className={`${card} p-3 grid grid-cols-2 gap-2`}>
      {!fabric && <div className="col-span-2 font-semibold text-sm">{t("shop.fabricStock.addFabric")}</div>}
      <label className={lbl}>{t("shop.fabricStock.nameEn")}<input required className={field} value={v.name_en} onChange={set("name_en")} placeholder="Dry-fit mesh" /></label>
      <label className={lbl}>{t("shop.fabricStock.nameBn")}<input className={field} value={v.name_bn} onChange={set("name_bn")} placeholder="ড্রাই-ফিট মেশ" /></label>
      <label className={lbl}>{t("shop.fabricStock.perPiece")}<input type="number" step="0.001" min={0} className={field} value={v.kg_per_piece} onChange={set("kg_per_piece")} placeholder={t("shop.fabricStock.perPieceHint")} /></label>
      <label className={lbl}>{t("shop.fabricStock.lowAt")}<input type="number" step="0.1" min={0} className={field} value={v.low_stock_kg} onChange={set("low_stock_kg")} /></label>
      <label className="col-span-2 text-xs flex items-center gap-1.5"><input type="checkbox" checked={v.is_active} onChange={(e) => setV((o) => ({ ...o, is_active: e.target.checked }))} /> {t("shop.fabricStock.showCustomers")}</label>
      {v.is_active && (
        <>
          <label className={`${lbl} col-span-2`}>{t("shop.fabricStock.pricePerPiece")}<input required type="number" step="1" min={0} className={field} value={v.price_per_piece} onChange={set("price_per_piece")} /></label>
          <div className="col-span-2 flex flex-col gap-1.5">
            <div className="text-xs">{t("shop.fabricStock.tiersTitle")}</div>
            {tiers.map((x, i) => (
              <div key={i} className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-xs flex-1 min-w-0">
                  <input type="number" step="1" min={2} className={`${field} w-full`} value={x.min} onChange={(e) => setTier(i, "min", e.target.value)} aria-label={t("shop.fabricStock.tierMin")} />
                  <span className="shrink-0 text-text-muted">{t("shop.fabricStock.tierPcsUp")}</span>
                </label>
                <label className="flex items-center gap-1 text-xs flex-1 min-w-0">
                  <span className="shrink-0 text-text-muted">৳</span>
                  <input type="number" step="1" min={0} className={`${field} w-full`} value={x.price} onChange={(e) => setTier(i, "price", e.target.value)} aria-label={t("shop.fabricStock.tierPrice")} placeholder={t("shop.fabricStock.tierPrice")} />
                </label>
                <button type="button" className="text-text-muted hover:text-badge-discount shrink-0 p-1" onClick={() => setTiers((list) => list.filter((_, j) => j !== i))} aria-label={t("shop.fabricStock.tierRemove")} title={t("shop.fabricStock.tierRemove")}><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
            <button type="button" className="self-start text-xs font-semibold text-primary underline underline-offset-2" onClick={addTier}>+ {t("shop.fabricStock.tierAdd")}</button>
            <p className="text-[11px] text-text-muted">{t("shop.fabricStock.tiersHint")}</p>
          </div>
        </>
      )}
      <p className="col-span-2 text-[11px] text-text-muted">{t("shop.fabricStock.formHint")}</p>
      <div className="col-span-2 flex gap-2">
        <button type="submit" disabled={busy} className={`${btnPrimary} flex-1`}>{busy ? t("shop.fabricStock.saving") : t("shop.fabricStock.save")}</button>
        <button type="button" className={btnGhost} onClick={onCancel}>✕</button>
      </div>
    </form>
  );
}

function FabricCard({ fabric: f, name, suppliers, onSaved, onError }: { fabric: FabricWithStock; name: string; suppliers: SupplierOption[]; onSaved: () => Promise<void>; onError: (e: string | null) => void }) {
  const { t } = useT();
  const s = f.stock;
  const onHand = Number(s?.on_hand_kg ?? 0);
  const perPiece = f.kg_per_piece === null ? null : Number(f.kg_per_piece);
  const low = f.low_stock_kg !== null && onHand <= Number(f.low_stock_kg);
  const pieces = piecesFor(onHand, perPiece);
  const avg = s?.avg_cost_per_kg === null || s?.avg_cost_per_kg === undefined ? null : Number(s.avg_cost_per_kg);
  const used = Number(s?.used_kg ?? 0);
  const wasted = Number(s?.wasted_kg ?? 0);
  const wastePct = used + wasted > 0 ? Math.round((wasted / (used + wasted)) * 1000) / 10 : null;

  const [kgPer, setKgPer] = useState(perPiece === null ? "" : String(perPiece));
  const [lowAt, setLowAt] = useState(f.low_stock_kg === null ? "" : String(f.low_stock_kg));
  const [savedSettings, setSavedSettings] = useState(false);
  const [action, setAction] = useState<Action | null>(null);
  const [editing, setEditing] = useState(false);

  async function remove() {
    if (!confirm(t("shop.fabricStock.deleteConfirm", { name }))) return;
    const res = await api("/api/admin/fabric-stock", { action: "delete_fabric", id: f.id });
    if (!res.ok) return onError(res.error);
    onError(null);
    await onSaved();
  }

  async function saveSettings() {
    const res = await api("/api/admin/fabric-stock", { action: "settings", fabric_id: f.id, kg_per_piece: kgPer, low_stock_kg: lowAt });
    if (!res.ok) return onError(res.error);
    onError(null);
    setSavedSettings(true);
    setTimeout(() => setSavedSettings(false), 1500);
    await onSaved();
  }

  if (editing) return <FabricForm fabric={f} onDone={async () => { setEditing(false); await onSaved(); }} onCancel={() => setEditing(false)} onError={onError} />;

  return (
    <div className={`${card} p-3 flex flex-col gap-3`}>
      <div className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {f.image_url ? <img src={f.image_url} alt="" className="w-12 h-12 rounded object-cover border border-border-light" /> : <div className="w-12 h-12 rounded bg-surface-subtle border border-border-light" />}
        <div className="flex-1 min-w-0">
          <div className="font-semibold flex items-center gap-2 min-w-0">
            <span className="truncate">{name}</span>
            <button className="text-text-muted hover:text-primary shrink-0" onClick={() => setEditing(true)} aria-label={t("shop.fabricStock.edit")} title={t("shop.fabricStock.edit")}><Pencil className="w-3.5 h-3.5" /></button>
            <button className="text-text-muted hover:text-badge-discount shrink-0" onClick={remove} aria-label={t("shop.fabricStock.delete")} title={t("shop.fabricStock.delete")}><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
          <div className="text-xs text-text-muted">{f.is_active ? t("shop.fabricStock.onlinePrice", { price: taka(Number(f.price_per_piece ?? 0)) }) : t("shop.fabricStock.stockOnly")}</div>
          {f.is_active && f.price_tiers?.length ? (
            <div className="text-xs text-text-muted">{f.price_tiers.map((x) => t("shop.fabricStock.tierShort", { n: x.min, price: taka(Number(x.price)) })).join(" · ")}</div>
          ) : null}
          <div className="text-xs text-text-muted">{avg !== null ? t("shop.fabricStock.avgCost", { price: taka(avg) }) : t("shop.fabricStock.noCost")}</div>
          {avg !== null && perPiece ? <div className="text-xs text-text-muted">{t("shop.fabricStock.costPerPiece", { price: taka(Math.round(avg * perPiece)) })}</div> : null}
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase text-text-muted">{t("shop.fabricStock.onHand")}</div>
          <div className={`text-xl font-bold tabular-nums ${low || onHand < 0 ? "text-badge-discount" : "text-on-surface"}`}>{t("shop.fabricStock.kg", { n: kgFmt(onHand) })}</div>
          {pieces !== null && <div className="text-xs text-text-muted">{t("shop.fabricStock.enoughFor", { n: Math.max(0, pieces) })}</div>}
          {low && <div className="text-xs font-semibold text-badge-discount">{t("shop.fabricStock.low")}</div>}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="bg-surface-subtle rounded p-2"><div className="text-text-muted">{t("shop.fabricStock.bought")}</div><div className="font-semibold tabular-nums">{kgFmt(Number(s?.bought_kg ?? 0))} kg</div><div className="text-text-muted">{taka(Number(s?.bought_cost ?? 0))}</div></div>
        <div className="bg-surface-subtle rounded p-2"><div className="text-text-muted">{t("shop.fabricStock.used")}</div><div className="font-semibold tabular-nums">{kgFmt(used)} kg</div><div className="text-text-muted">{s?.used_pieces ?? 0} {t("shop.fabricStock.pieces")}</div></div>
        <div className="bg-surface-subtle rounded p-2"><div className="text-text-muted">{t("shop.fabricStock.wasted")}</div><div className="font-semibold tabular-nums text-badge-discount">{kgFmt(wasted)} kg</div><div className="text-text-muted">{wastePct !== null ? t("shop.fabricStock.wastePercent", { n: wastePct }) : `${s?.wasted_pieces ?? 0} ${t("shop.fabricStock.pieces")}`}</div></div>
      </div>

      <div className="flex flex-wrap items-end gap-2 text-xs">
        <label className="flex flex-col gap-0.5 flex-1 min-w-28">{t("shop.fabricStock.perPiece")}<input type="number" step="0.001" min={0} className={field} value={kgPer} onChange={(e) => setKgPer(e.target.value)} placeholder={t("shop.fabricStock.perPieceHint")} /></label>
        <label className="flex flex-col gap-0.5 w-28">{t("shop.fabricStock.lowAt")}<input type="number" step="0.1" min={0} className={field} value={lowAt} onChange={(e) => setLowAt(e.target.value)} /></label>
        <button className={btnGhost} onClick={saveSettings}>{savedSettings ? t("shop.fabricStock.saved") : t("shop.fabricStock.saveSettings")}</button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {ACTIONS.map((a) => (
          <button key={a} className={`${action === a ? btnPrimary : btnGhost} !text-xs !px-2.5 !py-1.5`} onClick={() => setAction(action === a ? null : a)}>{t(`shop.fabricStock.actions.${a}`)}</button>
        ))}
      </div>
      {action && (
        <MoveForm
          key={action}
          action={action}
          fabricId={f.id}
          kgPerPiece={perPiece}
          suppliers={suppliers}
          onDone={async () => {
            setAction(null);
            onError(null);
            await onSaved();
          }}
          onError={onError}
        />
      )}
    </div>
  );
}

function MoveForm({ action, fabricId, kgPerPiece, suppliers, onDone, onError }: { action: Action; fabricId: string; kgPerPiece: number | null; suppliers: SupplierOption[]; onDone: () => Promise<void>; onError: (e: string | null) => void }) {
  const { t } = useT();
  const [v, setV] = useState<Record<string, string>>({ method: "cash", reason: action === "wastage" ? "cutting" : "" });
  const [fromDrawer, setFromDrawer] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((o) => ({ ...o, [k]: e.target.value }));

  const total = action === "purchase" && n(v.kg) > 0 && n(v.cost_per_kg) >= 0 ? n(v.kg) * n(v.cost_per_kg) + (n(v.extra_cost) || 0) : null;
  const autoKg = (action === "used" || action === "wastage") && !(n(v.kg) > 0) && n(v.pieces) > 0 && kgPerPiece ? Math.round(n(v.pieces) * kgPerPiece * 1000) / 1000 : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await api("/api/admin/fabric-stock", { action, fabric_id: fabricId, ...v, from_drawer: fromDrawer });
    setBusy(false);
    if (!res.ok) return onError(`${t("shop.fabricStock.failed")}: ${res.error}`);
    await onDone();
  }

  const lbl = "flex flex-col gap-0.5 text-xs";
  return (
    <form onSubmit={submit} className="grid grid-cols-2 gap-2 bg-surface-subtle/60 rounded-lg p-2.5 border border-border-light">
      {action === "purchase" && (
        <>
          <label className={`${lbl} col-span-2`}>{t("shop.fabricStock.supplier")}
            <SupplierPicker className={field} suppliers={suppliers} value={v.supplier_id ?? ""} onChange={(id) => setV((o) => ({ ...o, supplier_id: id }))} placeholder={t("shop.fabricStock.noSupplier")} />
          </label>
          <label className={lbl}>{t("shop.fabricStock.kgLabel")}<input required type="number" step="0.001" min={0.001} className={field} value={v.kg ?? ""} onChange={set("kg")} /></label>
          <label className={lbl}>{t("shop.fabricStock.costPerKg")}<input required type="number" step="0.01" min={0} className={field} value={v.cost_per_kg ?? ""} onChange={set("cost_per_kg")} /></label>
          <label className={lbl}>{t("shop.fabricStock.extraCost")}<input type="number" step="0.01" min={0} className={field} value={v.extra_cost ?? ""} onChange={set("extra_cost")} /></label>
          <div className="text-sm font-semibold self-end pb-2">{total !== null && t("shop.fabricStock.total", { amount: taka(total) })}</div>
          {v.supplier_id && (
            <>
              <label className={lbl}>{t("shop.fabricStock.paidNow")}<input type="number" step="0.01" min={0} className={field} value={v.paid ?? ""} onChange={set("paid")} /></label>
              <label className={lbl}>{t("shop.fabricStock.method")}
                <select className={field} value={v.method} onChange={set("method")}>
                  {SUPPLIER_PAY_METHODS.map((m) => <option key={m} value={m}>{t(`shop.purchase.method.${m}`)}</option>)}
                </select>
              </label>
              <label className={lbl}>{t("shop.fabricStock.payRef")}<input className={field} value={v.pay_reference ?? ""} onChange={set("pay_reference")} /></label>
              {v.method === "cash" && <label className="text-xs flex items-center gap-1.5 self-end pb-2"><input type="checkbox" checked={fromDrawer} onChange={(e) => setFromDrawer(e.target.checked)} /> {t("shop.fabricStock.fromDrawer")}</label>}
            </>
          )}
        </>
      )}

      {(action === "used" || action === "wastage") && (
        <>
          {action === "wastage" && (
            <label className={`${lbl} col-span-2`}>{t("shop.fabricStock.reason")}
              <select className={field} value={v.reason} onChange={set("reason")}>
                {WASTAGE_REASONS.map((r) => <option key={r} value={r}>{t(`shop.fabricStock.reasons.${r}`)}</option>)}
              </select>
            </label>
          )}
          <label className={lbl}>{t("shop.fabricStock.pieces")}<input type="number" step="1" min={0} className={field} value={v.pieces ?? ""} onChange={set("pieces")} /></label>
          <label className={lbl}>{t("shop.fabricStock.orKg")}<input type="number" step="0.001" min={0} className={field} value={v.kg ?? ""} onChange={set("kg")} placeholder={autoKg !== null ? String(autoKg) : ""} /></label>
          {autoKg !== null && <div className="col-span-2 text-xs text-text-muted -mt-1">{t("shop.fabricStock.autoKg", { kg: kgFmt(autoKg) })}</div>}
          {action === "used" && <label className={`${lbl} col-span-2`}>{t("shop.fabricStock.orderNumber")}<input className={field} value={v.order_number ?? ""} onChange={set("order_number")} placeholder="CJ-1001" /></label>}
        </>
      )}

      {action === "adjust" && (
        <label className={`${lbl} col-span-2`}>{t("shop.fabricStock.adjustKg")}<input required type="number" step="0.001" className={field} value={v.kg ?? ""} onChange={set("kg")} /></label>
      )}

      <label className={`${lbl} col-span-2`}>{action === "adjust" ? t("shop.fabricStock.noteRequired") : t("shop.fabricStock.note")}
        <input required={action === "adjust"} className={field} value={v.note ?? ""} onChange={set("note")} />
      </label>
      <button type="submit" disabled={busy} className={`${btnPrimary} col-span-2`}>{busy ? t("shop.fabricStock.saving") : t("shop.fabricStock.save")}</button>
    </form>
  );
}
