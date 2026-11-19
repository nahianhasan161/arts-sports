"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Pencil, Plus, Sticker } from "lucide-react";
import { useT } from "@/i18n/client";
import { taka } from "@/lib/pos/types";
import { api, btnGhost, btnPrimary, card, dateTime, field } from "@/components/admin/pos/api";
import { SUPPLIER_PAY_METHODS } from "@/lib/pos/purchase-types";
import { WASTAGE_REASONS, type WastageReason } from "@/lib/custom-jersey/fabric-stock";
import { ACCESSORY_KINDS, type AccessoryMove, type AccessoryWithStock } from "@/lib/custom-jersey/production";
import { SupplierPicker, type SupplierOption } from "@/components/admin/pickers";

type Action = "purchase" | "used" | "wastage" | "adjust";
const ACTIONS: Action[] = ["purchase", "used", "wastage", "adjust"];
const n = (v: string | undefined) => (v === "" || v === undefined ? NaN : Number(v));
const URL_ = "/api/admin/accessory-stock";

interface Data {
  accessories: AccessoryWithStock[];
  suppliers: SupplierOption[];
  moves: AccessoryMove[];
}

/** Accessories for custom jerseys (silicon logo / name / number, labels...), in pieces. */
export default function AccessoryStock() {
  const { t, locale } = useT();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const res = await api<Data>(`${URL_}${filter ? `?accessory_id=${encodeURIComponent(filter)}` : ""}`);
    if (!res.ok) return setError(res.error);
    setError(null);
    setData(res.data);
  }, [filter]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const name = (a: { name_en: string; name_bn: string | null }) => (locale === "bn" && a.name_bn) || a.name_en;
  const itemName = (id: string) => {
    const a = data?.accessories.find((x) => x.id === id);
    return a ? name(a) : "—";
  };

  async function undo(m: AccessoryMove) {
    const reason = prompt(t("shop.fabricStock.undoReason"));
    if (!reason?.trim()) return;
    const res = await api(URL_, { action: "void", id: m.id, reason });
    if (!res.ok) return setError(res.error);
    await load();
  }

  return (
    <div className="p-space-base max-w-5xl space-y-6">
      <div>
        <h1 className="font-display text-xl uppercase font-bold text-primary mb-1 flex items-center gap-2"><Sticker className="w-5 h-5" /> {t("shop.accessoryStock.title")}</h1>
        <p className="text-sm text-text-muted">{t("shop.accessoryStock.intro")}</p>
        {error && <div className="flex items-center gap-2 text-sm text-badge-discount bg-badge-discount/10 rounded-lg px-3 py-2 mt-3" role="alert"><AlertCircle className="w-4 h-4 shrink-0" /> {error}</div>}
      </div>

      {data && (
        <>
          {data.accessories.length === 0 && !adding && <p className="text-sm text-text-muted">{t("shop.accessoryStock.noItems")}</p>}
          <div className="grid gap-4 md:grid-cols-2">
            {data.accessories.map((a) => (
              <ItemCard key={a.id} item={a} name={name(a)} suppliers={data.suppliers} onSaved={load} onError={setError} />
            ))}
            {adding ? (
              <ItemForm onDone={async () => { setAdding(false); await load(); }} onCancel={() => setAdding(false)} onError={setError} />
            ) : (
              <button className={`${card} p-4 flex items-center justify-center gap-2 text-sm font-semibold text-primary border-dashed hover:bg-surface-subtle min-h-24`} onClick={() => setAdding(true)}>
                <Plus className="w-4 h-4" /> {t("shop.accessoryStock.add")}
              </button>
            )}
          </div>

          <section>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <h2 className="font-display text-lg uppercase font-bold text-primary">{t("shop.accessoryStock.history")}</h2>
              <select className={`${field} !w-auto ml-auto`} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label={t("shop.accessoryStock.allItems")}>
                <option value="">{t("shop.accessoryStock.allItems")}</option>
                {data.accessories.map((a) => <option key={a.id} value={a.id}>{name(a)}</option>)}
              </select>
            </div>
            <div className={`${card} divide-y divide-border-light`}>
              {data.moves.length === 0 && <p className="p-3 text-sm text-text-muted">{t("shop.fabricStock.empty")}</p>}
              {data.moves.map((m) => {
                const supplier = m.supplier_id ? data.suppliers.find((s) => s.id === m.supplier_id)?.name : null;
                return (
                  <div key={m.id} className={`p-3 text-sm flex flex-wrap items-baseline gap-x-3 gap-y-1 ${m.voided_at ? "opacity-50" : ""}`}>
                    <span className="text-xs text-text-muted w-36 shrink-0">{dateTime(m.created_at)}</span>
                    <span className="font-semibold">{t(`shop.fabricStock.kinds.${m.kind}`)}{m.reason ? ` · ${t(`shop.fabricStock.reasons.${m.reason as WastageReason}`)}` : ""}</span>
                    <span className={m.voided_at ? "line-through" : ""}>{itemName(m.accessory_id)}</span>
                    <span className={`tabular-nums font-semibold ${m.qty > 0 ? "text-green-600 dark:text-green-400" : "text-badge-discount"} ${m.voided_at ? "line-through" : ""}`}>{m.qty > 0 ? "+" : "−"}{t("shop.accessoryStock.pcs", { n: Math.abs(m.qty) })}</span>
                    {m.cost_per_pc !== null && <span className="text-text-muted">{taka(m.cost_per_pc)}/pc{m.total_cost !== null ? ` · ${taka(m.total_cost)}` : ""}</span>}
                    {supplier && <span className="text-text-muted">{supplier}</span>}
                    {m.batch_number && <span className="text-text-muted">{t("shop.accessoryStock.batch", { n: m.batch_number })}</span>}
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
        </>
      )}
      {!data && !error && <p className="text-sm text-text-muted">…</p>}
    </div>
  );
}

function ItemForm({ item, onDone, onCancel, onError }: { item?: AccessoryWithStock; onDone: () => Promise<void>; onCancel: () => void; onError: (e: string | null) => void }) {
  const { t } = useT();
  const [v, setV] = useState({
    name_en: item?.name_en ?? "",
    name_bn: item?.name_bn ?? "",
    kind: item?.kind ?? "logo",
    per_jersey: item?.per_jersey === null || item?.per_jersey === undefined ? "" : String(item.per_jersey),
    low_stock_pcs: item?.low_stock_pcs === null || item?.low_stock_pcs === undefined ? "" : String(item.low_stock_pcs),
    is_active: item?.is_active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((o) => ({ ...o, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await api(URL_, { action: "item", id: item?.id, ...v });
    setBusy(false);
    if (!res.ok) return onError(`${t("shop.fabricStock.failed")}: ${res.error}`);
    onError(null);
    await onDone();
  }

  const lbl = "flex flex-col gap-0.5 text-xs";
  return (
    <form onSubmit={submit} className={`${card} p-3 grid grid-cols-2 gap-2`}>
      <label className={lbl}>{t("shop.accessoryStock.nameEn")}<input required className={field} value={v.name_en} onChange={set("name_en")} placeholder="Silicon number" /></label>
      <label className={lbl}>{t("shop.accessoryStock.nameBn")}<input className={field} value={v.name_bn} onChange={set("name_bn")} placeholder="সিলিকন নম্বর" /></label>
      <label className={lbl}>{t("shop.accessoryStock.kind")}
        <select className={field} value={v.kind} onChange={set("kind")}>
          {ACCESSORY_KINDS.map((k) => <option key={k} value={k}>{t(`shop.accessoryStock.kinds.${k}`)}</option>)}
        </select>
      </label>
      <label className={lbl}>{t("shop.accessoryStock.perJersey")}<input type="number" min={0} step={1} className={field} value={v.per_jersey} onChange={set("per_jersey")} placeholder={t("shop.accessoryStock.perJerseyHint")} /></label>
      <label className={lbl}>{t("shop.accessoryStock.lowAt")}<input type="number" min={0} step={1} className={field} value={v.low_stock_pcs} onChange={set("low_stock_pcs")} /></label>
      <label className="text-xs flex items-center gap-1.5 self-end pb-2"><input type="checkbox" checked={v.is_active} onChange={(e) => setV((o) => ({ ...o, is_active: e.target.checked }))} /> {t("shop.accessoryStock.active")}</label>
      <div className="col-span-2 flex gap-2">
        <button type="submit" disabled={busy} className={`${btnPrimary} flex-1`}>{busy ? t("shop.fabricStock.saving") : t("shop.fabricStock.save")}</button>
        <button type="button" className={btnGhost} onClick={onCancel}>✕</button>
      </div>
    </form>
  );
}

function ItemCard({ item: a, name, suppliers, onSaved, onError }: { item: AccessoryWithStock; name: string; suppliers: SupplierOption[]; onSaved: () => Promise<void>; onError: (e: string | null) => void }) {
  const { t } = useT();
  const s = a.stock;
  const onHand = Number(s?.on_hand ?? 0);
  const low = a.low_stock_pcs !== null && onHand <= Number(a.low_stock_pcs);
  const avg = s?.avg_cost === null || s?.avg_cost === undefined ? null : Number(s.avg_cost);
  const [action, setAction] = useState<Action | null>(null);
  const [editing, setEditing] = useState(false);

  if (editing) return <ItemForm item={a} onDone={async () => { setEditing(false); await onSaved(); }} onCancel={() => setEditing(false)} onError={onError} />;

  return (
    <div className={`${card} p-3 flex flex-col gap-3 ${a.is_active ? "" : "opacity-70"}`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate flex items-center gap-2">
            {name}
            <button className="text-text-muted hover:text-primary" onClick={() => setEditing(true)} aria-label={t("shop.accessoryStock.edit")}><Pencil className="w-3.5 h-3.5" /></button>
          </div>
          <div className="text-xs text-text-muted">
            {t(`shop.accessoryStock.kinds.${a.kind}`)}
            {a.per_jersey ? ` · ${a.per_jersey}/jersey` : ""}
            {!a.is_active ? ` · ${t("shop.accessoryStock.hidden")}` : ""}
          </div>
          <div className="text-xs text-text-muted">{avg !== null ? t("shop.accessoryStock.avgCost", { price: taka(avg) }) : t("shop.accessoryStock.noCost")}</div>
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase text-text-muted">{t("shop.accessoryStock.onHand")}</div>
          <div className={`text-xl font-bold tabular-nums ${low || onHand < 0 ? "text-badge-discount" : "text-on-surface"}`}>{t("shop.accessoryStock.pcs", { n: onHand })}</div>
          {low && <div className="text-xs font-semibold text-badge-discount">{t("shop.accessoryStock.low")}</div>}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="bg-surface-subtle rounded p-2"><div className="text-text-muted">{t("shop.accessoryStock.bought")}</div><div className="font-semibold tabular-nums">{s?.bought_qty ?? 0}</div><div className="text-text-muted">{taka(Number(s?.bought_cost ?? 0))}</div></div>
        <div className="bg-surface-subtle rounded p-2"><div className="text-text-muted">{t("shop.accessoryStock.used")}</div><div className="font-semibold tabular-nums">{s?.used_qty ?? 0}</div></div>
        <div className="bg-surface-subtle rounded p-2"><div className="text-text-muted">{t("shop.accessoryStock.wasted")}</div><div className="font-semibold tabular-nums text-badge-discount">{s?.wasted_qty ?? 0}</div></div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {ACTIONS.map((x) => (
          <button key={x} className={`${action === x ? btnPrimary : btnGhost} !text-xs !px-2.5 !py-1.5`} onClick={() => setAction(action === x ? null : x)}>{t(`shop.accessoryStock.actions.${x}`)}</button>
        ))}
      </div>
      {action && (
        <MoveForm
          key={action}
          action={action}
          itemId={a.id}
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

function MoveForm({ action, itemId, suppliers, onDone, onError }: { action: Action; itemId: string; suppliers: SupplierOption[]; onDone: () => Promise<void>; onError: (e: string | null) => void }) {
  const { t } = useT();
  const [v, setV] = useState<Record<string, string>>({ method: "cash", reason: action === "wastage" ? "damaged" : "" });
  const [fromDrawer, setFromDrawer] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((o) => ({ ...o, [k]: e.target.value }));
  const total = action === "purchase" && n(v.qty) > 0 && n(v.cost_per_pc) >= 0 ? n(v.qty) * n(v.cost_per_pc) + (n(v.extra_cost) || 0) : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await api(URL_, { action, accessory_id: itemId, ...v, from_drawer: fromDrawer });
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
            <SupplierPicker category="accessories" className={field} suppliers={suppliers} value={v.supplier_id ?? ""} onChange={(id) => setV((o) => ({ ...o, supplier_id: id }))} placeholder={t("shop.fabricStock.noSupplier")} />
          </label>
          <label className={lbl}>{t("shop.accessoryStock.qty")}<input required type="number" step={1} min={1} className={field} value={v.qty ?? ""} onChange={set("qty")} /></label>
          <label className={lbl}>{t("shop.accessoryStock.costPerPc")}<input required type="number" step="0.01" min={0} className={field} value={v.cost_per_pc ?? ""} onChange={set("cost_per_pc")} /></label>
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
          <label className={lbl}>{t("shop.accessoryStock.qty")}<input required type="number" step={1} min={1} className={field} value={v.qty ?? ""} onChange={set("qty")} /></label>
          {action === "used" && <label className={lbl}>{t("shop.fabricStock.orderNumber")}<input className={field} value={v.order_number ?? ""} onChange={set("order_number")} placeholder="CJ-1001" /></label>}
        </>
      )}

      {action === "adjust" && (
        <label className={`${lbl} col-span-2`}>{t("shop.accessoryStock.adjustQty")}<input required type="number" step={1} className={field} value={v.qty ?? ""} onChange={set("qty")} /></label>
      )}

      <label className={`${lbl} col-span-2`}>{action === "adjust" ? t("shop.fabricStock.noteRequired") : t("shop.fabricStock.note")}
        <input required={action === "adjust"} className={field} value={v.note ?? ""} onChange={set("note")} />
      </label>
      <button type="submit" disabled={busy} className={`${btnPrimary} col-span-2`}>{busy ? t("shop.fabricStock.saving") : t("shop.fabricStock.save")}</button>
    </form>
  );
}
