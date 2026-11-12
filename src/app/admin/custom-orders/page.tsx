"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, CalendarClock, Search, Settings2, UserRound } from "lucide-react";
import { OrderDrawer } from "@/components/admin/custom-orders/OrderDrawer";
import { BOARD_COLUMNS, STATUS_LABEL, taka } from "@/components/admin/custom-orders/labels";
import { isOverdue, type CustomOrderStatus } from "@/lib/custom-jersey/types";

interface Row {
  id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  source: string;
  sport: string;
  quantity: number;
  fabric_name: string | null;
  needed_by: string | null;
  is_rush: boolean;
  estimated_price: number;
  final_price: number | null;
  advance_amount: number | null;
  delivery_charge: number;
  status: CustomOrderStatus;
  revision_count: number;
  assigned_to: string | null;
  due_date: string | null;
  created_at: string;
  paid_total: number;
}

const field = "px-2.5 py-1.5 text-sm bg-surface-subtle rounded border border-border-light";

export default function CustomOrdersAdminPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [staff, setStaff] = useState<{ id: string; name: string }[]>([]);
  const [scope, setScope] = useState<"open" | "closed" | "all">("open");
  const [view, setView] = useState<"board" | "list">("board");
  const [q, setQ] = useState("");
  const [mine, setMine] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/custom-orders?scope=${scope}&q=${encodeURIComponent(q)}`);
    const json = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) return setError(json.error ?? "Could not load custom orders");
    setError(null);
    setRows(json.orders);
    setStaff(json.staff);
  }, [scope, q]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), q ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, q]);

  const staffName = useMemo(() => new Map(staff.map((s) => [s.id, s.name])), [staff]);
  const visible = mine ? rows.filter((r) => r.assigned_to === mine) : rows;
  const late = visible.filter((r) => isOverdue(r)).length;
  const boardMode = view === "board" && scope === "open";

  async function advance(row: Row, to: CustomOrderStatus) {
    const res = await fetch(`/api/admin/custom-orders/${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "move", to }) });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Could not move the order");
    await load();
  }

  const Card = ({ r, next }: { r: Row; next?: CustomOrderStatus }) => {
    const overdue = isOverdue(r);
    return (
      <li className={`bg-surface-card rounded-lg border p-2.5 text-xs flex flex-col gap-1 ${overdue ? "border-badge-discount" : "border-border-light"}`}>
        <button className="text-left" onClick={() => setOpenId(r.id)}>
          <span className="flex items-center gap-1.5">
            <strong className="text-sm text-primary">{r.order_number}</strong>
            {r.is_rush && <span className="text-[10px] font-bold uppercase bg-amber-100 text-amber-800 rounded px-1">Urgent</span>}
            {overdue && <span className="text-[10px] font-bold uppercase bg-badge-discount text-white rounded px-1">Late</span>}
          </span>
          <span className="block truncate">{r.customer_name}</span>
          <span className="block text-text-muted capitalize">{r.quantity} pcs · {r.sport} · {r.fabric_name ?? "—"}</span>
          {BOARD_COLUMNS.some((c) => c.statuses.length > 1 && c.statuses.includes(r.status)) && <span className="block text-text-muted italic">{STATUS_LABEL[r.status]}</span>}
        </button>
        <span className={`flex items-center gap-1 tabular-nums ${overdue ? "text-badge-discount font-bold" : "text-text-muted"}`}>
          <CalendarClock className="w-3.5 h-3.5" /> {r.due_date ?? r.needed_by ?? "no date"}
        </span>
        <span className="flex items-center gap-1 text-text-muted">
          <UserRound className="w-3.5 h-3.5" /> {r.assigned_to ? staffName.get(r.assigned_to) ?? "Staff" : "Nobody yet"}
        </span>
        {r.final_price !== null && (
          <span className="tabular-nums text-text-muted">
            Paid {taka(r.paid_total)} of {taka(r.final_price + r.delivery_charge)}
          </span>
        )}
        {next && (
          <button onClick={() => advance(r, next)} className="mt-1 inline-flex items-center justify-center gap-1 text-[11px] font-bold uppercase rounded border border-border-light py-1 hover:bg-surface-subtle">
            {STATUS_LABEL[next]} <ArrowRight className="w-3 h-3" />
          </button>
        )}
      </li>
    );
  };

  return (
    <div className="p-space-base space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="font-display text-xl uppercase font-bold text-primary mb-1">Custom jersey orders</h1>
          <p className="text-sm text-text-muted">
            {visible.length} order{visible.length === 1 ? "" : "s"}
            {late > 0 && <span className="text-badge-discount font-bold"> · {late} late</span>}
          </p>
        </div>
        <label className="relative">
          <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
          <input className={`${field} pl-8 w-56`} placeholder="Order no., name or phone" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        </label>
        <select className={field} value={mine} onChange={(e) => setMine(e.target.value)} aria-label="Responsible">
          <option value="">Everyone</option>
          {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className={field} value={scope} onChange={(e) => setScope(e.target.value as typeof scope)} aria-label="Which orders">
          <option value="open">In progress</option>
          <option value="closed">Finished and closed</option>
          <option value="all">All</option>
        </select>
        <div className="inline-flex rounded border border-border-light overflow-hidden">
          {(["board", "list"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`px-3 py-1.5 text-xs font-bold uppercase ${view === v ? "bg-primary text-white" : "bg-surface-card"}`}>{v}</button>
          ))}
        </div>
        <Link href="/admin/custom-jersey" className="inline-flex items-center gap-1.5 text-xs font-bold uppercase px-3 py-2 rounded border border-border-light bg-surface-card">
          <Settings2 className="w-3.5 h-3.5" /> Prices and setup
        </Link>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-badge-discount bg-badge-discount/10 rounded-lg px-3 py-2" role="alert">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {boardMode ? (
        <div className="flex gap-3 overflow-x-auto pb-3">
          {BOARD_COLUMNS.map((col) => {
            const items = visible.filter((r) => col.statuses.includes(r.status));
            return (
              <section key={col.title} className="w-56 shrink-0 bg-surface-subtle rounded-xl p-2">
                <h2 className="flex items-center justify-between px-1 pb-2 text-[11px] font-display font-bold uppercase tracking-wider text-primary">
                  {col.title} <span className="text-text-muted tabular-nums">{items.length}</span>
                </h2>
                <ul className="flex flex-col gap-2 min-h-12">
                  {items.map((r) => <Card key={r.id} r={r} next={col.next} />)}
                </ul>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="bg-surface-card rounded-xl border border-border-light overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-text-muted border-b border-border-light">
                <th className="px-3 py-2">Order</th><th>Customer</th><th>Request</th><th>Status</th><th>Date</th><th className="text-right pr-3">Price</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id} className="border-b border-border-light last:border-0 hover:bg-surface-subtle cursor-pointer" onClick={() => setOpenId(r.id)}>
                  <td className="px-3 py-2 font-semibold text-primary">{r.order_number}</td>
                  <td>{r.customer_name}<span className="block text-xs text-text-muted tabular-nums">{r.customer_phone}</span></td>
                  <td className="capitalize">{r.quantity} pcs · {r.sport}<span className="block text-xs text-text-muted">{r.fabric_name}</span></td>
                  <td>{STATUS_LABEL[r.status]}{isOverdue(r) && <span className="ml-1 text-[10px] font-bold uppercase bg-badge-discount text-white rounded px-1">Late</span>}</td>
                  <td className="tabular-nums text-xs">{r.due_date ?? r.needed_by ?? "—"}</td>
                  <td className="text-right pr-3 tabular-nums">{taka(r.final_price ?? r.estimated_price)}{r.final_price === null && <span className="block text-[10px] text-text-muted">estimate</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!loading && visible.length === 0 && !error && <p className="text-sm text-text-muted text-center py-8">No custom orders here.</p>}

      {openId && <OrderDrawer key={openId} orderId={openId} staff={staff} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  );
}
