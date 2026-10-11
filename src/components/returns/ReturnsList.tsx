import { headers } from "next/headers";
import type { Return, ReturnStatus } from "@/types";

interface ReturnsResponse {
  data: Return[];
  error?: string;
}

async function fetchReturns(): Promise<Return[]> {
  const headersList = headers();
  const host = headersList.get("host");
  const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
  const base = host ? `${protocol}://${host}` : "";
  const res = await fetch(`${base}/api/returns`, { next: { tags: ["returns"] } });
  if (!res.ok) return [];
  const json: ReturnsResponse = await res.json();
  return json.data || [];
}

const statusColors: Record<ReturnStatus, string> = {
  requested: "bg-yellow-100 text-yellow-700",
  approved: "bg-blue-100 text-blue-700",
  received: "bg-indigo-100 text-indigo-700",
  completed: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

export async function ReturnsList() {
  const returns = await fetchReturns();

  if (returns.length === 0) {
    return (
      <div className="bg-surface-card border border-border-light rounded-xl p-12 text-center">
        <p className="text-text-muted text-sm">You have not requested any returns.</p>
      </div>
    );
  }

  return (
    <div className="bg-surface-card border border-border-light rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-surface-subtle">
            <tr>
              <th className="text-left text-xs font-semibold text-text-muted uppercase tracking-wider px-4 py-3">Return ID</th>
              <th className="text-left text-xs font-semibold text-text-muted uppercase tracking-wider px-4 py-3">Order</th>
              <th className="text-left text-xs font-semibold text-text-muted uppercase tracking-wider px-4 py-3">Reason</th>
              <th className="text-center text-xs font-semibold text-text-muted uppercase tracking-wider px-4 py-3">Status</th>
              <th className="text-right text-xs font-semibold text-text-muted uppercase tracking-wider px-4 py-3">Refund</th>
              <th className="text-left text-xs font-semibold text-text-muted uppercase tracking-wider px-4 py-3">Date</th>
            </tr>
          </thead>
          <tbody>
            {returns.map((r) => (
              <tr key={r.id} className="border-b border-border-light last:border-b-0">
                <td className="px-4 py-3 text-sm font-mono text-on-surface">{r.id.slice(0, 8)}…</td>
                <td className="px-4 py-3 text-sm font-mono text-on-surface">{r.order_id.slice(0, 8)}…</td>
                <td className="px-4 py-3 text-sm text-on-surface max-w-xs truncate">{r.reason || "—"}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[r.status as ReturnStatus] ?? "bg-gray-100 text-gray-700"}`}>
                    {r.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-on-surface text-right">
                  {r.refund_amount && Number(r.refund_amount) > 0
                    ? `৳ ${Number(r.refund_amount).toFixed(2)}`
                    : "—"}
                </td>
                <td className="px-4 py-3 text-sm text-text-muted">{new Date(r.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
