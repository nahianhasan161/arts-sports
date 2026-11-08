"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Search, Package, Plus } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { PaymentTransactionsTable } from "@/components/admin/payments/PaymentTransactionsTable";
import { RefundBuilder } from "@/components/admin/refunds/RefundBuilder";
import { formatTaka } from "@/lib/pricing";
import type { Return, ReturnStatus } from "@/types";

/** What the list route returns: the return plus its joined items. */
interface ReturnRow extends Return {
  return_items?: { id: string; order_item_id: string; quantity: number }[];
}

/**
 * Returns, in the admin.
 *
 * Three things this surface has never had:
 *
 *   1. the transactions behind a return, so an admin can see the refund that
 *      answered it without going to the payments tab;
 *   2. a way to return SOME of an order's products rather than all of them --
 *      the old form required typing line ids by hand, so a partial return was
 *      only possible if you already knew them;
 *   3. creating a return at all from this screen. It only ever listed them.
 *
 * The quantity rule is still enforced by the shared helper, so a partial return
 * cannot exceed what was ordered and is not already coming back.
 */

interface OrderLine {
  id: string;
  title: string;
  size: string | null;
  color: string | null;
  quantity: number;
  unit_price: number;
  image: string | null;
}

interface CreateDraft {
  order_id: string;
  scope: "all" | "some";
  lines: Record<string, string>;
  reason: string;
  notes: string;
}

