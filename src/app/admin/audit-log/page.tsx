"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, ChevronDown, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface Entry {
  id: number;
  occurred_at: string;
  actor_email: string | null;
  actor_kind: "user" | "system" | "anon";
  action: "insert" | "update" | "delete";
  entity_type: string;
  entity_id: string | null;
  changes: Record<string, unknown>;
}

const ENTITY_TYPES = [
  "",
  "orders",
  "payments",
  "products",
  "product_variants",
  "product_stock",
  "coupons",
  "promotions",
  "refunds",
  "customers",
  "roles",
  "role_permissions",
  "staff_roles",
  "app_settings",
];

const ACTION_STYLE: Record<Entry["action"], string> = {
  insert: "bg-emerald-100 text-emerald-800",
  update: "bg-amber-100 text-amber-800",
  delete: "bg-red-100 text-red-800",
};

function fmt(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function ChangeList({ entry }: { entry: Entry }) {
  if (entry.action !== "update") {
    return (
      <pre className="text-[11px] bg-surface-subtle rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">
        {JSON.stringify(entry.changes, null, 2)}
      </pre>
    );
  }
  return (
    <table className="text-[11px] w-full">
      <tbody>
        {Object.entries(entry.changes).map(([col, diff]) => {
          const d = diff as { from: unknown; to: unknown };
          return (
            <tr key={col} className="align-top">
              <td className="pr-3 py-0.5 font-semibold whitespace-nowrap">{col}</td>
              <td className="pr-3 py-0.5 text-red-700 line-through break-all">{fmt(d.from)}</td>
              <td className="py-0.5 text-emerald-700 break-all">{fmt(d.to)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default function AuditLogPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entityType, setEntityType] = useState("");
  const [entityId, setEntityId] = useState("");
  const [actor, setActor] = useState("");
  const [open, setOpen] = useState<Set<number>>(new Set());

  interface Filters {
    entityType: string;
    entityId: string;
    actor: string;
  }

  const fetchPage = useCallback(async (filters: Filters, before?: number) => {
    try {
      const params = new URLSearchParams();
      if (filters.entityType) params.set("entity_type", filters.entityType);
      if (filters.entityId.trim()) params.set("entity_id", filters.entityId.trim());
      if (filters.actor.trim()) params.set("actor", filters.actor.trim());
      if (before) params.set("before", String(before));
      const res = await fetch(`/api/admin/audit-log?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load the audit log");
      setEntries((prev) => (before ? [...prev, ...json.entries] : json.entries));
      setNextBefore(json.next_before);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the audit log");
    } finally {
      setLoading(false);
    }
  }, []);

  const load = (filters: Filters = { entityType, entityId, actor }, before?: number) => {
    setLoading(true);
    void fetchPage(filters, before);
  };

  useEffect(() => {
    void fetchPage({ entityType: "", entityId: "", actor: "" });
  }, [fetchPage]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-primary">Audit Log</h1>
        <p className="text-xs text-text-muted mt-1">
          Every change to prices, stock, orders, payments, coupons, customers and roles, with who made it.
        </p>
      </div>

      <form
        className="flex flex-col sm:flex-row gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
      >
        <select
          value={entityType}
          onChange={(e) => {
            setEntityType(e.target.value);
            load({ entityType: e.target.value, entityId, actor });
          }}
          className="h-9 px-3 rounded-lg border border-border-light text-xs"
          aria-label="What changed"
        >
          {ENTITY_TYPES.map((t) => (
            <option key={t} value={t}>
              {t ? t.replace(/_/g, " ") : "Everything"}
            </option>
          ))}
        </select>
        <input
          value={entityId}
          onChange={(e) => setEntityId(e.target.value)}
          placeholder="Record id (e.g. order id)"
          className="h-9 px-3 rounded-lg border border-border-light text-xs flex-1"
        />
        <input
          value={actor}
          onChange={(e) => setActor(e.target.value)}
          placeholder="Staff email"
          className="h-9 px-3 rounded-lg border border-border-light text-xs flex-1"
        />
        <button type="submit" className="h-9 px-4 bg-primary text-white text-[11px] font-bold uppercase rounded-lg">
          Filter
        </button>
      </form>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-badge-discount/40 bg-badge-discount/5 px-3 py-2.5 text-xs text-badge-discount">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      <div className="bg-surface-card border border-border-light rounded-xl divide-y divide-border-light">
        {entries.map((entry) => {
          const isOpen = open.has(entry.id);
          return (
            <div key={entry.id} className="p-3 text-xs">
              <button
                type="button"
                className="w-full flex flex-wrap items-center gap-2 text-left"
                onClick={() => {
                  const next = new Set(open);
                  if (isOpen) next.delete(entry.id);
                  else next.add(entry.id);
                  setOpen(next);
                }}
              >
                {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                <span className="text-text-muted whitespace-nowrap">
                  {new Date(entry.occurred_at).toLocaleString("en-GB")}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${ACTION_STYLE[entry.action]}`}>
                  {entry.action}
                </span>
                <span className="font-semibold">{entry.entity_type.replace(/_/g, " ")}</span>
                <span className="text-text-muted break-all">{entry.entity_id}</span>
                <span className="ml-auto text-text-muted">
                  {entry.actor_email ?? (entry.actor_kind === "anon" ? "Guest customer" : "System")}
                </span>
              </button>
              {isOpen && (
                <div className="mt-2 pl-5">
                  <ChangeList entry={entry} />
                </div>
              )}
            </div>
          );
        })}
        {loading &&
          Array.from({ length: 3 }).map((_, i) => (
            <div key={`s${i}`} className="p-3">
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        {!loading && entries.length === 0 && (
          <p className="p-6 text-center text-xs text-text-muted">Nothing recorded yet for this filter.</p>
        )}
      </div>

      {nextBefore && !loading && (
        <button
          type="button"
          onClick={() => load(undefined, nextBefore)}
          className="mx-auto block px-4 py-2 border border-primary text-primary text-[11px] font-bold uppercase rounded-lg"
        >
          Load older
        </button>
      )}
    </div>
  );
}
