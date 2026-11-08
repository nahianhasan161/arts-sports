"use client";

import { useState } from "react";
import { Loader2, MessageCircle, Phone, ShieldAlert, Truck } from "lucide-react";

export interface OrderOps {
  id: string;
  customer_phone: string;
  customer_name: string;
  district?: string | null;
  thana?: string | null;
  payment_plan?: string | null;
  advance_amount?: number | null;
  risk_score?: number | null;
  risk_level?: "low" | "medium" | "high" | null;
  risk_reasons?: string[] | null;
  confirmation_status?: string | null;
  confirmed_via?: string | null;
  utm_source?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  fbclid?: string | null;
  courier?: string | null;
  courier_consignment_id?: string | null;
  courier_tracking_code?: string | null;
  courier_status?: string | null;
  cod_expected?: number | null;
}

export const RISK_STYLE: Record<string, string> = {
  low: "bg-emerald-100 text-emerald-800",
  medium: "bg-amber-100 text-amber-800",
  high: "bg-red-100 text-red-800",
};

export const CONFIRMATION_LABEL: Record<string, string> = {
  unconfirmed: "Unconfirmed",
  needs_call: "Call to confirm",
  awaiting_payment: "Awaiting payment",
  confirmed: "Confirmed",
  rejected: "Rejected",
};

const REASON_LABEL: Record<string, string> = {
  blacklisted: "Blacklisted number",
  new_customer: "New customer",
  signed_in: "Signed in with Google",
  bot_check_failed: "Failed bot check",
  duplicate_recent_order: "Same product ordered in the last 24h",
  name_looks_fake: "Name looks fake",
  high_value_cod_new_customer: "High-value COD, new customer",
};

function reasonText(r: string) {
  const [key, value] = r.split(":");
  const named: Record<string, string> = {
    returned_orders: "Returned orders",
    cancelled_orders: "Cancelled orders",
    delivered_orders: "Delivered orders",
    many_orders_same_device: "Orders from same device/IP (1h)",
    recent_order_same_device: "Recent order from same device/IP",
    courier_success: "Courier success rate",
  };
  return REASON_LABEL[r] ?? (named[key] ? `${named[key]}: ${value}` : r);
}

function waLink(phone: string, text: string) {
  const digits = phone.replace(/\D/g, "");
  const intl = digits.startsWith("880") ? digits : `88${digits}`;
  return `https://wa.me/${intl}?text=${encodeURIComponent(text)}`;
}

