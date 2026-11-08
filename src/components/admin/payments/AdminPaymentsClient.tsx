"use client";

import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Search, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import type { Payment, PaymentStatus, PaymentType } from "@/types";

interface PaginationResponse {
  data: Payment[];
  count: number;
  error?: string;
}

export function AdminPaymentsClient() {
  const { toast } = useToast();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [providerFilter, setProviderFilter] = useState<string>("");

  const limit = 25;

  useEffect(() => {
    void fetchPayments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter, typeFilter, providerFilter]);

  async function fetchPayments() {
    setLoading(true);
    try {
      const q = new URLSearchParams({
        offset: String(page * limit),
        limit: String(limit),
        ...(statusFilter && { status: statusFilter }),
        ...(typeFilter && { type: typeFilter }),
        ...(providerFilter && { provider: providerFilter }),
      });

      const res = await fetch(`/api/admin/payments?${q.toString()}`);
      const json: PaginationResponse = await res.json();
      if (json.error) throw new Error(json.error);
      setPayments(json.data || []);
      setTotal(json.count || 0);
    } catch (error) {
      toast("Error fetching payments: " + String(error), "error");
    } finally {
      setLoading(false);
    }
  }

  const filteredPayments = payments.filter((p) => {
    if (search) {
      const s = search.toLowerCase();
      return p.id.toLowerCase().includes(s) || p.order_id.toLowerCase().includes(s);
    }
    return true;
  });

  const handleStatusChange = async (id: string, status: string) => {
    try {
      const res = await fetch("/api/admin/payments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setPayments(payments.map((p) => (p.id === id ? json.data : p)));
      toast("Payment updated: status set to " + status, "success");
    } catch (error) {
      toast("Error updating payment: " + String(error), "error");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this payment? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/admin/payments?id=${id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setPayments(payments.filter((p) => p.id !== id));
      setTotal(total - 1);
      toast("Payment deleted", "success");
    } catch (error) {
      toast("Error deleting payment: " + String(error), "error");
    }
  };

  const statusColors: Record<PaymentStatus, string> = {
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

  const typeColors: Record<PaymentType, string> = {
    charge: "bg-blue-100 text-blue-700",
    refund: "bg-green-100 text-green-700",
    chargeback: "bg-orange-100 text-orange-700",
  };

  return (
    <div className="bg-surface-card border border-border-light rounded-xl overflow-hidden">
      {/* Filters */}
      <div className="p-4 border-b border-border-light bg-surface-subtle flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search by order or payment ID..."
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
          <option value="initiated">Initiated</option>
          <option value="successful">Successful</option>
          <option value="failed">Failed</option>
          <option value="cancelled">Cancelled</option>
          <option value="refunded">Refunded</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(0); }}
          className="h-9 px-3 text-sm rounded-lg border border-border-light focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">All Types</option>
          <option value="charge">Charge</option>
          <option value="refund">Refund</option>
          <option value="chargeback">Chargeback</option>
        </select>
        <select
          value={providerFilter}
          onChange={(e) => { setProviderFilter(e.target.value); setPage(0); }}
          className="h-9 px-3 text-sm rounded-lg border border-border-light focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">All Providers</option>
          <option value="cod">Cash On Delivery</option>
          <option value="bkash">bKash</option>
          <option value="nagad">Nagad</option>
          <option value="stripe">Stripe</option>
          <option value="paypal">PayPal</option>
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-surface-subtle">
            <tr>
              <th className="text-left text-xs font-semibold text-text-muted uppercase tracking-wider px-4 py-3">ID</th>
              <th className="text-left text-xs font-semibold text-text-muted uppercase tracking-wider px-4 py-3">Order</th>
              <th className="text-center text-xs font-semibold text-text-muted uppercase tracking-wider px-4 py-3">Type</th>
              <th className="text-left text-xs font-semibold text-text-muted uppercase tracking-wider px-4 py-3">Provider</th>
              <th className="text-right text-xs font-semibold text-text-muted uppercase tracking-wider px-4 py-3">Amount</th>
              <th className="text-center text-xs font-semibold text-text-muted uppercase tracking-wider px-4 py-3">Status</th>
              <th className="text-center text-xs font-semibold text-text-muted uppercase tracking-wider px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-text-muted">Loading...</td></tr>
            ) : filteredPayments.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-text-muted">No payments found.</td></tr>
            ) : (
              filteredPayments.map((p) => (
                <tr key={p.id} className="border-b border-border-light last:border-b-0 hover:bg-surface-subtle/30">
                  <td className="px-4 py-3 text-sm font-mono text-on-surface">{p.id.slice(0, 8)}…</td>
                  <td className="px-4 py-3 text-sm font-mono text-on-surface">{p.order_id.slice(0, 8)}…</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${typeColors[p.type] ?? "bg-gray-100 text-gray-700"}`}>
                      {p.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-on-surface capitalize">{p.provider}</td>
                  <td className="px-4 py-3 text-sm text-on-surface text-right">৳ {Number(p.amount).toFixed(2)}</td>
                  <td className="px-4 py-3 text-center">
                    <select
                      value={p.status}
                      onChange={(e) => handleStatusChange(p.id, e.target.value)}
                      className={`text-xs font-medium px-2 py-0.5 rounded-full border-none cursor-pointer ${statusColors[p.status as PaymentStatus] ?? "bg-gray-100 text-gray-700"}`}
                    >
                      <option value="initiated">Initiated</option>
                      <option value="successful">Successful</option>
                      <option value="failed">Failed</option>
                      <option value="cancelled">Cancelled</option>
                      <option value="refunded">Refunded</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="p-1.5 text-text-muted hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                      title="Delete payment"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="p-4 border-t border-border-light flex items-center justify-between text-sm text-text-muted">
        <span>{total} payments total</span>
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
