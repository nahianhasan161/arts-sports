"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Image from "next/image";
import { Loader2, Plus, Trash2, AlertTriangle, ShieldCheck } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { formatTaka } from "@/lib/pricing";
import type { RefundDeductionKind } from "@/types";

/**
 * The refund builder.
 *
 * The refund API has existed and been verified for a while, but there was no way
 * to use it: the admin returns table used to collect a refund amount with
 * window.prompt() and write it straight onto the return, which is how a number
 * got there with no payment row behind it. That prompt is gone and the API is
 * the only path -- so this is the screen that closes the loop.
 *
 * It does three things the API cannot do for itself:
 *
 *   1. fills the refund lines from what was actually ordered and is not already
 *      being returned, so an admin cannot ask for units that do not exist;
 *   2. adds deductions with a reason, because a refund smaller than the goods
 *      needs an explanation a customer can be shown;
 *   3. shows the live refundable balance, and refuses to submit before the
 *      server has to.
 *
 * Everything on screen comes from GET /api/orders/:id/financials. The client
 * never derives the balance from a partial list.
 */

interface OrderItem {
  id: string;
  title: string;
  size: string | null;
  color: string | null;
  quantity: number;
  unit_price: number;
  image: string | null;
}

interface DeductionDraft {
  kind: RefundDeductionKind;
  label: string;
  amount: string;
}

interface RefundBuilderProps {
  orderId: string;
  /** The charge to refund against. Omit to let the panel pick the settleable one. */
  paymentId?: string;
  /** Set when the refund answers a customer return request. */
  returnId?: string;
  onDone?: () => void;
}

const DEDUCTION_PRESETS: { kind: RefundDeductionKind; label: string }[] = [
  { kind: "delivery_fee", label: "Delivery charge" },
  { kind: "restocking_fee", label: "Restocking fee" },
  { kind: "coupon_clawback", label: "Coupon value reclaimed" },
  { kind: "wear_and_tear", label: "Wear and tear" },
  { kind: "customer_request", label: "Customer-approved reduction" },
];