export function AdminReturnsClient() {
  const { toast } = useToast();
  const router = useRouter();

  const [returns, setReturns] = useState<ReturnRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const limit = 25;

  /** The return whose detail panel is open. */
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [refundingFor, setRefundingFor] = useState<string | null>(null);

  /** The new-return form. */
  const [creating, setCreating] = useState(false);
  const [orderIdInput, setOrderIdInput] = useState("");
  const [draft, setDraft] = useState<CreateDraft | null>(null);
  const [orderLines, setOrderLines] = useState<OrderLine[]>([]);
  const [loadingOrder, setLoadingOrder] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function fetchReturns() {
    setLoading(true);
    try {
      const q = new URLSearchParams({
        offset: String(page * limit),
        limit: String(limit),
        ...(statusFilter && { status: statusFilter }),
      });
      const res = await fetch(`/api/admin/returns?${q.toString()}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setReturns(json.data || []);
      setTotal(json.count || 0);
    } catch (error) {
      toast("Error fetching returns: " + String(error), "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchReturns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter]);

  /** Load an order's lines so a partial return can be built from them. */
  const loadOrder = async (orderId: string) => {
    const id = orderId.trim();
    if (!id) return;
    setLoadingOrder(true);
    try {
      const res = await fetch(`/api/admin/orders?order_id=${encodeURIComponent(id)}&limit=1`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Could not load that order");
      const order = json?.data?.[0];
      if (!order) throw new Error("No order found with that ID");

      const lines: OrderLine[] = order.order_items ?? [];
      setOrderLines(lines);
      setDraft({
        order_id: order.id,
        scope: "all",
        lines: Object.fromEntries(lines.map((l) => [l.id, String(l.quantity)])),
        reason: "",
        notes: "",
      });
    } catch (error) {
      toast(String(error), "error");
      setOrderLines([]);
      setDraft(null);
    } finally {
      setLoadingOrder(false);
    }
  };

  const submitReturn = async () => {
    if (!draft) return;

    const items =
      draft.scope === "all"
        ? orderLines.map((l) => ({ order_item_id: l.id, quantity: Number(l.quantity) }))
        : orderLines
            .map((l) => ({ order_item_id: l.id, quantity: Number(draft.lines[l.id] ?? 0) }))
            .filter((i) => i.quantity > 0);

    if (items.length === 0) {
      toast("Choose at least one product and a quantity to return.", "error");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: draft.order_id,
          reason: draft.reason.trim() || null,
          notes: draft.notes.trim() || null,
          items,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        // The shared quantity rule reports which line and by how much, which is
        // far more useful than "invalid request".
        toast(json?.detail ?? json?.error ?? "Could not create the return", "error");
        return;
      }

      toast("Return created", "success");
      setCreating(false);
      setDraft(null);
      setOrderLines([]);
      setOrderIdInput("");
      await fetchReturns();
    } catch (error) {
      toast("Error creating return: " + String(error), "error");
    } finally {
      setSubmitting(false);
    }
  };

  const statusColors: Record<ReturnStatus, string> = {
    requested: "bg-yellow-100 text-yellow-700",
    approved: "bg-blue-100 text-blue-700",
    received: "bg-indigo-100 text-indigo-700",
    completed: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
  };

  const filteredReturns = returns.filter((r) => {
    if (search) {
      const s = search.toLowerCase();
      return r.id.toLowerCase().includes(s) || r.order_id.toLowerCase().includes(s);
    }
    return true;
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search by return or order ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-9 pl-10 pr-3 text-sm rounded-lg border border-border-light focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
          className="h-9 px-3 text-sm rounded-lg border border-border-light focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">All Statuses</option>
          <option value="requested">Requested</option>
          <option value="approved">Approved</option>
          <option value="received">Received</option>
          <option value="completed">Completed</option>
          <option value="rejected">Rejected</option>
        </select>
        <button
          onClick={() => { setCreating((v) => !v); setDraft(null); setOrderLines([]); }}
          className="inline-flex items-center gap-1.5 h-9 px-3 text-xs font-bold uppercase tracking-wider text-white bg-primary rounded-lg hover:bg-primary-container transition-colors"
        >
          <Plus className="w-4 h-4" />
          New return
        </button>
      </div>

      {/* Create form */}
      {creating && (
        <div className="bg-surface-card border border-border-light rounded-xl p-4 flex flex-col gap-4">
          <h3 className="text-sm font-display uppercase tracking-wider font-bold text-primary">
            Create a return
          </h3>

          {!draft ? (
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                value={orderIdInput}
                onChange={(e) => setOrderIdInput(e.target.value)}
                placeholder="Order ID, e.g. ORD-1A2B3C4D5E"
                className="flex-1 h-9 px-3 text-sm rounded-lg border border-border-light focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                onClick={() => void loadOrder(orderIdInput)}
                disabled={loadingOrder || !orderIdInput.trim()}
                className="h-9 px-4 text-xs font-bold uppercase tracking-wider rounded-lg bg-surface-subtle border border-border-light hover:bg-surface-container disabled:opacity-50"
              >
                {loadingOrder ? "Loading..." : "Load order"}
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-xs text-text-muted">
                Order <span className="font-mono font-semibold text-primary">{draft.order_id}</span> ·{" "}
                {orderLines.length} line{orderLines.length === 1 ? "" : "s"}
              </p>

              {/* All or some. The whole point of the screen: a partial return was
                  previously only possible if you already knew the line ids. */}
              <div className="flex gap-2">
                {(["all", "some"] as const).map((scope) => (
                  <button
                    key={scope}
                    onClick={() => setDraft({ ...draft, scope })}
                    className={`flex-1 px-3 py-2 rounded-lg border text-xs font-bold uppercase tracking-wider transition-colors ${
                      draft.scope === scope
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border-light text-on-surface-variant hover:bg-surface-subtle"
                    }`}
                  >
                    {scope === "all" ? "All products" : "Some products"}
                  </button>
                ))}
              </div>

              <div className="flex flex-col gap-2">
                {orderLines.map((line) => (
                  <div
                    key={line.id}
                    className="flex items-center gap-3 p-2 rounded-lg border border-border-light"
                  >
                    {line.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={line.image} alt={line.title} className="w-10 h-12 rounded object-cover" />
                    ) : (
                      <div className="w-10 h-12 bg-surface-subtle rounded flex items-center justify-center">
                        <Package className="w-4 h-4 text-text-muted" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-on-surface line-clamp-1">{line.title}</p>
                      <p className="text-[11px] text-text-muted">
                        {[line.size, line.color].filter(Boolean).join(" • ")} ·{" "}
                        {formatTaka(Number(line.unit_price))} each · ordered {line.quantity}
                      </p>
                    </div>
                    <input
                      type="number"
                      min={0}
                      max={line.quantity}
                      value={draft.scope === "all" ? String(line.quantity) : (draft.lines[line.id] ?? "0")}
                      disabled={draft.scope === "all"}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          lines: { ...draft.lines, [line.id]: e.target.value },
                        })
                      }
                      aria-label={`Quantity to return for ${line.title}`}
                      className="w-16 h-9 px-2 text-center text-xs rounded-lg border border-border-light focus:outline-none focus:ring-1 focus:ring-primary disabled:bg-surface-subtle"
                    />
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-on-surface" htmlFor="ret-reason">
                    Reason
                  </label>
                  <input
                    id="ret-reason"
                    value={draft.reason}
                    onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
                    placeholder="changed mind"
                    className="h-9 px-3 text-xs rounded-lg border border-border-light focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-on-surface" htmlFor="ret-notes">
                    Notes
                  </label>
                  <input
                    id="ret-notes"
                    value={draft.notes}
                    onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                    placeholder="Internal note"
                    className="h-9 px-3 text-xs rounded-lg border border-border-light focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => void submitReturn()}
                  disabled={submitting}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-primary-container disabled:opacity-50"
                >
                  {submitting ? "Creating..." : "Create return"}
                </button>
                <button
                  onClick={() => { setDraft(null); setOrderLines([]); }}
                  className="px-4 py-2 rounded-lg border border-border-light text-xs font-bold uppercase tracking-wider"
                >
                  Back
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* List */}
      <div className="bg-surface-card border border-border-light rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-surface-subtle">
              <tr>
                <th className="text-left text-xs font-semibold text-text-muted uppercase tracking-wider px-4 py-3">Return ID</th>
                <th className="text-left text-xs font-semibold text-text-muted uppercase tracking-wider px-4 py-3">Order</th>
                <th className="text-left text-xs font-semibold text-text-muted uppercase tracking-wider px-4 py-3">Reason</th>
                <th className="text-right text-xs font-semibold text-text-muted uppercase tracking-wider px-4 py-3">Refund</th>
                <th className="text-center text-xs font-semibold text-text-muted uppercase tracking-wider px-4 py-3">Status</th>
                <th className="text-center text-xs font-semibold text-text-muted uppercase tracking-wider px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-text-muted">Loading...</td></tr>
              ) : filteredReturns.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-text-muted">No returns found.</td></tr>
              ) : (
                filteredReturns.map((r) => (
                  <React.Fragment key={r.id}>
                    <tr className="border-b border-border-light last:border-b-0 hover:bg-surface-subtle/30">
                      <td className="px-4 py-3 text-sm font-mono text-on-surface">
                        <button
                          onClick={() => setOpenFor(openFor === r.id ? null : r.id)}
                          className="hover:text-primary"
                        >
                          {r.id.slice(0, 8)}…
                        </button>
                      </td>
                      <td className="px-4 py-3 text-sm font-mono text-on-surface">
                        <button
                          onClick={() => router.push(`/admin/orders?order_id=${encodeURIComponent(r.order_id)}`)}
                          className="hover:text-primary"
                        >
                          {r.order_id.slice(0, 8)}…
                        </button>
                      </td>
                      <td className="px-4 py-3 text-sm text-on-surface max-w-xs truncate">{r.reason || "—"}</td>
                      <td className="px-4 py-3 text-sm text-on-surface text-right">
                        {r.refund_amount && Number(r.refund_amount) > 0
                          ? `৳ ${Number(r.refund_amount).toFixed(2)}`
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                            statusColors[r.status as ReturnStatus] ?? "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-center">
                          {r.status === "requested" && (
                            <>
                              <button
                                onClick={() => void changeStatus(r.id, "approved")}
                                className="px-2 py-1 text-xs font-medium text-blue-700 bg-blue-50 rounded hover:bg-blue-100"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => void changeStatus(r.id, "rejected")}
                                className="px-2 py-1 text-xs font-medium text-red-700 bg-red-50 rounded hover:bg-red-100"
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {r.status === "approved" && (
                            <button
                              onClick={() => void changeStatus(r.id, "received")}
                              className="px-2 py-1 text-xs font-medium text-indigo-700 bg-indigo-50 rounded hover:bg-indigo-100"
                            >
                              Received
                            </button>
                          )}
                          {["received", "approved", "completed"].includes(r.status) && (
                            <button
                              onClick={() => setRefundingFor(refundingFor === r.id ? null : r.id)}
                              className="px-2 py-1 text-xs font-medium text-primary bg-primary/10 rounded hover:bg-primary/20"
                            >
                              {refundingFor === r.id ? "Close" : "Refund"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Detail: items, then the transactions this return produced. */}
                    {openFor === r.id && (
                      <tr>
                        <td colSpan={6} className="px-4 py-4 bg-surface-subtle border-t border-border-light">
                          <div className="flex flex-col gap-4">
                            <div>
                              <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                                Items
                              </h4>
                              <div className="flex flex-col gap-1.5">
                                {(r.return_items ?? []).length === 0 ? (
                                  <p className="text-xs text-text-muted">No items recorded.</p>
                                ) : (
                                  (r.return_items as { id: string; quantity: number; order_item_id: string }[]).map(
                                    (item) => (
                                      <div
                                        key={item.id}
                                        className="flex items-center gap-3 bg-surface-card rounded-lg p-2 text-xs"
                                      >
                                        <span className="text-on-surface">
                                          {orderLines.length
                                            ? orderLines.find((l) => l.id === item.order_item_id)?.title ??
                                              item.order_item_id.slice(0, 8) + "…"
                                            : item.order_item_id.slice(0, 8) + "…"}
                                        </span>
                                        <span className="ml-auto text-text-muted">
                                          Qty {item.quantity}
                                        </span>
                                      </div>
                                    )
                                  )
                                )}
                              </div>
                            </div>

                            <div className="pt-3 border-t border-border-light">
                              <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                                Transactions
                              </h4>
                              <PaymentTransactionsTable orderId={r.order_id} returnId={r.id} />
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}

                    {/* The refund builder, on the return it belongs to. */}
                    {refundingFor === r.id && (
                      <tr>
                        <td colSpan={6} className="px-4 py-4 bg-surface-subtle border-t border-border-light">
                          <RefundBuilder
                            orderId={r.order_id}
                            returnId={r.id}
                            onDone={() => void fetchReturns()}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t border-border-light flex items-center justify-between text-sm text-text-muted">
          <span>{total} returns total</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="p-1.5 rounded-lg hover:bg-surface-subtle disabled:opacity-40"
            >
              Previous
            </button>
            <span>Page {page + 1} of {Math.max(1, Math.ceil(total / limit))}</span>
            <button
              onClick={() => setPage(page + 1)}
              disabled={(page + 1) * limit >= total}
              className="p-1.5 rounded-lg hover:bg-surface-subtle disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  async function changeStatus(id: string, status: string) {
    try {
      const res = await fetch("/api/admin/returns", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Could not update the return");
      if (json.note) toast(json.note, "info");
      await fetchReturns();
    } catch (error) {
      toast("Error updating return: " + String(error), "error");
    }
  }
}
