"use client";

import React, { useEffect, useState } from "react";
import { OrderOpsPanel, CONFIRMATION_LABEL, RISK_STYLE, type OrderOps } from "@/components/admin/OrderOpsPanel";
import { useSearchParams } from "next/navigation";
import { Search, Package, ChevronDown, ChevronRight, Plus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { PaymentTransactionsTable } from "@/components/admin/payments/PaymentTransactionsTable";
import { ManualOrderForm } from "@/components/admin/orders/ManualOrderForm";

interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  title: string;
  size: string;
  color: string;
  quantity: number;
  unit_price: number;
  image: string;
}

interface AdminOrder {
  id: string;
  user_id?: string;
  customer_name: string;
  customer_email?: string;
  customer_phone: string;
  delivery_address: string;
  city: string;
  subtotal: number;
  shipping_fee: number;
  total_amount: number;
  payment_method: "cod" | "bkash" | "nagad";
  status: "pending" | "processing" | "shipped" | "delivered";
  order_items?: OrderItem[];
  created_at: string;
}

type AdminOrderRow = AdminOrder & OrderOps;

interface ApiResponse<T> {
  data: T[];
  pagination: { page: number; limit: number; total: number };
  error?: string;
}

const statusOptions = [
  { value: "pending", label: "Pending" },
  { value: "processing", label: "Processing" },
  { value: "shipped", label: "Shipped" },
  { value: "delivered", label: "Delivered" },
];

const statusColors: Record<string, string> = {
  pending: "bg-orange-100 text-orange-700",
  processing: "bg-yellow-100 text-yellow-700",
  shipped: "bg-blue-100 text-blue-700",
  delivered: "bg-green-100 text-green-700",
};