export function RefundBuilder({ orderId, paymentId, returnId, onDone }: RefundBuilderProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [returnedByItem, setReturnedByItem] = useState<Record<string, number>>({});
  const [charges, setCharges] = useState<{ payment_id: string; provider: string; amount: number; status: string }[]>([]);
  const [refundable, setRefundable] = useState(0);

  const [selectedPayment, setSelectedPayment] = useState(paymentId ?? "");
  /** order_item_id -> quantity to refund */
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [deductions, setDeductions] = useState<DeductionDraft[]>([]);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [transactionRef, setTransactionRef] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/financials`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Could not load the order's money position");

      const ledger = json?.payments ?? [];
      // A charge that can still take money back. execute_refund accepts
      // 'successful' and 'partially_refunded', which is what the endpoint's
      // refund_targets already reports.
      const refundableCharges = ledger
        .filter((p: { type: string }) => p.type === "charge")
        .map((p: { id: string; provider: string; amount: number; status: string }) => ({
          payment_id: p.id,
          provider: p.provider,
          amount: Number(p.amount),
          status: p.status,
        }))
        .filter((c: { status: string }) => c.status === "successful" || c.status === "partially_refunded");

      setCharges(refundableCharges);
      if (!paymentId && refundableCharges.length > 0) {
        setSelectedPayment(refundableCharges[0].payment_id);
      }
      setRefundable(Number(json?.data?.refundable_now ?? 0));

      // The order lines, plus how much of each is already on its way back, so
      // the quantity inputs can be capped at what is genuinely left.
      const [orderItems, returnsRes] = await Promise.all([
        fetch(`/api/admin/orders?order_id=${encodeURIComponent(orderId)}&limit=1`, { cache: "no-store" })
          .then((r) => r.json())
          .catch(() => null),
        fetch(`/api/admin/returns?order_id=${encodeURIComponent(orderId)}&limit=200`, { cache: "no-store" })
          .then((r) => r.json())
          .catch(() => null),
      ]);

      const lines = orderItems?.data?.[0]?.order_items ?? [];
      setItems(lines);

      const taken: Record<string, number> = {};
      for (const ret of returnsRes?.data ?? []) {
        if (ret.status === "rejected" || ret.status === "cancelled") continue;
        for (const line of ret.return_items ?? []) {
          taken[line.order_item_id] = (taken[line.order_item_id] ?? 0) + Number(line.quantity ?? 0);
        }
      }
      setReturnedByItem(taken);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load the refund builder");
    } finally {
      setLoading(false);
    }
  }, [orderId, paymentId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** How many units of a line are still returnable. */
  const availableFor = useCallback(
    (item: OrderItem) => Math.max(0, Number(item.quantity) - (returnedByItem[item.id] ?? 0)),
    [returnedByItem]
  );

  const itemTotal = useMemo(
    () =>
      items.reduce((sum, item) => {
        const qty = Number(quantities[item.id] ?? 0);
        return sum + (Number.isFinite(qty) ? qty * Number(item.unit_price) : 0);
      }, 0),
    [items, quantities]
  );

  const deductionTotal = useMemo(
    () =>
      deductions.reduce((sum, d) => {
        const amount = Number(d.amount);
        return sum + (Number.isFinite(amount) ? amount : 0);
      }, 0),
    [deductions]
  );

  const refundTotal = Math.max(0, itemTotal - deductionTotal);
  const overBalance = refundTotal > refundable;

  const submit = useCallback(async () => {
    const payload = {
      order_id: orderId,
      original_payment_id: selectedPayment,
      provider: charges.find((c) => c.payment_id === selectedPayment)?.provider,
      reason: reason.trim() || undefined,
      notes: notes.trim() || undefined,
      transaction_ref: transactionRef.trim() || undefined,
      return_id: returnId,
      items: items
        .map((item) => ({
          order_item_id: item.id,
          quantity: Number(quantities[item.id] ?? 0),
        }))
        .filter((i) => i.quantity > 0),
      deductions: deductions
        .filter((d) => Number(d.amount) > 0)
        .map((d) => ({
          kind: d.kind,
          label: d.label.trim() || d.kind,
          amount: Number(d.amount),
        })),
    };

    if (payload.items.length === 0) {
      toast("Choose at least one item to refund.", "error");
      return;
    }
    if (!selectedPayment) {
      toast("Pick the charge to refund against.", "error");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/refunds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();

      if (!res.ok) {
        // The server's detail names the shortfall, which is the part worth
        // showing: "refund of 500.00 is 440.00 more than the 60.00 refundable".
        toast(json?.detail ?? json?.error ?? "We could not process that refund.", "error");
        return;
      }

      toast(
        `Refund ${formatTaka(json.data?.refund_total ?? refundTotal)} processed. ${json.data?.payment_status}`,
        "success"
      );
      setQuantities({});
      setDeductions([]);
      setReason("");
      setNotes("");
      setTransactionRef("");
      await load();
      onDone?.();
    } catch (err) {
      toast("Error submitting refund: " + String(err), "error");
    } finally {
      setSubmitting(false);
    }
  }, [
    orderId, selectedPayment, charges, reason, notes, transactionRef, returnId,
    items, quantities, deductions, refundTotal, toast, load, onDone,
  ]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-text-muted py-6">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading the order&apos;s money position...
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex items-start gap-2 p-3 rounded-lg bg-badge-discount/10 border border-badge-discount/20 text-xs">
        <AlertTriangle className="w-4 h-4 text-badge-discount shrink-0 mt-0.5" />
        <span>{loadError}</span>
      </div>
    );
  }

  if (charges.length === 0) {
    return (
      <div className="p-4 rounded-lg bg-surface-subtle border border-border-light text-xs text-text-muted">
        This order has no settled payment, so there is nothing to refund. A cash-on-delivery
        order cannot be refunded until the delivery has been collected.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* The charge to refund against. Defaulted, but visible and changeable when
          an order somehow holds more than one. */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-on-surface" htmlFor="rf-charge">
          Refunding against
        </label>
        <select
          id="rf-charge"
          value={selectedPayment}
          onChange={(e) => setSelectedPayment(e.target.value)}
          className="h-9 px-2 rounded-lg border border-border-light bg-surface-card text-xs focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {charges.map((c) => (
            <option key={c.payment_id} value={c.payment_id}>
              {c.provider.toUpperCase()} · {formatTaka(c.amount)} · {c.status.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <p className="text-[11px] text-text-muted">
          Refundable now: <strong className="text-primary">{formatTaka(refundable)}</strong>
        </p>
      </div>

      {/* The lines, capped at what is still returnable. */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold text-on-surface">Items to refund</span>
        {items.map((item) => {
          const available = availableFor(item);
          const qty = quantities[item.id] ?? "0";
          const invalid = Number(qty) > available;
          return (
            <div
              key={item.id}
              className={`flex items-center gap-3 p-2 rounded-lg border ${
                invalid ? "border-badge-discount/50 bg-badge-discount/5" : "border-border-light"
              }`}
            >
              {item.image && (
                <div className="relative w-10 h-12 shrink-0 rounded">
                  <Image src={item.image} alt={item.title} fill sizes="40px" className="object-cover rounded" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-on-surface line-clamp-1">{item.title}</p>
                <p className="text-[11px] text-text-muted">
                  {[item.size, item.color].filter(Boolean).join(" • ")} · {formatTaka(Number(item.unit_price))} each
                </p>
                <p className="text-[11px] text-text-muted">
                  Ordered {item.quantity}
                  {returnedByItem[item.id] ? `, already returning ${returnedByItem[item.id]}` : ""} ·{" "}
                  <strong className={available === 0 ? "text-badge-discount" : "text-primary"}>
                    {available} returnable
                  </strong>
                </p>
              </div>
              <input
                type="number"
                min={0}
                max={available}
                value={qty}
                disabled={available === 0}
                onChange={(e) =>
                  setQuantities((prev) => ({ ...prev, [item.id]: e.target.value }))
                }
                aria-label={`Quantity to refund for ${item.title}`}
                className={`w-16 h-9 px-2 text-center text-xs rounded-lg border bg-surface-card focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-40 ${
                  invalid ? "border-badge-discount" : "border-border-light"
                }`}
              />
            </div>
          );
        })}
      </div>

      {/* Deductions. Each one is a row with a reason, so "we refunded the item
          minus the delivery charge" is answerable from the data. */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-on-surface">Deductions</span>
          <button
            type="button"
            onClick={() =>
              setDeductions((prev) => [...prev, { kind: "delivery_fee", label: "", amount: "" }])
            }
            className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-primary"
          >
            <Plus className="w-3 h-3" />
            Add deduction
          </button>
        </div>
        {deductions.map((d, index) => (
          <div key={index} className="flex items-center gap-2">
            <select
              value={d.kind}
              onChange={(e) =>
                setDeductions((prev) =>
                  prev.map((row, i) =>
                    i === index ? { ...row, kind: e.target.value as RefundDeductionKind } : row
                  )
                )
              }
              aria-label="Deduction kind"
              className="h-9 px-2 rounded-lg border border-border-light bg-surface-card text-xs"
            >
              {DEDUCTION_PRESETS.map((preset) => (
                <option key={preset.kind} value={preset.kind}>
                  {preset.label}
                </option>
              ))}
            </select>
            <input
              value={d.label}
              onChange={(e) =>
                setDeductions((prev) =>
                  prev.map((row, i) => (i === index ? { ...row, label: e.target.value } : row))
                )
              }
              placeholder="Label the customer will see"
              aria-label="Deduction label"
              className="flex-1 h-9 px-2 rounded-lg border border-border-light text-xs"
            />
            <input
              value={d.amount}
              onChange={(e) =>
                setDeductions((prev) =>
                  prev.map((row, i) => (i === index ? { ...row, amount: e.target.value } : row))
                )
              }
              placeholder="Amount"
              inputMode="decimal"
              aria-label="Deduction amount"
              className="w-24 h-9 px-2 rounded-lg border border-border-light text-xs"
            />
            <button
              type="button"
              onClick={() => setDeductions((prev) => prev.filter((_, i) => i !== index))}
              aria-label="Remove deduction"
              className="p-1.5 text-text-muted hover:text-badge-discount"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Notes and the wallet reference. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-on-surface" htmlFor="rf-reason">
            Reason (internal)
          </label>
          <input
            id="rf-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="changed mind"
            className="h-9 px-2 rounded-lg border border-border-light text-xs"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-on-surface" htmlFor="rf-trx">
            Wallet transaction ID
          </label>
          <input
            id="rf-trx"
            value={transactionRef}
            onChange={(e) => setTransactionRef(e.target.value.toUpperCase())}
            placeholder="e.g. 9F7K2M4X8A"
            className="h-9 px-2 rounded-lg border border-border-light text-xs uppercase"
          />
        </div>
      </div>

      {/* The running total. The server still checks it; showing it here means an
          admin sees the refusal before the request is wasted. */}
      <div className="p-3 rounded-lg bg-surface-subtle border border-border-light flex flex-col gap-1.5 text-xs">
        <div className="flex justify-between text-text-muted">
          <span>Items</span>
          <span className="text-on-surface font-semibold">{formatTaka(itemTotal)}</span>
        </div>
        {deductionTotal > 0 && (
          <div className="flex justify-between text-emerald-700 font-semibold">
            <span>Deductions</span>
            <span>−{formatTaka(deductionTotal)}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-border-light pt-1.5 text-sm font-bold text-primary">
          <span>Refund total</span>
          <span className="font-display">{formatTaka(refundTotal)}</span>
        </div>
        <div className="flex justify-between text-text-muted">
          <span>Refundable now</span>
          <span>{formatTaka(refundable)}</span>
        </div>
        {overBalance && (
          <p className="flex items-center gap-1.5 text-badge-discount font-semibold pt-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            That is {formatTaka(refundTotal - refundable)} more than this order has paid.
          </p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={submitting || overBalance || refundTotal <= 0 || !selectedPayment}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg text-xs font-bold font-display uppercase tracking-wider hover:bg-primary-container transition-colors disabled:opacity-50"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
          {submitting ? "Processing..." : `Refund ${formatTaka(refundTotal)}`}
        </button>
        <span className="text-[11px] text-text-muted">
          The server re-checks the balance and will refuse an over-refund.
        </span>
      </div>
    </div>
  );
}
