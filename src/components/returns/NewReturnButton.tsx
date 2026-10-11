"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { useToast } from "@/components/ui/toast";

interface OrderItem {
  id: string;
  title: string;
  quantity: number;
  price: number;
}

interface Order {
  id: string;
  order_number: string;
  total_amount: number;
  items: OrderItem[];
}

async function fetchUserOrders(): Promise<Order[]> {
  const res = await fetch("/api/account/orders", { credentials: "include" });
  if (!res.ok) return [];
  const json = await res.json();
  return json.data || [];
}

export function NewReturnButton() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [itemQuantities, setItemQuantities] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);

  const loadOrders = async () => {
    const data = await fetchUserOrders();
    setOrders(data);
  };

  const handleOpen = () => {
    setOpen(true);
    void loadOrders();
  };

  const handleOrderSelect = (order: Order) => {
    setSelectedOrder(order);
    const initial: Record<string, number> = {};
    order.items.forEach((it) => {
      initial[it.id] = 0;
    });
    setItemQuantities(initial);
  };

  const handleSubmit = async () => {
    if (!selectedOrder) return;
    const items = Object.entries(itemQuantities).filter(
      ([, q]) => q > 0
    ).map(([orderItemId, quantity]) => ({
      order_item_id: orderItemId,
      quantity,
      condition_at_return: "unopened",
    }));

    if (items.length === 0) {
      toast("Select at least one item to return", "error");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: selectedOrder.id,
          reason: reason || null,
          notes: notes || null,
          items,
        }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      toast("Return submitted: your request has been created", "success");
      setOpen(false);
      setSelectedOrder(null);
      setReason("");
      setNotes("");
    } catch (error) {
      toast("Error submitting return: " + String(error), "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={handleOpen}
        className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white font-display text-xs uppercase tracking-wider font-bold rounded-lg hover:bg-primary-container transition-colors"
      >
        <Plus className="w-4 h-4" />
        <span>New Return</span>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-surface-card rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-border-light flex items-center justify-between">
          <h3 className="font-display text-lg font-bold text-primary">Request a Return</h3>
          <button
            onClick={() => setOpen(false)}
            className="p-1.5 rounded-lg text-text-muted hover:bg-surface-subtle"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {!selectedOrder ? (
            <div className="space-y-2">
              <label className="block font-semibold text-sm text-on-surface">Select an order</label>
              <select
                onChange={(e) => {
                  const order = orders.find((o) => o.id === e.target.value);
                  if (order) handleOrderSelect(order);
                }}
                className="w-full h-10 px-3 rounded-lg border border-border-light focus:outline-none focus:ring-1 focus:ring-primary text-sm"
                defaultValue=""
              >
                <option value="" disabled>Select an order to return from</option>
                {orders.map((order) => (
                  <option key={order.id} value={order.id}>
                    #{order.order_number} — ৳ {order.total_amount.toFixed(2)}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-on-surface font-medium">
                  Order #{selectedOrder.order_number}
                </span>
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="text-xs text-text-muted hover:text-on-surface underline"
                >
                  Change order
                </button>
              </div>

              <div className="space-y-2">
                <label className="block font-semibold text-sm text-on-surface">Items to return</label>
                {selectedOrder.items.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 p-3 border border-border-light rounded-lg">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-on-surface">{item.title}</p>
                      <p className="text-xs text-text-muted">Qty: {item.quantity} • ৳ {item.price.toFixed(2)} each</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        max={item.quantity}
                        value={itemQuantities[item.id] || 0}
                        onChange={(e) =>
                          setItemQuantities({ ...itemQuantities, [item.id]: Number(e.target.value) })
                        }
                        className="w-16 h-8 px-2 text-sm text-center rounded-lg border border-border-light focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <label className="block font-semibold text-sm text-on-surface">Reason for return</label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-border-light focus:outline-none focus:ring-1 focus:ring-primary text-sm"
                >
                  <option value="">Select a reason</option>
                  <option value="defective">Defective / Damaged</option>
                  <option value="wrong_size">Wrong size / color</option>
                  <option value="not_as_described">Not as described</option>
                  <option value="changed_mind">Changed my mind</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="block font-semibold text-sm text-on-surface">Additional notes (optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Provide any additional details..."
                  rows={3}
                  className="w-full p-3 text-sm rounded-lg border border-border-light focus:outline-none focus:ring-1 focus:ring-primary resize-y"
                />
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-border-light flex justify-end gap-2">
          <button
            onClick={() => setOpen(false)}
            className="px-4 py-2 text-sm font-medium text-text-muted hover:bg-surface-subtle rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !selectedOrder}
            className="px-4 py-2 bg-primary text-white text-sm font-bold rounded-lg hover:bg-primary-container disabled:opacity-50 transition-colors"
          >
            {submitting ? "Submitting..." : "Submit Return Request"}
          </button>
        </div>
      </div>
    </div>
  );
}
