"use client";

import React, { useState, useCallback } from "react";
import { Search, Plus, Trash2, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { formatTaka } from "@/lib/pricing";

/**
 * Manual order entry.
 *
 * There was no way to record a phone or messenger order: the only write path
 * was /api/checkout, which resolves variants out of a browser cart and reserves
 * stock the way a shopper's session would. An operator taking an order over the
 * phone had to either fake a checkout or keep it in a notebook.
 *
 * The form resolves each line against the products table as it is entered, so
 * the price shown is the catalogue price and an override has to say why. The
 * delivery rule is the same one the storefront derives, so a manual order and a
 * checkout order quote the same carriage.
 *
 * Stock is deliberately not reserved: an order agreed by phone has either
 * already moved stock or is handled outside this system, and reserving against
 * it would double-count.
 */

interface DraftLine {
  product_id: string;
  title: string;
  size: string;
  color: string;
  quantity: string;
  /** Empty means "use the catalogue price". */
  unit_price: string;
  price_reason: string;
  /** The catalogue price, shown beside an override so the difference is visible. */
  catalogue_price: number;
}

interface ProductOption {
  id: string;
  title: string;
  price: number;
}

const EMPTY_LINE: DraftLine = {
  product_id: "",
  title: "",
  size: "",
  color: "",
  quantity: "1",
  unit_price: "",
  price_reason: "",
  catalogue_price: 0,
};

export function ManualOrderForm({ onCreated }: { onCreated?: () => void }) {
  const { toast } = useToast();

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [city, setCity] = useState<"dhaka" | "outside">("dhaka");
  const [paymentMethod, setPaymentMethod] = useState<"cod" | "bkash" | "nagad">("cod");
  const [amountPaid, setAmountPaid] = useState("0");
  const [transactionRef, setTransactionRef] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([{ ...EMPTY_LINE }]);

  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState<ProductOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  /** Look up a product by id or title, so a line can be filled by either. */
  const searchProducts = useCallback(async (term: string) => {
    const q = term.trim();
    if (!q) {
      setProductResults([]);
      return;
    }
    setSearching(true);
    try {
      // The storefront list endpoint is public and reads only published
      // products, which is exactly the set an order may be built from.
      const res = await fetch(`/api/admin/products/search?q=${encodeURIComponent(q)}&limit=8`, {
        cache: "no-store",
      });
      const json = await res.json();
      setProductResults(
        (json?.products ?? []).map((p: { id: string; title: string; price: number }) => ({
          id: p.id,
          title: p.title,
          price: Number(p.price),
        }))
      );
    } catch {
      // A failed lookup is not worth a toast on every keystroke.
      setProductResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const pickProduct = (product: ProductOption) => {
    setLines((prev) => {
      const next = [...prev];
      // Fill the first still-empty line rather than always appending, so a
      // single-product order does not leave a blank row behind.
      const index = next.findIndex((l) => l.product_id === "");
      if (index === -1) next.push({ ...EMPTY_LINE });
      const at = index === -1 ? next.length - 1 : index;
      next[at] = { ...next[at], product_id: product.id, title: product.title, catalogue_price: product.price };
      return next;
    });
    setProductQuery("");
    setProductResults([]);
  };

  const updateLine = (index: number, patch: Partial<DraftLine>) => {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  };

  const subtotal = lines.reduce((sum, l) => {
    const qty = Number(l.quantity);
    const price = l.unit_price !== "" ? Number(l.unit_price) : l.catalogue_price;
    return sum + (Number.isFinite(qty) && Number.isFinite(price) ? qty * price : 0);
  }, 0);

  const shippingFee =
    subtotal >= 1500 || subtotal === 0 ? 0 : city === "dhaka" ? 60 : 120;
  const total = subtotal + shippingFee;
  const paid = Number(amountPaid);

  const canSubmit =
    customerName.trim() !== "" &&
    customerPhone.trim() !== "" &&
    deliveryAddress.trim() !== "" &&
    lines.some((l) => l.product_id !== "") &&
    lines.every((l) => l.product_id === "" || Number(l.quantity) > 0) &&
    (!Number.isFinite(paid) || paid <= total);

  const submit = useCallback(async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: customerName.trim(),
          customer_phone: customerPhone.trim(),
          customer_email: customerEmail.trim() || undefined,
          delivery_address: deliveryAddress.trim(),
          city,
          payment_method: paymentMethod,
          amount_paid: Number.isFinite(paid) ? paid : 0,
          transaction_ref: transactionRef.trim() || undefined,
          notes: notes.trim() || undefined,
          items: lines
            .filter((l) => l.product_id !== "")
            .map((l) => ({
              product_id: l.product_id,
              title: l.title,
              size: l.size.trim(),
              color: l.color.trim(),
              quantity: Number(l.quantity),
              ...(l.unit_price !== "" ? { unit_price: Number(l.unit_price) } : {}),
              ...(l.unit_price !== "" ? { price_reason: l.price_reason.trim() } : {}),
            })),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        // The route reports exactly which line and why, including the
        // price-override rule, which is the one an operator is most likely to hit.
        toast(json?.detail ?? json?.error ?? "Could not create the order", "error");
        return;
      }

      toast(
        `Order ${json.data?.order_id} created · ${formatTaka(json.data?.total_amount ?? total)}`,
        "success"
      );
      onCreated?.();
    } catch (error) {
      toast("Error creating order: " + String(error), "error");
    } finally {
      setSubmitting(false);
    }
  }, [
    customerName, customerPhone, customerEmail, deliveryAddress, city,
    paymentMethod, paid, transactionRef, notes, lines, total, toast, onCreated,
  ]);

  return (
    <div className="bg-surface-card border border-border-light rounded-xl p-4 flex flex-col gap-4">
      <h3 className="text-sm font-display uppercase tracking-wider font-bold text-primary">
        New order (manual entry)
      </h3>

      {/* Customer */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-on-surface" htmlFor="mo-name">
            Customer name *
          </label>
          <input
            id="mo-name"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            className="h-9 px-3 text-sm rounded-lg border border-border-light focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-on-surface" htmlFor="mo-phone">
            Mobile *
          </label>
          <input
            id="mo-phone"
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            placeholder="01712345678"
            className="h-9 px-3 text-sm rounded-lg border border-border-light focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-on-surface" htmlFor="mo-email">
            Email
          </label>
          <input
            id="mo-email"
            type="email"
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
            className="h-9 px-3 text-sm rounded-lg border border-border-light focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-on-surface" htmlFor="mo-city">
            Delivery zone *
          </label>
          <select
            id="mo-city"
            value={city}
            onChange={(e) => setCity(e.target.value as "dhaka" | "outside")}
            className="h-9 px-3 text-sm rounded-lg border border-border-light bg-surface-card focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="dhaka">Dhaka Metro (৳ 60)</option>
            <option value="outside">Outside Dhaka (৳ 120)</option>
          </select>
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <label className="text-xs font-semibold text-on-surface" htmlFor="mo-address">
            Delivery address *
          </label>
          <textarea
            id="mo-address"
            value={deliveryAddress}
            onChange={(e) => setDeliveryAddress(e.target.value)}
            rows={2}
            className="px-3 py-2 text-sm rounded-lg border border-border-light focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          />
        </div>
      </div>

      {/* Products */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold text-on-surface">Products</span>
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-text-muted" />
          <input
            value={productQuery}
            onChange={(e) => {
              setProductQuery(e.target.value);
              void searchProducts(e.target.value);
            }}
            placeholder="Search the catalogue by title..."
            className="w-full h-9 pl-10 pr-3 text-sm rounded-lg border border-border-light focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {searching && (
            <Loader2 className="absolute right-3 top-2.5 w-4 h-4 text-text-muted animate-spin" />
          )}
        </div>

        {productResults.length > 0 && (
          <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
            {productResults.map((p) => (
              <button
                key={p.id}
                onClick={() => pickProduct(p)}
                className="flex items-center justify-between gap-3 px-3 py-2 text-left text-xs rounded-lg border border-border-light hover:bg-surface-subtle"
              >
                <span className="truncate">{p.title}</span>
                <span className="text-text-muted shrink-0">{formatTaka(p.price)}</span>
              </button>
            ))}
          </div>
        )}

        {lines.map((line, index) => (
          <div key={index} className="flex flex-col gap-2 p-2 rounded-lg border border-border-light">
            <div className="flex items-center gap-2">
              <input
                value={line.title}
                readOnly
                placeholder="No product selected"
                className="flex-1 h-9 px-3 text-sm rounded-lg border border-border-light bg-surface-subtle"
              />
              {lines.length > 1 && (
                <button
                  onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                  aria-label="Remove line"
                  className="p-1.5 text-text-muted hover:text-badge-discount"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
            {line.product_id !== "" && (
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-text-muted">Size</label>
                  <input
                    value={line.size}
                    onChange={(e) => updateLine(index, { size: e.target.value })}
                    className="w-20 h-8 px-2 text-xs rounded-lg border border-border-light"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-text-muted">Color</label>
                  <input
                    value={line.color}
                    onChange={(e) => updateLine(index, { color: e.target.value })}
                    className="w-28 h-8 px-2 text-xs rounded-lg border border-border-light"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-text-muted">Qty</label>
                  <input
                    type="number"
                    min={1}
                    value={line.quantity}
                    onChange={(e) => updateLine(index, { quantity: e.target.value })}
                    className="w-16 h-8 px-2 text-xs rounded-lg border border-border-light"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-text-muted">
                    Unit price {line.catalogue_price > 0 && `(catalogue ${formatTaka(line.catalogue_price)})`}
                  </label>
                  <input
                    value={line.unit_price}
                    onChange={(e) => updateLine(index, { unit_price: e.target.value })}
                    placeholder="catalogue"
                    inputMode="decimal"
                    className="w-24 h-8 px-2 text-xs rounded-lg border border-border-light"
                  />
                </div>
                {line.unit_price !== "" && Number(line.unit_price) !== line.catalogue_price && (
                  <div className="flex flex-col gap-1 flex-1 min-w-40">
                    <label className="text-[11px] text-badge-discount font-semibold">
                      Reason for the different price *
                    </label>
                    <input
                      value={line.price_reason}
                      onChange={(e) => updateLine(index, { price_reason: e.target.value })}
                      placeholder="bulk discount agreed on the phone"
                      className="h-8 px-2 text-xs rounded-lg border border-badge-discount/40"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        <button
          onClick={() => setLines((prev) => [...prev, { ...EMPTY_LINE }])}
          className="self-start inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-primary"
        >
          <Plus className="w-3 h-3" />
          Add another product
        </button>
      </div>

      {/* Payment */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border-light">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-on-surface" htmlFor="mo-method">
            Payment method
          </label>
          <select
            id="mo-method"
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}
            className="h-9 px-3 text-sm rounded-lg border border-border-light bg-surface-card focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="cod">Cash on Delivery</option>
            <option value="bkash">bKash</option>
            <option value="nagad">Nagad</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-on-surface" htmlFor="mo-paid">
            Amount collected now
          </label>
          <input
            id="mo-paid"
            value={amountPaid}
            onChange={(e) => setAmountPaid(e.target.value)}
            inputMode="decimal"
            className={`h-9 px-3 text-sm rounded-lg border focus:outline-none focus:ring-1 focus:ring-primary ${
              Number.isFinite(paid) && paid > total ? "border-badge-discount" : "border-border-light"
            }`}
          />
          {Number.isFinite(paid) && paid > total && (
            <p className="text-[11px] text-badge-discount">
              That is more than the {formatTaka(total)} total.
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-on-surface" htmlFor="mo-trx">
            Wallet transaction ID
          </label>
          <input
            id="mo-trx"
            value={transactionRef}
            onChange={(e) => setTransactionRef(e.target.value.toUpperCase())}
            className="h-9 px-3 text-sm rounded-lg border border-border-light uppercase"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-on-surface" htmlFor="mo-notes">
            Notes
          </label>
          <input
            id="mo-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="h-9 px-3 text-sm rounded-lg border border-border-light"
          />
        </div>
      </div>

      {/* Totals. Derived the same way the storefront derives them, so a manual
          order and a checkout order cannot quote different carriage. */}
      <div className="p-3 rounded-lg bg-surface-subtle border border-border-light flex flex-col gap-1.5 text-xs">
        <div className="flex justify-between text-text-muted">
          <span>Subtotal</span>
          <span className="text-on-surface font-semibold">{formatTaka(subtotal)}</span>
        </div>
        <div className="flex justify-between text-text-muted">
          <span>Delivery</span>
          <span className={shippingFee === 0 ? "text-emerald-700 font-bold" : "text-on-surface font-semibold"}>
            {shippingFee === 0 ? "FREE" : formatTaka(shippingFee)}
          </span>
        </div>
        <div className="flex justify-between border-t border-border-light pt-1.5 text-sm font-bold text-primary">
          <span>Total</span>
          <span className="font-display">{formatTaka(total)}</span>
        </div>
        {paid > 0 && (
          <div className="flex justify-between text-text-muted">
            <span>Outstanding</span>
            <span>{formatTaka(Math.max(0, total - paid))}</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => void submit()}
          disabled={submitting || !canSubmit}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-primary-container disabled:opacity-50"
        >
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          {submitting ? "Creating..." : "Create order"}
        </button>
        <span className="text-[11px] text-text-muted">
          Stock is not reserved for a manual order.
        </span>
      </div>
    </div>
  );
}
