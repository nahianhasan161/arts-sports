"use client";

import { useCallback, useEffect, useState } from "react";
import { Trash2, Upload } from "lucide-react";
import { useT } from "@/i18n/client";
import { parseDelimited, parseXlsx } from "@/lib/custom-jersey/roster";
import { api, btnGhost, btnPrimary, card, field } from "@/components/admin/pos/api";
import type { Supplier } from "./types";

interface SupplierStock {
  variant_id: string;
  supplier_id: string;
  quantity: number;
  unit_cost: number | null;
  title: string;
  label: string;
  code: string;
}

const EMPTY = { id: "", name: "", phone: "", address: "", notes: "", lead_days: "3", is_active: true };

/** Suppliers, and what each of them has that we can bring in (secondary stock). */
export function Suppliers({ onChanged }: { onChanged: () => void }) {
  const { t } = useT();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [stock, setStock] = useState<SupplierStock[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [target, setTarget] = useState("");
  const [paste, setPaste] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await api<{ suppliers: Supplier[]; stock: SupplierStock[] }>("/api/admin/inventory/suppliers");
    if (!res.ok) return setError(res.error);
    setSuppliers(res.data.suppliers);
    setStock(res.data.stock);
    setTarget((current) => current || res.data.suppliers[0]?.id || "");
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function send(body: Record<string, unknown>) {
    const res = await api<{ saved?: number; unknown?: string[] }>("/api/admin/inventory/suppliers", body);
    if (!res.ok) {
      setError(res.error);
      return null;
    }
    setError(null);
    await load();
    onChanged();
    return res.data;
  }

  /** Rows of: code (barcode or SKU), quantity, buying price. A header row is skipped. */
  async function upload(cells: string[][]) {
    const rows = cells
      .filter((c) => c[0]?.trim() && /^\d+$/.test((c[1] ?? "").trim()))
      .map((c) => ({ code: c[0].trim(), quantity: Number(c[1]), unit_cost: (c[2] ?? "").trim() }));
    if (!rows.length) return setError(t("shop.suppliers.noRows"));
    const data = await send({ action: "stock", supplier_id: target, rows });
    if (!data) return;
    setPaste("");
    setMessage(t("shop.suppliers.uploaded", { n: data.saved ?? 0 }) + (data.unknown?.length ? ` ${t("shop.suppliers.unknownCodes", { codes: data.unknown.join(", ") })}` : ""));
  }

  return (
    <div className="grid lg:grid-cols-2 gap-4 items-start">
      <section className="flex flex-col gap-3">
        {error && <p className="text-sm text-badge-discount">{error}</p>}
        <form
          className={`${card} p-3 grid grid-cols-2 gap-2`}
          onSubmit={async (e) => {
            e.preventDefault();
            if (await send({ action: "save", ...form, id: form.id || undefined, lead_days: Number(form.lead_days) })) setForm(EMPTY);
          }}
        >
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t("shop.suppliers.name")} className={field} required />
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder={t("shop.common.phone")} className={field} />
          <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder={t("shop.suppliers.address")} className={`${field} col-span-2`} />
          <label className="text-xs text-text-muted flex flex-col gap-1">
            {t("shop.suppliers.leadDays")}
            <input value={form.lead_days} onChange={(e) => setForm({ ...form, lead_days: e.target.value })} className={field} inputMode="numeric" />
          </label>
          <label className="text-sm flex items-center gap-2 self-end pb-2">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
            {t("shop.suppliers.active")}
          </label>
          <div className="col-span-2 flex gap-2">
            <button className={btnPrimary}>{t(form.id ? "shop.common.save" : "shop.suppliers.add")}</button>
            {form.id && (
              <button type="button" className={btnGhost} onClick={() => setForm(EMPTY)}>
                {t("shop.common.cancel")}
              </button>
            )}
          </div>
        </form>

        <ul className={`${card} divide-y divide-border-light`}>
          {suppliers.length === 0 && <li className="p-3 text-sm text-text-muted">{t("shop.common.none")}</li>}
          {suppliers.map((s) => (
            <li key={s.id} className="p-3 flex justify-between gap-2 text-sm">
              <button className="text-left" onClick={() => setForm({ id: s.id, name: s.name, phone: s.phone ?? "", address: s.address ?? "", notes: s.notes ?? "", lead_days: String(s.lead_days), is_active: s.is_active })}>
                <strong className={s.is_active ? "text-primary" : "text-text-muted line-through"}>{s.name}</strong>
                <span className="block text-xs text-text-muted">
                  {[s.phone, s.address, t("shop.suppliers.days", { n: s.lead_days })].filter(Boolean).join(" · ")}
                </span>
              </button>
              <button
                className="text-text-muted hover:text-badge-discount"
                onClick={() => {
                  if (window.confirm(t("shop.suppliers.confirmDelete", { name: s.name }))) void send({ action: "delete", id: s.id });
                }}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <div className={`${card} p-3 flex flex-col gap-2`}>
          <h3 className="text-sm font-semibold">{t("shop.suppliers.stockTitle")}</h3>
          <p className="text-xs text-text-muted">{t("shop.suppliers.uploadHint")}</p>
          <select value={target} onChange={(e) => setTarget(e.target.value)} className={field}>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <textarea value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={"AS00012345\t20\t350"} rows={4} className={`${field} font-mono text-xs`} />
          <div className="flex gap-2 flex-wrap">
            <button className={btnPrimary} disabled={!target || !paste.trim()} onClick={() => upload(parseDelimited(paste))}>
              {t("shop.common.save")}
            </button>
            <label className={`${btnGhost} cursor-pointer`}>
              <Upload className="w-4 h-4" /> {t("shop.suppliers.upload")}
              <input
                type="file"
                accept=".csv,.xlsx,.txt"
                className="hidden"
                disabled={!target}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  try {
                    await upload(/\.xlsx$/i.test(file.name) ? await parseXlsx(await file.arrayBuffer()) : parseDelimited(await file.text()));
                  } catch (err) {
                    setError(err instanceof Error ? err.message : String(err));
                  }
                }}
              />
            </label>
          </div>
          {message && <p className="text-xs text-green-700">{message}</p>}
        </div>

        {stock.length > 0 && (
          <div className={`${card} overflow-x-auto`}>
            <table className="w-full text-sm">
              <tbody>
                {stock.map((s) => (
                  <tr key={`${s.variant_id}:${s.supplier_id}`} className="border-t border-border-light first:border-0">
                    <td className="p-2">
                      {s.title} <span className="text-text-muted">{s.label}</span>
                      <span className="block text-xs text-text-muted">{suppliers.find((x) => x.id === s.supplier_id)?.name}</span>
                    </td>
                    <td className="p-2 text-right font-semibold">{s.quantity}</td>
                    <td className="p-2 text-right text-text-muted">{s.unit_cost === null ? "" : `৳${s.unit_cost}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
