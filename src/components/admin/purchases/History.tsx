"use client";

import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import { taka } from "@/lib/pos/types";
import { dateTime } from "@/components/admin/pos/api";
import type { AuditEntry, PurchaseEdit } from "@/lib/pos/purchase-types";
import { methodKey } from "@/lib/pos/purchase-types";

const FIELDS = [
  "reference", "invoice_date", "note", "discount", "extra_cost", "subtotal", "total_cost", "name", "contact_person", "phone",
  "alt_phone", "email", "address", "payment_info", "notes", "lead_days", "opening_due", "is_active", "amount", "method",
  "voided_at", "void_reason", "price", "original_price", "regular_price", "base_price", "cost_price", "discount_type",
  "discount_value", "discount_mode", "price_override", "regular_price_override", "quantity", "unit_cost",
] as const;
const ENTITIES = ["suppliers", "stock_receipts", "stock_receipt_items", "supplier_payments", "products", "product_variants"] as const;
const MONEY = /price|cost|amount|discount$|discount_value|due|subtotal/;
/** Columns that are ids or bookkeeping, not something a person changed. */
const HIDDEN = new Set(["id", "created_at", "updated_at", "receipt_id", "supplier_id", "received_by", "paid_by", "cash_move_id", "showroom_id", "receipt_no", "voided_by", "product_id", "variant_id", "session_id", "created_by"]);

function useLabels() {
  const { t } = useT();
  const field = (k: string) => ((FIELDS as readonly string[]).includes(k) ? t(`shop.history.field.${k}` as MessageKey) : k.replace(/_/g, " "));
  const entity = (k: string) => ((ENTITIES as readonly string[]).includes(k) ? t(`shop.history.entity.${k}` as MessageKey) : k.replace(/_/g, " "));
  const value = (k: string, v: unknown): string => {
    if (v === null || v === undefined || v === "") return "—";
    if (typeof v === "boolean") return v ? "✓" : "✗";
    if (k === "method" && typeof v === "string") return t(methodKey(v));
    if (MONEY.test(k) && !Number.isNaN(Number(v)) && typeof v !== "object") return taka(Number(v));
    if (typeof v === "object") return JSON.stringify(v).slice(0, 80);
    const s = String(v);
    return s.length > 80 ? `${s.slice(0, 80)}…` : s;
  };
  return { t, field, entity, value };
}

/** Rows of the audit log, in words: who, when, what changed from what to what, and why. */
export function AuditList({ entries }: { entries: AuditEntry[] }) {
  const { t, field, entity, value } = useLabels();
  if (!entries.length) return <p className="text-xs text-text-muted">{t("shop.history.none")}</p>;
  return (
    <ol className="flex flex-col gap-2 text-xs">
      {entries.map((e) => {
        const shown = Object.entries(e.changes).filter(([k, v]) => !HIDDEN.has(k) && (e.action === "update" || (v !== null && v !== "" && v !== false)));
        return (
          <li key={e.id} className="border-l-2 border-border-light pl-2">
            <p>
              <strong>{e.who}</strong> · {t(`shop.history.${e.action}`)} {entity(e.entity_type)} · <span className="text-text-muted">{dateTime(e.occurred_at)}</span>
            </p>
            <ul className="text-text-muted">
              {shown.slice(0, 12).map(([k, v]) => (
                <li key={k}>
                  {e.action === "update" && v && typeof v === "object" && "from" in v
                    ? t("shop.history.change", { field: field(k), from: value(k, (v as { from: unknown; to: unknown }).from), to: value(k, (v as { from: unknown; to: unknown }).to) })
                    : `${field(k)}: ${value(k, v)}`}
                </li>
              ))}
            </ul>
            {e.reason && <p className="text-amber-700 dark:text-amber-400">{t("shop.history.why", { reason: e.reason })}</p>}
          </li>
        );
      })}
    </ol>
  );
}

/** Corrections to one purchase, line by line. */
export function PurchaseEdits({ edits, names }: { edits: PurchaseEdit[]; names: Record<string, string> }) {
  const { t, field, value } = useLabels();
  if (!edits.length) return null;
  const cost = (c: number | null | undefined) => (c === null || c === undefined ? "—" : taka(c));
  return (
    <ol className="flex flex-col gap-2 text-xs">
      {edits.map((e) => {
        const lines: string[] = [];
        if (e.kind === "payment_void") {
          lines.push(t("shop.history.paymentVoid", { amount: taka(e.before.amount ?? 0), method: t(methodKey(e.before.method ?? "other")) }));
          if (e.after.cash_back_in_drawer) lines.push(t("shop.history.cashBack"));
        } else {
          for (const k of ["reference", "invoice_date", "note", "discount", "extra_cost", "subtotal"] as const) {
            const from = e.before[k];
            const to = e.after[k];
            if (String(from ?? "") !== String(to ?? "")) lines.push(t("shop.history.change", { field: field(k), from: value(k, from), to: value(k, to) }));
          }
          const before = new Map((e.before.items ?? []).map((i) => [i.variant_id, i]));
          const after = new Map((e.after.items ?? []).map((i) => [i.variant_id, i]));
          for (const [id, a] of after) {
            const item = names[id] ?? id;
            const b = before.get(id);
            if (!b) lines.push(t("shop.history.added", { item, qty: a.quantity, cost: cost(a.unit_cost) }));
            else {
              if (b.quantity !== a.quantity) lines.push(t("shop.history.qty", { item, from: b.quantity, to: a.quantity }));
              if ((b.unit_cost ?? null) !== (a.unit_cost ?? null) && Number(b.unit_cost) !== Number(a.unit_cost)) lines.push(t("shop.history.cost", { item, from: cost(b.unit_cost), to: cost(a.unit_cost) }));
            }
          }
          for (const [id, b] of before) if (!after.has(id)) lines.push(t("shop.history.removed", { item: names[id] ?? id, qty: b.quantity }));
        }
        return (
          <li key={e.id} className="border-l-2 border-amber-500 pl-2">
            <p>
              <strong>{e.staff || "—"}</strong> · <span className="text-text-muted">{dateTime(e.created_at)}</span>
            </p>
            <ul>
              {lines.map((l, n) => (
                <li key={n}>{l}</li>
              ))}
            </ul>
            <p className="text-amber-700 dark:text-amber-400">{t("shop.history.why", { reason: e.reason })}</p>
          </li>
        );
      })}
    </ol>
  );
}