/** Risk, confirmation, source and courier for one order, with the actions staff need. */
export function OrderOpsPanel({ order, onChanged }: { order: OrderOps; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const act = async (key: string, url: string, method: string, body: unknown) => {
    setBusy(key);
    setMessage(null);
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) setMessage(json.error ?? "That did not work.");
      else onChanged();
    } catch {
      setMessage("Network problem.");
    } finally {
      setBusy(null);
    }
  };

  const confirm = (decision: string, via?: string) =>
    act(decision, "/api/admin/order-confirmation", "POST", { order_id: order.id, decision, via });
  const btn = "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[11px] font-bold uppercase tracking-wider border disabled:opacity-50";

  return (
    <div className="grid gap-3 md:grid-cols-3 text-xs">
      <div className="bg-surface-card rounded-lg p-3 space-y-2">
        <h4 className="font-semibold text-text-muted uppercase tracking-wider text-[10px]">Risk & confirmation</h4>
        <div className="flex flex-wrap items-center gap-2">
          {order.risk_level && (
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${RISK_STYLE[order.risk_level]}`}>
              {order.risk_level} risk · {order.risk_score}
            </span>
          )}
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-surface-subtle">
            {CONFIRMATION_LABEL[order.confirmation_status ?? "unconfirmed"] ?? order.confirmation_status}
            {order.confirmed_via ? ` · ${order.confirmed_via}` : ""}
          </span>
        </div>
        {order.risk_reasons && order.risk_reasons.length > 0 && (
          <ul className="list-disc pl-4 text-text-muted">
            {order.risk_reasons.map((r) => (
              <li key={r}>{reasonText(r)}</li>
            ))}
          </ul>
        )}
        <p className="text-text-muted">
          Plan: {order.payment_plan ?? "cod"}
          {order.advance_amount ? ` · advance ৳${order.advance_amount}` : ""}
        </p>
        <div className="flex flex-wrap gap-2">
          <a href={`tel:${order.customer_phone}`} className={`${btn} border-border-light`}>
            <Phone className="w-3.5 h-3.5" /> Call
          </a>
          <a
            href={waLink(order.customer_phone, `Assalamu alaikum ${order.customer_name}, Arts Sports theke bolchi. Apnar order #${order.id} confirm korte chai.`)}
            target="_blank"
            rel="noopener noreferrer"
            className={`${btn} border-border-light`}
          >
            <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
          </a>
          {order.confirmation_status !== "confirmed" && (
            <>
              <button type="button" disabled={!!busy} onClick={() => confirm("confirmed", "call")} className={`${btn} border-emerald-600 text-emerald-700`}>
                {busy === "confirmed" && <Loader2 className="w-3 h-3 animate-spin" />} Confirm
              </button>
              <button type="button" disabled={!!busy} onClick={() => confirm("confirmed", "whatsapp")} className={`${btn} border-emerald-600 text-emerald-700`}>
                Confirmed on WhatsApp
              </button>
            </>
          )}
          {order.confirmation_status !== "rejected" && (
            <button type="button" disabled={!!busy} onClick={() => confirm("rejected")} className={`${btn} border-red-300 text-red-700`}>
              Reject
            </button>
          )}
          <button
            type="button"
            disabled={!!busy}
            onClick={() => {
              const reason = window.prompt(`Blacklist ${order.customer_phone}? Reason:`);
              if (reason !== null) void act("blacklist", "/api/admin/blacklist", "POST", { phone: order.customer_phone, blacklisted: true, reason });
            }}
            className={`${btn} border-red-300 text-red-700`}
          >
            <ShieldAlert className="w-3.5 h-3.5" /> Blacklist
          </button>
        </div>
      </div>

      <div className="bg-surface-card rounded-lg p-3 space-y-2">
        <h4 className="font-semibold text-text-muted uppercase tracking-wider text-[10px]">Courier</h4>
        {order.courier_consignment_id ? (
          <>
            <p>
              <strong className="capitalize">{order.courier}</strong> · {order.courier_consignment_id}
              {order.courier_tracking_code && order.courier_tracking_code !== order.courier_consignment_id ? ` · ${order.courier_tracking_code}` : ""}
            </p>
            <p className="text-text-muted">
              Status: {order.courier_status ?? "—"} · COD ৳{order.cod_expected ?? 0}
            </p>
            <button type="button" disabled={!!busy} onClick={() => act("refresh", "/api/admin/courier", "PUT", { order_id: order.id })} className={`${btn} border-border-light`}>
              {busy === "refresh" && <Loader2 className="w-3 h-3 animate-spin" />} Refresh status
            </button>
          </>
        ) : (
          <>
            <p className="text-text-muted">{[order.thana, order.district].filter(Boolean).join(", ") || "No structured address"}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={!!busy} onClick={() => act("book", "/api/admin/courier", "POST", { order_id: order.id })} className={`${btn} border-primary text-primary`}>
                {busy === "book" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Truck className="w-3.5 h-3.5" />} Book (auto)
              </button>
              <button type="button" disabled={!!busy} onClick={() => act("book", "/api/admin/courier", "POST", { order_id: order.id, courier: "steadfast" })} className={`${btn} border-border-light`}>
                Steadfast
              </button>
              <button type="button" disabled={!!busy} onClick={() => act("book", "/api/admin/courier", "POST", { order_id: order.id, courier: "pathao" })} className={`${btn} border-border-light`}>
                Pathao
              </button>
            </div>
          </>
        )}
      </div>

      <div className="bg-surface-card rounded-lg p-3 space-y-1">
        <h4 className="font-semibold text-text-muted uppercase tracking-wider text-[10px]">Came from</h4>
        {order.utm_source || order.fbclid ? (
          <>
            <p>Source: {order.utm_source ?? (order.fbclid ? "facebook (click id)" : "—")}</p>
            {order.utm_campaign && <p>Campaign: {order.utm_campaign}</p>}
            {order.utm_content && <p>Ad / post: {order.utm_content}</p>}
          </>
        ) : (
          <p className="text-text-muted">Direct or unknown</p>
        )}
      </div>

      {message && <p className="md:col-span-3 text-red-700">{message}</p>}
    </div>
  );
}
