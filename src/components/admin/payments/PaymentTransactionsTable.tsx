"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Loader2, Receipt } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { formatTaka } from "@/lib/pricing";
import type { Payment, PaymentStatus, PaymentType } from "@/types";

/**
 * The payment ledger for one order, or for the order behind one return.
 *
 * The admin payments tab has always shown this table. The order detail and the
 * return detail did not -- an admin looking at an order had to go to the
 * payments tab, find the order's rows among everything else, and correlate them
 * by hand. Same data, one click away, unlinked.
 *
 * Deliberately a read-only projection of the same shape rather than a second
 * implementation: the status <select> on the main tab is a live edit, and
 * duplicating that here would give an order page and a payments page two ways
 * to change the same row. Edits stay where they were.
 */

export interface PaymentTransactionsTableProps {
  /** The order whose ledger to show. */
  orderId: string;
  /** When set, only the rows belonging to this return are shown. */
  returnId?: string;
  /** Hides the "no transactions" line when the caller has its own empty state. */
  className?: string;
}

interface RefundLink {
  refund_id: string;
  return_id: string | null;
  cancellation_id: string | null;
}

const STATUS_STYLES: Record<PaymentStatus, string> = {
  initiated: "bg-yellow-100 text-yellow-700",
  successful: "bg-green-100 text-green-700",
  // Amber, not red: money out but the charge is still good and more may yet
  // follow. Red would read as "this payment is bad".
  partially_refunded: "bg-amber-100 text-amber-700",
  failed: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-700",
  refunded: "bg-purple-100 text-purple-700",
  charged_back: "bg-purple-100 text-purple-700",
};

const TYPE_STYLES: Record<PaymentType, string> = {
  charge: "bg-blue-100 text-blue-700",
  refund: "bg-green-100 text-green-700",
  chargeback: "bg-orange-100 text-orange-700",
};

const STATUS_LABEL: Record<PaymentStatus, string> = {
  initiated: "Initiated",
  successful: "Successful",
  partially_refunded: "Partly refunded",
  failed: "Failed",
  cancelled: "Cancelled",
  refunded: "Refunded",
  charged_back: "Charged back",
};

export function PaymentTransactionsTable({
  orderId,
  returnId,
  className = "",
}: PaymentTransactionsTableProps) {
  const { toast } = useToast();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [refundLinks, setRefundLinks] = useState<Record<string, RefundLink>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      /*
       * The financials endpoint already returns the ledger alongside the derived
       * totals, so this is one request rather than a payments list that then
       * needs a second call to know what each row means.
       */
      const res = await fetch(`/api/orders/${orderId}/financials`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Could not load transactions");

      const rows: Payment[] = json?.payments ?? [];
      setPayments(rows);

      // Which refunds aggregate each refund row belongs to, so a refund can be
      // traced back to the return or cancellation that produced it. Read from
      // the refunds list, keyed by the payments row the aggregate wrote.
      if (rows.some((p) => p.type === "refund")) {
        const refundsRes = await fetch(
          `/api/admin/refunds?order_id=${encodeURIComponent(orderId)}&limit=200`,
          { cache: "no-store" }
        );
        const refundsJson = await refundsRes.json();
        const links: Record<string, RefundLink> = {};
        for (const r of refundsJson?.data ?? []) {
          const txn = r.transaction_ref ?? null;
          if (!txn) continue;
          // The refund's payments row carries the same reference.
          const match = rows.find(
            (p) => p.type === "refund" && p.provider_txn_id === txn
          );
          if (match) {
            links[match.id] = {
              refund_id: r.id,
              return_id: r.return_id ?? null,
              cancellation_id: r.cancellation_id ?? null,
            };
          }
        }
        setRefundLinks(links);
      } else {
        setRefundLinks({});
      }
    } catch (err) {
      toast("Error loading transactions: " + String(err), "error");
    } finally {
      setLoading(false);
    }
  }, [orderId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = returnId
    ? payments.filter((p) => refundLinks[p.id]?.return_id === returnId)
    : payments;

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-text-muted py-4">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading transactions...
      </div>
    );
  }

  if (visible.length === 0) {
    return (
      <p className="text-xs text-text-muted py-3">
        {returnId
          ? "No transactions recorded against this return yet."
          : "No payment transactions recorded for this order."}
      </p>
    );
  }

  const charged = visible
    .filter((p) => p.type === "charge")
    .reduce((sum, p) => sum + Number(p.amount), 0);
  const refunded = visible
    .filter((p) => p.type === "refund" || p.type === "chargeback")
    .reduce((sum, p) => sum + Number(p.amount), 0);

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {/* Same columns as the main payments tab: ID, Order, Type, Provider,
          Amount, Status -- minus the live status select, which stays on that
          tab so a row has exactly one place it can be edited. */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-surface-subtle">
            <tr>
              <th className="text-left font-semibold text-text-muted uppercase tracking-wider px-3 py-2">
                Payment ID
              </th>
              <th className="text-center font-semibold text-text-muted uppercase tracking-wider px-3 py-2">
                Type
              </th>
              <th className="text-left font-semibold text-text-muted uppercase tracking-wider px-3 py-2">
                Provider
              </th>
              <th className="text-right font-semibold text-text-muted uppercase tracking-wider px-3 py-2">
                Amount
              </th>
              <th className="text-center font-semibold text-text-muted uppercase tracking-wider px-3 py-2">
                Status
              </th>
              <th className="text-left font-semibold text-text-muted uppercase tracking-wider px-3 py-2">
                Reference
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => {
              const link = refundLinks[p.id];
              return (
                <tr key={p.id} className="border-b border-border-light last:border-b-0">
                  <td className="px-3 py-2 font-mono text-on-surface">{p.id.slice(0, 8)}…</td>
                  <td className="px-3 py-2 text-center">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full font-medium ${
                        TYPE_STYLES[p.type] ?? "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {p.type}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-on-surface capitalize">{p.provider}</td>
                  <td className="px-3 py-2 text-on-surface text-right font-medium">
                    ৳ {Number(p.amount).toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full font-medium ${
                        STATUS_STYLES[p.status] ?? "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {STATUS_LABEL[p.status] ?? p.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-text-muted">
                    {p.provider_txn_id ? (
                      <span className="font-mono">{p.provider_txn_id}</span>
                    ) : link ? (
                      // Traced back to the aggregate that produced it, so an
                      // admin can get from a money row to the reason.
                      <span className="font-mono">{link.refund_id.slice(0, 8)}…</span>
                    ) : (
                      <span className="opacity-50">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* A short summary, so the order page states its own money position
          without an admin adding the column up. */}
      <div className="flex items-center justify-between text-xs text-text-muted px-1">
        <span className="flex items-center gap-1.5">
          <Receipt className="w-3.5 h-3.5" />
          {visible.length} transaction{visible.length === 1 ? "" : "s"}
        </span>
        <span className="flex items-center gap-3">
          <span>
            Charged <strong className="text-on-surface">{formatTaka(charged)}</strong>
          </span>
          {refunded > 0 && (
            <span>
              Refunded <strong className="text-emerald-700">{formatTaka(refunded)}</strong>
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
