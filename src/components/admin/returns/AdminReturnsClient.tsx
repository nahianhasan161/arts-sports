"use client";

import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import type { Return, ReturnStatus } from "@/types";

interface ReturnsResponse {
  data: (Return & { return_items?: unknown[] })[];
  count: number;
  error?: string;
}

export function AdminReturnsClient() {
  const { toast } = useToast();
  const [returns, setReturns] = useState<Return[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  const limit = 25;

  useEffect(() => {
    void fetchReturns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter]);

  async function fetchReturns() {
    setLoading(true);
    try {
      const q = new URLSearchParams({
        offset: String(page * limit),
        limit: String(limit),
        ...(statusFilter && { status: statusFilter }),
      });

      const res = await fetch(`/api/admin/returns?${q.toString()}`);
      const json: ReturnsResponse = await res.json();
      if (json.error) throw new Error(json.error);
      setReturns(json.data || []);
      setTotal(json.count || 0);
    } catch (error) {
      toast("Error fetching returns: " + String(error), "error");
    } finally {
      setLoading(false);
    }
  }

  const handleStatusChange = async (id: string, status: string, refundAmount?: number) => {
    try {
      const body: Record<string, unknown> = { id, status };
      if (refundAmount !== undefined) body.refund_amount = refundAmount;

      const res = await fetch("/api/admin/returns", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);

      setReturns(returns.map((r) => (r.id === id ? json.data : r)));
      toast("Return updated: status set to " + status, "success");
    } catch (error) {
      toast("Error updating return: " + String(error), "error");
    }
  };

  const completeReturn = async (r: Return) => {
    const amount = prompt(
      `Enter refund amount for this return (order total: ৳ ${r.refund_amount || 0}):`,
      r.refund_amount?.toString() || ""
    );
    if (amount === null) return;
    const refundAmount = Number(amount);
    if (!Number.isFinite(refundAmount) || refundAmount < 0) {
      toast("Invalid refund amount", "error");
      return;
    }
    await handleStatusChange(r.id, "completed", refundAmount);
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
    <div className="bg-surface-card border border-border-light rounded-xl overflow-hidden">
      {/* Filters */}
      <div className="p-4 border-b border-border-light bg-surface-subtle flex flex-wrap gap-3 items-center">
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
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-surface-subtle">
            <tr>
              <th className="text-left text-xs font-semibold text-text-muted uppercase tracking-wider px-4 py-3">Return ID</th>
              <th className="text-left text-xs font-semibold text-text-muted uppercase tracking-wider px-4 py-3">Order</th>
              <th className="text-left text-xs font-semibold text-text-muted uppercase tracking-wider px-4 py-3">Reason</th>
              <th className="text-center text-xs font-semibold text-text-muted uppercase tracking-wider px-4 py-3">Items</th>
              <th className="text-right text-xs font-semibold text-text-muted uppercase tracking-wider px-4 py-3">Refund</th>
              <th className="text-center text-xs font-semibold text-text-muted uppercase tracking-wider px-4 py-3">Status</th>
              <th className="text-center text-xs font-semibold text-text-muted uppercase tracking-wider px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-text-muted">Loading...</td></tr>
            ) : filteredReturns.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-text-muted">No returns found.</td></tr>
            ) : (
              filteredReturns.map((r) => (
                <tr key={r.id} className="border-b border-border-light last:border-b-0 hover:bg-surface-subtle/30">
                  <td className="px-4 py-3 text-sm font-mono text-on-surface">{r.id.slice(0, 8)}…</td>
                  <td className="px-4 py-3 text-sm font-mono text-on-surface">{r.order_id.slice(0, 8)}…</td>
                  <td className="px-4 py-3 text-sm text-on-surface max-w-xs truncate">{r.reason || "—"}</td>
                  <td className="px-4 py-3 text-center text-sm text-on-surface">—</td>
                  <td className="px-4 py-3 text-sm text-on-surface text-right">
                    {r.refund_amount && Number(r.refund_amount) > 0 ? `৳ ${Number(r.refund_amount).toFixed(2)}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[r.status as ReturnStatus] ?? "bg-gray-100 text-gray-700"}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center gap-1 justify-center">
                      {r.status === "requested" && (
                        <>
                          <button
                            onClick={() => handleStatusChange(r.id, "approved")}
                            className="px-2 py-1 text-xs font-medium text-blue-700 bg-blue-50 rounded hover:bg-blue-100 transition-colors"
                            title="Approve return"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleStatusChange(r.id, "rejected")}
                            className="px-2 py-1 text-xs font-medium text-red-700 bg-red-50 rounded hover:bg-red-100 transition-colors"
                            title="Reject return"
                          >
                            Reject
                          </button>
                        </>
                      )}
                      {r.status === "approved" && (
                        <button
                          onClick={() => handleStatusChange(r.id, "received")}
                          className="px-2 py-1 text-xs font-medium text-indigo-700 bg-indigo-50 rounded hover:bg-indigo-100 transition-colors"
                          title="Mark as received"
                        >
                          Received
                        </button>
                      )}
                      {r.status === "received" && (
                        <button
                          onClick={() => completeReturn(r)}
                          className="px-2 py-1 text-xs font-medium text-green-700 bg-green-50 rounded hover:bg-green-100 transition-colors"
                          title="Complete & refund"
                        >
                          Complete & Refund
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

      {/* Pagination */}
      <div className="p-4 border-t border-border-light flex items-center justify-between text-sm text-text-muted">
        <span>{total} returns total</span>
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