export default function AdminOrders() {
  const [orders, setOrders] = useState<AdminOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  /** Whether the manual order form is open. */
  const [creating, setCreating] = useState(false);
  const searchParamsFromUrl = useSearchParams();

  const fetchOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      /*
       * `?order_id=` deep-links to one order, which is how the returns screen
       * gets here ("view the order this return belongs to"). When it is set the
       * list is that single order rather than everything.
       *
       * readSearchParams() is called on each fetch rather than memoised, because
       * Next's hook returns a fresh object and an effect depending on it would
       * refetch on every render.
       */
      const orderIdFromUrl = searchParamsFromUrl.get("order_id");
      if (orderIdFromUrl) {
        setExpandedOrders(new Set([orderIdFromUrl]));
      }

      const response = await fetch(
        orderIdFromUrl
          ? `/api/admin/orders?order_id=${encodeURIComponent(orderIdFromUrl)}&limit=1`
          : "/api/admin/orders?limit=1000"
      );
      const data: ApiResponse<AdminOrder> = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to load orders");
      }

      let filtered = orderIdFromUrl ? data.data : data.data;
      if (statusFilter !== "all") {
        filtered = data.data.filter((o) => o.status === statusFilter);
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        filtered = filtered.filter(
          (o) =>
            o.id.toLowerCase().includes(q) ||
            o.customer_name.toLowerCase().includes(q) ||
            (o.customer_email ?? "").toLowerCase().includes(q)
        );
      }

      setOrders(filtered);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load orders"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
    const timer = setTimeout(fetchOrders, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, statusFilter]);

  const updateOrderStatus = async (id: string, status: string) => {
    setUpdatingId(id);
    try {
      const response = await fetch("/api/admin/orders", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });

      const data: { error?: string; success?: boolean } = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to update status");
      }

      setOrders((prev) =>
        prev.map((o) => (o.id === id ? { ...o, status: status as AdminOrder["status"] } : o))
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update status"
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedOrders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search orders..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-9 pl-9 pr-3 text-sm border border-border-light rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/20 transition-colors"
          />
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="appearance-none h-9 pl-3 pr-9 text-sm border border-border-light rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/20 bg-surface-card cursor-pointer"
            >
              <option value="all">All Status</option>
              <option value="confirm:needs_call">Call to confirm</option>
              <option value="confirm:awaiting_payment">Awaiting payment</option>
              {statusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
          </div>
          {/* Phone and messenger orders are most of the trade, and there was no
              way to record one. */}
          <button
            onClick={() => setCreating((v) => !v)}
            className="inline-flex items-center gap-1.5 h-9 px-3 text-xs font-bold uppercase tracking-wider text-white bg-primary rounded-lg hover:bg-primary-container transition-colors"
          >
            <Plus className="w-4 h-4" />
            New order
          </button>
        </div>
      </div>

      {/* Manual order entry */}
      {creating && (
        <ManualOrderForm
          onCreated={() => {
            setCreating(false);
            void fetchOrders();
          }}
        />
      )}

      {/* Error */}
      {error && (
        <div className="bg-badge-discount/10 border border-badge-discount/30 rounded-lg p-3">
          <p className="text-badge-discount text-sm">{error}</p>
        </div>
      )}

      {/* Orders Table */}
      <div className="bg-surface-card border border-border-light rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-surface-subtle">
              <tr>
                <th className="text-left text-xs font-semibold text-text-muted uppercase tracking-wider px-4 py-3">
                  Order ID
                </th>
                <th className="text-left text-xs font-semibold text-text-muted uppercase tracking-wider px-4 py-3">
                  Customer
                </th>
                <th className="text-right text-xs font-semibold text-text-muted uppercase tracking-wider px-4 py-3">
                  Total
                </th>
                <th className="text-left text-xs font-semibold text-text-muted uppercase tracking-wider px-4 py-3">
                  Payment
                </th>
                <th className="text-center text-xs font-semibold text-text-muted uppercase tracking-wider px-4 py-3">
                  Status
                </th>
                <th className="text-left text-xs font-semibold text-text-muted uppercase tracking-wider px-4 py-3">
                  Date
                </th>
                <th className="text-center text-xs font-semibold text-text-muted uppercase tracking-wider px-4 py-3">
                  #
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-border-light last:border-b-0">
                    <td className="px-4 py-3">
                      <Skeleton className="h-4 w-28" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-4 w-32" />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Skeleton className="h-4 w-20 ml-auto" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-4 w-24" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-5 w-20 rounded-full" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-4 w-24" />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Skeleton className="h-4 w-8 mx-auto" />
                    </td>
                  </tr>
                ))
              ) : orders.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="text-center py-12 text-text-muted text-sm"
                  >
                    No orders found.
                  </td>
                </tr>
              ) : (
                orders.map((order) => (
                  // A Fragment, not a bare <tr>: an expanded order now renders
                  // its items AND its transactions, and an arrow returning two
                  // elements without one is a syntax error.
                  <React.Fragment key={order.id}>
                    <tr className="border-b border-border-light last:border-b-0">
                      <td className="px-4 py-3 text-sm font-medium text-on-surface">
                        {order.id}
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-on-surface">
                            {order.customer_name}
                          </p>
                          <p className="text-xs text-text-muted">
                            {order.customer_email}
                          </p>
                          <p className="text-xs text-text-muted">
                            {order.customer_phone}
                          </p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {order.risk_level && (
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${RISK_STYLE[order.risk_level]}`}>
                                {order.risk_level} risk
                              </span>
                            )}
                            {order.confirmation_status && order.confirmation_status !== "confirmed" && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-amber-100 text-amber-800">
                                {CONFIRMATION_LABEL[order.confirmation_status] ?? order.confirmation_status}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-on-surface text-right">
                        ৳ {Number(order.total_amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-sm text-on-surface capitalize">
                        {order.payment_method}
                      </td>
                      <td className="px-4 py-3">
                        <div className="relative">
                          <select
                            value={order.status}
                            onChange={(e) =>
                              updateOrderStatus(order.id, e.target.value)
                            }
                            disabled={updatingId === order.id}
                            className={`appearance-none text-xs font-medium px-2.5 py-0.5 rounded-full border-0 bg-transparent ${
                              statusColors[order.status] ??
                              "bg-gray-100 text-gray-700"
                            } disabled:opacity-50 cursor-pointer`}
                          >
                            {statusOptions.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-text-muted">
                        {new Date(order.created_at).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {order.order_items && order.order_items.length > 0 ? (
                          <button
                            onClick={() => toggleExpand(order.id)}
                            className="p-1 text-text-muted hover:text-primary rounded transition-colors"
                            aria-label={
                              expandedOrders.has(order.id)
                                ? "Collapse"
                                : "Expand"
                            }
                          >
                            {expandedOrders.has(order.id) ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </button>
                        ) : (
                          <span className="text-text-muted text-xs">—</span>
                        )}
                      </td>
                    </tr>

                    {/* Expanded Order Items */}
                    {expandedOrders.has(order.id) && order.order_items && (
                      <tr className="bg-surface-subtle/30">
                        <td colSpan={7} className="px-4 py-3">
                          <div className="mb-4">
                            <OrderOpsPanel order={order} onChanged={fetchOrders} />
                          </div>
                          <div className="space-y-2">
                            <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                              Order Items ({order.order_items.length})
                            </h4>
                            <div className="space-y-1.5">
                              {order.order_items.map((item) => (
                                <div
                                  key={item.id}
                                  className="flex items-center gap-3 bg-surface-card rounded-lg p-2.5"
                                >
                                  {item.image ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={item.image}
                                      alt={item.title}
                                      className="w-10 h-10 rounded object-cover"
                                    />
                                  ) : (
                                    <div className="w-10 h-10 bg-surface-subtle rounded flex items-center justify-center">
                                      <Package className="w-4 h-4 text-text-muted" />
                                    </div>
                                  )}
                                  <div className="flex-1">
                                    <p className="text-sm font-medium text-on-surface">
                                      {item.title}
                                    </p>
                                    <p className="text-xs text-text-muted">
                                      Size: {item.size} • Color: {item.color} • Qty:{" "}
                                      {item.quantity}
                                    </p>
                                  </div>
                                  <p className="text-sm font-medium text-on-surface">
                                    ৳ {Number(item.unit_price || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Transactions, on the order they belong to.
                              Previously an admin had to open the payments tab
                              and find these rows among everything else. */}
                          <div className="mt-4 pt-4 border-t border-border-light">
                            <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                              Payment Transactions
                            </h4>
                            <PaymentTransactionsTable orderId={order.id} />
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
