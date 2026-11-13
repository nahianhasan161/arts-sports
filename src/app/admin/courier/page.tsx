"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Check } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface Parcel {
  id: string;
  customer_name: string;
  customer_phone: string;
  total_amount: number;
  status: string;
  courier: string;
  courier_consignment_id: string;
  courier_tracking_code: string | null;
  courier_status: string | null;
  courier_fee: number | null;
  courier_booked_at: string;
  delivered_at: string | null;
  cod_expected: number | null;
  cod_collected: number | null;
  cod_settled_at: string | null;
  cod_settled_amount: number | null;
}

interface CourierInfo {
  code: string;
  label: string;
  configured: boolean;
}

const taka = (n: number | null | undefined) => `৳${Number(n ?? 0).toLocaleString()}`;

/** Parcels booked with couriers, and whether their COD money has come back. */
export default function CourierPage() {
  const [view, setView] = useState<"unsettled" | "all">("unsettled");
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [couriers, setCouriers] = useState<CourierInfo[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (which: string) => {
    try {
      const res = await fetch(`/api/admin/courier?view=${which}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load parcels");
      setParcels(json.parcels);
      setCouriers(json.couriers);
      setSelected(new Set());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load parcels");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load("unsettled");
  }, [load]);

  const totals = useMemo(() => {
    const delivered = parcels.filter((p) => p.courier_status === "delivered" || p.courier_status === "partial");
    return {
      inTransit: parcels.filter((p) => !p.delivered_at && !["returned", "cancelled"].includes(p.courier_status ?? "")).length,
      awaiting: delivered.filter((p) => !p.cod_settled_at).reduce((s, p) => s + Number(p.cod_collected ?? p.cod_expected ?? 0), 0),
      returned: parcels.filter((p) => ["returned", "cancelled"].includes(p.courier_status ?? "")).length,
    };
  }, [parcels]);

  const settle = async () => {
    if (selected.size === 0) return;
    const res = await fetch("/api/admin/courier", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_ids: Array.from(selected) }),
    });
    const json = await res.json();
    if (!res.ok) setError(json.error ?? "Could not mark as received");
    else void load(view);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-primary">Courier & COD</h1>
        <p className="text-xs text-text-muted mt-1">
          Book parcels from an order&apos;s row on the Orders page. Here you see where they are and tick off the cash the courier has paid you.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        {couriers.map((c) => (
          <span key={c.code} className={`px-2 py-1 rounded-full font-semibold ${c.configured ? "bg-emerald-100 text-emerald-800" : "bg-surface-subtle text-text-muted"}`}>
            {c.label}: {c.configured ? "connected" : "API keys not set"}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          ["On the way", String(totals.inTransit)],
          ["COD to receive", taka(totals.awaiting)],
          ["Returned", String(totals.returned)],
        ].map(([label, value]) => (
          <div key={label} className="bg-surface-card border border-border-light rounded-xl p-3">
            <p className="text-[10px] uppercase tracking-wider text-text-muted font-semibold">{label}</p>
            <p className="font-display text-lg font-bold text-primary">{value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["unsettled", "all"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => {
              setView(v);
              setLoading(true);
              void load(v);
            }}
            className={`h-8 px-3 rounded-full text-[11px] font-bold uppercase border ${view === v ? "bg-primary text-primary-foreground border-primary" : "border-border-light"}`}
          >
            {v === "unsettled" ? "Not settled" : "All"}
          </button>
        ))}
        <button
          type="button"
          disabled={selected.size === 0}
          onClick={() => void settle()}
          className="ml-auto h-8 px-3 rounded-lg bg-primary text-primary-foreground text-[11px] font-bold uppercase disabled:opacity-40"
        >
          Mark {selected.size || ""} as cash received
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-badge-discount/40 bg-badge-discount/5 px-3 py-2.5 text-xs text-badge-discount">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      <div className="bg-surface-card border border-border-light rounded-xl overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-surface-subtle text-text-muted uppercase text-[10px] tracking-wider">
            <tr>
              <th className="p-3" />
              <th className="text-left p-3">Order</th>
              <th className="text-left p-3">Courier</th>
              <th className="text-left p-3">Status</th>
              <th className="text-right p-3">COD expected</th>
              <th className="text-right p-3">Collected</th>
              <th className="text-right p-3">Fee</th>
              <th className="text-left p-3">Settled</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-light">
            {loading && (
              <tr>
                <td colSpan={8} className="p-3">
                  <Skeleton className="h-4 w-full" />
                </td>
              </tr>
            )}
            {!loading && parcels.length === 0 && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-text-muted">No parcels here.</td>
              </tr>
            )}
            {!loading &&
              parcels.map((p) => {
                const canSettle = !p.cod_settled_at && (p.courier_status === "delivered" || p.courier_status === "partial");
                const mismatch = p.cod_collected != null && p.cod_expected != null && Number(p.cod_collected) !== Number(p.cod_expected);
                return (
                  <tr key={p.id}>
                    <td className="p-3">
                      {canSettle && (
                        <input
                          type="checkbox"
                          checked={selected.has(p.id)}
                          onChange={(e) => {
                            const next = new Set(selected);
                            if (e.target.checked) next.add(p.id);
                            else next.delete(p.id);
                            setSelected(next);
                          }}
                          aria-label={`Select ${p.id}`}
                        />
                      )}
                    </td>
                    <td className="p-3">
                      <p className="font-semibold">{p.id}</p>
                      <p className="text-text-muted">{p.customer_name} · {p.customer_phone}</p>
                    </td>
                    <td className="p-3 capitalize">
                      {p.courier}
                      <p className="text-text-muted normal-case">{p.courier_tracking_code ?? p.courier_consignment_id}</p>
                    </td>
                    <td className="p-3">{p.courier_status ?? "—"}</td>
                    <td className="p-3 text-right">{taka(p.cod_expected)}</td>
                    <td className={`p-3 text-right ${mismatch ? "text-red-700 font-bold" : ""}`}>{p.cod_collected != null ? taka(p.cod_collected) : "—"}</td>
                    <td className="p-3 text-right">{p.courier_fee != null ? taka(p.courier_fee) : "—"}</td>
                    <td className="p-3">
                      {p.cod_settled_at ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700">
                          <Check className="w-3.5 h-3.5" /> {taka(p.cod_settled_amount)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
