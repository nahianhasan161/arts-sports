"use client";

import React from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import type { Cancellation } from "@/types";

interface CancellationsResponse {
  data: Cancellation[];
  count: number;
  error?: string;
}

export function AdminCancellationsClient() {
  const { toast } = useToast();
  const [cancellations, setCancellations] = React.useState<Cancellation[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("");
  const [typeFilter, setTypeFilter] = React.useState<string>("");

  const limit = 25;

  React.useEffect(() => {
    void fetchCancellations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter, typeFilter]);

  async function fetchCancellations() {
    setLoading(true);
    try {
      const q = new URLSearchParams({
        offset: String(page * limit),
        limit: String(limit),
        ...(statusFilter && { status: statusFilter }),
        ...(typeFilter && { type: typeFilter }),
      });

      const res = await fetch(`/api/admin/cancellations?${q.toString()}`);
      const json: CancellationsResponse = await res.json();
      if (json.error) throw new Error(json.error);
      setCancellations(json.data || []);
      setTotal(json.count || 0);
    } catch (error) {
      toast("Error fetching cancellations: " + String(error), "error");
    } finally {
      setLoading(false);
    }
  }

  const handleAction = async (id: string, action: string, notes?: string) => {
    try {
      const res = await fetch("/api/admin/cancellations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, notes }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setCancellations(cancellations.map((c) => (c.id === id ? json.data : c)));
      toast("Cancellation " + action + "d", "success");
    } catch (error) {
      toast("Error: " + String(error), "error");
    }
  };

  const handleExecute = async (c: Cancellation) => {
    const amount = prompt(
      "Enter refund amount (0 for no refund):",
      c.refund_amount?.toString() || "0"
    );
    if (amount === null) return;
    const refundAmount = Number(amount);
    if (!Number.isFinite(refundAmount) || refundAmount < 0) {
      toast("Invalid refund amount", "error");
      return;
    }
    await handleAction(c.id, "execute", undefined);
  };

  const filteredCancellations = cancellations.filter((c) => {
    if (search) {
      const s = search.toLowerCase();
      return c.id.toLowerCase().includes(s) || c.order_id.toLowerCase().includes(s);
    }
    return true;
  });

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-700",
    approved: "bg-blue-100 text-blue-700",
    rejected: "bg-red-100 text-red-700",
    executed: "bg-green-100 text-green-700",
    cancelled: "bg-gray-100 text-gray-700",
  };

  const reasonLabels: Record<string, string> = {
    changed_mind: "Changed mind",
    wrong_item: "Wrong item",
    damaged_item: "Damaged",
    not_as_described: "Not as described",
    delivery_delay: "Delivery delay",
    duplicate: "Duplicate",
    billing_error: "Billing error",
    other: "Other",
  };

  return (
    <div className="bg-surface-card border border-border-light rounded-xl overflow-hidden">
      <div className="p-4 border-b border-border-light bg-surface-subtle flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search by cancellation or order ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-9 pl-10 pr-3 text-sm rounded-lg border border-border-light focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(0);
          }}
          className="h-9 px-3 text-sm rounded-lg border border-border-light focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="executed">Executed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value);
            setPage(0);
          }}
          className="h-9 px-3 text-sm rounded-lg border border-border-light focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">All Types</option>
          <option value="order">Order</option>
          <option value="payment">Payment</option>
          <option value="return">Return</option>
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-surface-subtle">
            <tr>
              <th className="text-left text-xs font-semibold text-text-muted uppercase tracking-wider px-4 py-3">ID</th>
              <th className="text-left text-xs font-semibold text-text-muted uppercase tracking-wider px-4 py-3">Order</th>
              <th className="text-center text-xs font-semibold text-text-muted uppercase tracking-wider px-4 py-3">Type</th>
              <th className="text-left text-xs font-semibold text-text-muted uppercase tracking-wider px-4 py-3">Reason</th>
              <th className="text-center text-xs font-semibold text-text-muted uppercase tracking-wider px-4 py-3">Category</th>
              <th className="text-right text-xs font-semibold text-text-muted uppercase tracking-wider px-4 py-3">Refund</th>
              <th className="text-center text-xs font-semibold text-text-muted uppercase tracking-wider px-4 py-3">Status</th>
              <th className="text-center text-xs font-semibold text-text-muted uppercase tracking-wider px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-text-muted">
                  Loading...
                </td>
              </tr>
            ) : filteredCancellations.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-text-muted">
                  No cancellations found.
                </td>
              </tr>
            ) : (
              filteredCancellations.map((c) => (
                <tr key={c.id} className="border-b border-border-light last:border-b-0 hover:bg-surface-subtle/30">
                  <td className="px-4 py-3 text-sm font-mono text-on-surface">{c.id.slice(0, 8)}…</td>
                  <td className="px-4 py-3 text-sm font-mono text-on-surface">{c.order_id.slice(0, 8)}…</td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                      {c.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-on-surface max-w-xs truncate">{c.reason}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                      {reasonLabels[c.reason_category] || c.reason_category}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-on-surface text-right">
                    {c.refund_amount && Number(c.refund_amount) > 0
                      ? "৳ " + Number(c.refund_amount).toFixed(2)
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[c.status] ?? "bg-gray-100 text-gray-700"}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center gap-1 justify-center">
                      {c.status === "pending" && (
                        <>
                          <button
                            onClick={() => handleAction(c.id, "approve")}
                            className="px-2 py-1 text-xs font-medium text-blue-700 bg-blue-50 rounded hover:bg-blue-100"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleAction(c.id, "reject")}
                            className="px-2 py-1 text-xs font-medium text-red-700 bg-red-50 rounded hover:bg-red-100"
                          >
                            Reject
                          </button>
                        </>
                      )}
                      {c.status === "approved" && (
                        <button
                          onClick={() => handleExecute(c)}
                          className="px-2 py-1 text-xs font-medium text-green-700 bg-green-50 rounded hover:bg-green-100"
                        >
                          Execute
                        </button>
                      )}
                      {c.status === "executed" && (
                        <button
                          onClick={() => handleAction(c.id, "cancel")}
                          className="px-2 py-1 text-xs font-medium text-gray-700 bg-gray-50 rounded hover:bg-gray-100"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="p-4 border-t border-border-light flex items-center justify-between text-sm text-text-muted">
        <span>{total} cancellations total</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="p-1.5 rounded-lg hover:bg-surface-subtle disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span>Page {page + 1} of {Math.max(1, Math.ceil(total / limit))}</span>
          <button
            onClick={() => setPage(page + 1)}
            disabled={(page + 1) * limit >= total}
            className="p-1.5 rounded-lg hover:bg-surface-subtle disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}