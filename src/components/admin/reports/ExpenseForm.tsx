"use client";

import { useState } from "react";
import { useT } from "@/i18n/client";
import { api, btnGhost, btnPrimary, field } from "@/components/admin/pos/api";
import { EXPENSE_CATEGORIES, EXPENSE_METHODS, EXPENSE_PLACES, type ExpenseCategory, type ExpenseMethod, type ExpensePlace } from "@/lib/admin/expenses";

/** Add one spending (rent, salary, ads…). The server checks every field again. */
export default function ExpenseForm({ today, showrooms, onSaved, onCancel }: { today: string; showrooms: { id: string; name: string }[]; onSaved: () => void; onCancel: () => void }) {
  const { t } = useT();
  const [spentOn, setSpentOn] = useState(today);
  const [category, setCategory] = useState<ExpenseCategory>("rent");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<ExpenseMethod>("cash");
  const [place, setPlace] = useState<ExpensePlace>("both");
  const [showroomId, setShowroomId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await api("/api/admin/expenses", { spent_on: spentOn, category, amount: Number(amount), method, place, showroom_id: place === "shop" ? showroomId : "", note });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onSaved();
  }

  const label = "text-xs font-semibold text-text-muted";
  return (
    <form onSubmit={save} className="print:hidden rounded-xl border border-accent-gold/40 bg-accent-gold-soft p-3 sm:p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="grid gap-1">
        <span className={label}>{t("admin.report.spending.date")}</span>
        <input type="date" required value={spentOn} max={today} onChange={(e) => setSpentOn(e.target.value)} className={field} />
      </label>
      <label className="grid gap-1">
        <span className={label}>{t("admin.report.spending.category")}</span>
        <select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)} className={field}>
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(`admin.report.cat.${c}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1">
        <span className={label}>{t("admin.report.spending.amount")}</span>
        <input type="number" required min="1" step="any" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={field} />
      </label>
      <label className="grid gap-1">
        <span className={label}>{t("admin.report.spending.method")}</span>
        <select value={method} onChange={(e) => setMethod(e.target.value as ExpenseMethod)} className={field}>
          {EXPENSE_METHODS.map((m) => (
            <option key={m} value={m}>
              {t(`admin.report.method.${m}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1">
        <span className={label}>{t("admin.report.spending.place")}</span>
        <select value={place} onChange={(e) => setPlace(e.target.value as ExpensePlace)} className={field}>
          {EXPENSE_PLACES.map((p) => (
            <option key={p} value={p}>
              {t(`admin.report.place.${p}`)}
            </option>
          ))}
        </select>
      </label>
      {place === "shop" && showrooms.length > 1 && (
        <label className="grid gap-1">
          <span className={label}>{t("admin.report.spending.branch")}</span>
          <select value={showroomId} onChange={(e) => setShowroomId(e.target.value)} className={field}>
            <option value="">—</option>
            {showrooms.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="grid gap-1 sm:col-span-2">
        <span className={label}>{t("admin.report.spending.note")}</span>
        <input value={note} maxLength={500} required={category === "other"} placeholder={t("admin.report.spending.notePlaceholder")} onChange={(e) => setNote(e.target.value)} className={field} />
      </label>
      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
        <button type="submit" disabled={busy || !amount} className={btnPrimary}>
          {t("admin.report.spending.save")}
        </button>
        <button type="button" onClick={onCancel} className={btnGhost}>
          {t("admin.report.spending.cancel")}
        </button>
        {error && <p className="text-sm text-badge-discount">{error}</p>}
      </div>
    </form>
  );
}
