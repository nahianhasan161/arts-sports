"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { useT } from "@/i18n/client";
import { taka } from "@/lib/pos/types";
import { api, btnPrimary, card, dateTime, field } from "@/components/admin/pos/api";
import { Sheet, SupplierForm } from "@/components/admin/purchases/SupplierForm";
import { SUPPLIER_CATEGORIES, supplierCategories, type SupplierBalance, type SupplierFull } from "@/lib/pos/purchase-types";

/** Every supplier with what we bought, paid and still owe. */
export default function SuppliersPage() {
  const { t } = useT();
  const pathname = usePathname();
  const [suppliers, setSuppliers] = useState<SupplierFull[]>([]);
  const [balances, setBalances] = useState<Map<string, SupplierBalance>>(new Map());
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await api<{ suppliers: SupplierFull[]; balances: SupplierBalance[]; balances_error: string | null }>("/api/admin/inventory/suppliers");
    setLoading(false);
    if (!res.ok) return setError(res.error);
    setSuppliers(res.data.suppliers);
    setBalances(new Map(res.data.balances.map((b) => [b.supplier_id, b])));
    setError(res.data.balances_error);
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return suppliers.filter(
      (s) =>
        (!term || [s.name, s.phone, s.alt_phone, s.contact_person].some((v) => v?.toLowerCase().includes(term))) &&
        (!kind || (kind === "none" ? !supplierCategories(s.categories).length : supplierCategories(s.categories).includes(kind as never)))
    );
  }, [suppliers, q, kind]);
  const totalDue = [...balances.values()].reduce((s, b) => s + Math.max(0, b.due), 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("shop.supplier.search")} className={`${field} pl-9`} />
        </div>
        <select value={kind} onChange={(e) => setKind(e.target.value)} className={`${field} !w-auto`} aria-label={t("shop.supplier.categories")}>
          <option value="">{t("shop.supplier.allCategories")}</option>
          {SUPPLIER_CATEGORIES.map((c) => <option key={c} value={c}>{t(`shop.supplier.category.${c}`)}</option>)}
          <option value="none">{t("shop.supplier.untagged")}</option>
        </select>
        <button className={btnPrimary} onClick={() => setAdding(true)}>
          <Plus className="w-4 h-4" /> {t("shop.supplier.add")}
        </button>
        {totalDue > 0 && <span className="ml-auto text-sm font-semibold text-badge-discount">{t("shop.supplier.totalDue", { amount: taka(totalDue) })}</span>}
      </div>
      {error && <p className="text-sm text-badge-discount bg-badge-discount/10 rounded p-3">{error}</p>}

      <div className={`${card} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead className="text-xs text-text-muted text-left">
            <tr>
              <th className="p-2">{t("shop.purchase.supplier")}</th>
              <th className="p-2">{t("shop.supplier.phone")}</th>
              <th className="p-2 text-right">{t("shop.supplier.bought")}</th>
              <th className="p-2 text-right">{t("shop.supplier.paid")}</th>
              <th className="p-2 text-right">{t("shop.supplier.due")}</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="p-4 text-text-muted">
                  {t("shop.common.loading")}
                </td>
              </tr>
            )}
            {!loading && shown.length === 0 && (
              <tr>
                <td colSpan={5} className="p-4 text-text-muted">
                  {t("shop.common.none")}
                </td>
              </tr>
            )}
            {shown.map((s) => {
              const b = balances.get(s.id);
              return (
                <tr key={s.id} className={`border-t border-border-light hover:bg-surface-subtle ${s.is_active ? "" : "opacity-60"}`}>
                  <td className="p-2">
                    <Link href={`${pathname}/${s.id}`} className="font-semibold text-primary hover:underline">
                      {s.name}
                    </Link>
                    {!s.is_active && <span className="ml-2 text-xs text-text-muted">({t("shop.supplier.inactive")})</span>}
                    {supplierCategories(s.categories).map((c) => (
                      <span key={c} className="ml-1.5 inline-block rounded-full bg-primary/10 text-primary text-[10px] font-semibold px-1.5 py-0.5 align-middle">{t(`shop.supplier.category.${c}`)}</span>
                    ))}
                    <span className="block text-xs text-text-muted">
                      {[s.contact_person, b?.last_purchase_at ? t("shop.supplier.lastPurchase", { date: dateTime(b.last_purchase_at) }) : t("shop.supplier.never")].filter(Boolean).join(" · ")}
                    </span>
                  </td>
                  <td className="p-2 text-xs">{s.phone ? <a href={`tel:${s.phone}`}>{s.phone}</a> : "—"}</td>
                  <td className="p-2 text-right">
                    {taka(b?.bought ?? 0)}
                    {b && b.purchases > 0 && <span className="block text-[11px] text-text-muted">{t("shop.supplier.purchases", { n: b.purchases })}</span>}
                  </td>
                  <td className="p-2 text-right text-green-700">{taka(b?.paid ?? 0)}</td>
                  <td className={`p-2 text-right font-semibold ${(b?.due ?? 0) > 0 ? "text-badge-discount" : "text-text-muted"}`}>{taka(b?.due ?? s.opening_due ?? 0)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {adding && (
        <Sheet title={t("shop.supplier.add")} onClose={() => setAdding(false)}>
          <SupplierForm
            onCancel={() => setAdding(false)}
            onSaved={() => {
              setAdding(false);
              void load();
            }}
          />
        </Sheet>
      )}
    </div>
  );
}
