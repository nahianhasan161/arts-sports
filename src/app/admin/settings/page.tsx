"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Check, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const NUMBER_FIELDS: { key: string; label: string; help: string }[] = [
  { key: "delivery_fee_dhaka", label: "Delivery charge inside Dhaka (৳)", help: "Dhaka city thanas." },
  { key: "delivery_fee_outside", label: "Delivery charge outside Dhaka (৳)", help: "Everywhere else, including Savar and Keraniganj unless listed below." },
  { key: "free_delivery_over", label: "Free delivery from (৳)", help: "Order subtotal after coupon. To turn free delivery off, set a very high number." },
  { key: "cod_min_advance", label: "Advance when delivery is free (৳)", help: "Asked from risky COD orders that have no delivery charge." },
  { key: "cod_high_value", label: "New-customer COD limit (৳)", help: "Above this, a first-time customer must pay the delivery charge first." },
  { key: "risk_low_max", label: "Low risk: score up to", help: "COD orders at or below this are confirmed automatically." },
  { key: "risk_high_min", label: "High risk: score from", help: "COD orders at or above this must pay the delivery charge first." },
];

export default function SettingsPage() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [defaults, setDefaults] = useState<string[]>([]);
  const [thanas, setThanas] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Could not load settings");
        setValues(json.settings);
        setDefaults(json.default_dhaka_thanas);
        try {
          setThanas(json.settings.dhaka_inside_thanas ? (JSON.parse(json.settings.dhaka_inside_thanas) as string[]).join("\n") : "");
        } catch {
          setThanas("");
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load settings"))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const body: Record<string, unknown> = {};
      for (const f of NUMBER_FIELDS) if (values[f.key] !== undefined && values[f.key] !== "") body[f.key] = Number(values[f.key]);
      body.courier_dhaka = values.courier_dhaka || "pathao";
      body.courier_outside = values.courier_outside || "steadfast";
      body.dhaka_inside_thanas = thanas.split("\n").map((t) => t.trim()).filter(Boolean);
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not save");
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const field = "w-full h-9 px-3 rounded-lg border border-border-light text-sm";

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="font-display text-2xl font-bold text-primary">Shop Settings</h1>
        <p className="text-xs text-text-muted mt-1">Delivery charges, fake-order rules and couriers. Changes apply to the next order.</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-badge-discount/40 bg-badge-discount/5 px-3 py-2.5 text-xs text-badge-discount">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {loading ? (
        <Skeleton className="h-96 w-full rounded-xl" />
      ) : (
        <div className="bg-surface-card border border-border-light rounded-xl p-4 space-y-5">
          <div className="grid sm:grid-cols-2 gap-4">
            {NUMBER_FIELDS.map((f) => (
              <label key={f.key} className="text-xs space-y-1">
                <span className="font-semibold block">{f.label}</span>
                <input
                  type="number"
                  min={0}
                  className={field}
                  value={values[f.key] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                />
                <span className="text-text-muted block">{f.help}</span>
              </label>
            ))}
            {(["courier_dhaka", "courier_outside"] as const).map((key) => (
              <label key={key} className="text-xs space-y-1">
                <span className="font-semibold block">{key === "courier_dhaka" ? "Courier inside Dhaka" : "Courier outside Dhaka"}</span>
                <select className={field} value={values[key] ?? (key === "courier_dhaka" ? "pathao" : "steadfast")} onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}>
                  <option value="pathao">Pathao</option>
                  <option value="steadfast">Steadfast</option>
                </select>
              </label>
            ))}
          </div>

          <label className="text-xs space-y-1 block">
            <span className="font-semibold block">Thanas charged as inside Dhaka (one per line)</span>
            <textarea rows={6} className="w-full px-3 py-2 rounded-lg border border-border-light text-sm font-mono" value={thanas} onChange={(e) => setThanas(e.target.value)} placeholder={defaults.join("\n")} />
            <span className="text-text-muted block">Leave empty to use the built-in Dhaka city list ({defaults.length} thanas). Names must match the checkout list.</span>
          </label>

          <div className="flex items-center gap-3">
            <button type="button" onClick={() => void save()} disabled={saving} className="h-9 px-4 bg-primary text-white text-[11px] font-bold uppercase rounded-lg inline-flex items-center gap-2 disabled:opacity-60">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save
            </button>
            {saved && (
              <span className="text-xs text-emerald-700 inline-flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> Saved
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
