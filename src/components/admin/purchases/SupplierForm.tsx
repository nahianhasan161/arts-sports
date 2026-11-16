"use client";

import { useState } from "react";
import { useT } from "@/i18n/client";
import { api, btnGhost, btnPrimary, field } from "@/components/admin/pos/api";
import type { SupplierFull } from "@/lib/pos/purchase-types";

type Draft = Record<"name" | "contact_person" | "phone" | "alt_phone" | "email" | "address" | "payment_info" | "notes" | "lead_days" | "opening_due", string> & { is_active: boolean };

const toDraft = (s?: SupplierFull | null): Draft => ({
  name: s?.name ?? "",
  contact_person: s?.contact_person ?? "",
  phone: s?.phone ?? "",
  alt_phone: s?.alt_phone ?? "",
  email: s?.email ?? "",
  address: s?.address ?? "",
  payment_info: s?.payment_info ?? "",
  notes: s?.notes ?? "",
  lead_days: String(s?.lead_days ?? 3),
  opening_due: s?.opening_due ? String(s.opening_due) : "",
  is_active: s?.is_active ?? true,
});

/** Every detail of one supplier. Without `supplier` it adds a new one. */
export function SupplierForm({ supplier, onSaved, onCancel }: { supplier?: SupplierFull | null; onSaved: (id: string) => void; onCancel?: () => void }) {
  const { t } = useT();
  const [d, setD] = useState<Draft>(() => toDraft(supplier));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setD({ ...d, [k]: e.target.value });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await api<{ id: string }>("/api/admin/inventory/suppliers", { action: "save", id: supplier?.id, ...d, lead_days: Number(d.lead_days) || 0 });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setError(null);
    onSaved(res.data.id);
  }

  const label = "text-xs text-text-muted flex flex-col gap-1";
  return (
    <form onSubmit={save} className="grid sm:grid-cols-2 gap-2">
      <label className={`${label} sm:col-span-2`}>
        {t("shop.supplier.name")} *
        <input value={d.name} onChange={set("name")} className={field} required autoFocus={!supplier} />
      </label>
      <label className={label}>
        {t("shop.supplier.contactPerson")}
        <input value={d.contact_person} onChange={set("contact_person")} className={field} />
      </label>
      <label className={label}>
        {t("shop.supplier.email")}
        <input value={d.email} onChange={set("email")} className={field} type="email" />
      </label>
      <label className={label}>
        {t("shop.supplier.phone")}
        <input value={d.phone} onChange={set("phone")} className={field} inputMode="tel" />
      </label>
      <label className={label}>
        {t("shop.supplier.altPhone")}
        <input value={d.alt_phone} onChange={set("alt_phone")} className={field} inputMode="tel" />
      </label>
      <label className={`${label} sm:col-span-2`}>
        {t("shop.supplier.address")}
        <input value={d.address} onChange={set("address")} className={field} />
      </label>
      <label className={`${label} sm:col-span-2`}>
        {t("shop.supplier.paymentInfo")}
        <textarea value={d.payment_info} onChange={set("payment_info")} rows={2} className={field} />
      </label>
      <label className={label}>
        {t("shop.supplier.leadDays")}
        <input value={d.lead_days} onChange={set("lead_days")} className={field} inputMode="numeric" />
      </label>
      <label className={label}>
        {t("shop.supplier.openingDue")}
        <input value={d.opening_due} onChange={set("opening_due")} className={field} inputMode="decimal" placeholder="0" />
      </label>
      <label className={`${label} sm:col-span-2`}>
        {t("shop.supplier.notes")}
        <textarea value={d.notes} onChange={set("notes")} rows={2} className={field} />
      </label>
      <label className="text-sm flex items-center gap-2">
        <input type="checkbox" checked={d.is_active} onChange={(e) => setD({ ...d, is_active: e.target.checked })} />
        {t("shop.supplier.active")}
      </label>
      {error && <p className="sm:col-span-2 text-sm text-badge-discount">{error}</p>}
      <div className="sm:col-span-2 flex gap-2">
        <button className={btnPrimary} disabled={busy}>
          {busy ? t("shop.common.saving") : t(supplier ? "shop.common.save" : "shop.supplier.add")}
        </button>
        {onCancel && (
          <button type="button" className={btnGhost} onClick={onCancel}>
            {t("shop.common.cancel")}
          </button>
        )}
      </div>
    </form>
  );
}

/** A plain overlay for the forms and details on these screens. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto print:static print:bg-transparent print:p-0" onClick={onClose}>
      <div className="bg-surface-card text-on-surface rounded-xl border border-border-light w-full max-w-2xl p-4 my-8 print:my-0 print:border-0" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3 print:hidden">
          <h2 className="font-bold">{title}</h2>
          <button className="text-text-muted text-xl leading-none px-2" onClick={onClose} aria-label="close">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
