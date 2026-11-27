"use client";

import { useEffect, useState } from "react";
import { Check, Edit, MapPin, Phone, Save, User as UserIcon } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { AddressPicker, EMPTY_ADDRESS } from "@/components/checkout/AddressPicker";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { normalizeBdPhone } from "@/lib/phone";
import { readDelivery, type DeliveryDetails as Details } from "@/lib/delivery-details";
import { useT } from "@/i18n/client";

const EMPTY: Details = { name: "", phone: "", ...EMPTY_ADDRESS };
const inputCls =
  "w-full h-11 pl-9 pr-3 rounded-lg border border-border-light bg-surface-card text-sm focus:outline-none focus:ring-1 focus:ring-primary";

/** Profile card: view, add and change the saved delivery name/phone/address. */
export function DeliveryDetails() {
  const { user } = useAuth();
  const { t } = useT();
  const [saved, setSaved] = useState<Details | null>(null);
  const [form, setForm] = useState<Details>(EMPTY);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Saved details first; otherwise offer the last order's address as a start.
  useEffect(() => {
    if (!user) return;
    const own = readDelivery(user);
    if (own) {
      setSaved(own);
      return;
    }
    const meta = user.user_metadata ?? {};
    const name = typeof meta.full_name === "string" ? meta.full_name : "";
    getSupabaseBrowserClient()
      ?.from("orders")
      .select("customer_name, customer_phone, division, district, thana, address_line")
      .eq("user_id", user.id)
      .not("district", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        setForm({
          name: data?.customer_name || name,
          phone: data?.customer_phone || "",
          division: data?.division ?? "",
          district: data?.district ?? "",
          thana: data?.thana ?? "",
          line: data?.address_line ?? "",
        });
      });
  }, [user]);

  const start = () => {
    if (saved) setForm(saved);
    setError(null);
    setEditing(true);
  };

  const save = async () => {
    const phone = normalizeBdPhone(form.phone);
    if (!phone) return setError(t("buy.delivery.errPhone"));
    if (!form.division || !form.district || !form.thana || form.line.trim().length < 5) {
      return setError(t("buy.delivery.errAddress"));
    }
    const next: Details = { ...form, name: form.name.trim(), phone, line: form.line.trim() };
    setSaving(true);
    setError(null);
    const supabase = getSupabaseBrowserClient();
    const res = await supabase?.auth.updateUser({ data: { delivery: next } });
    setSaving(false);
    if (!res || res.error) return setError(t("buy.delivery.errSave"));
    setSaved(next);
    setEditing(false);
    setDone(true);
    setTimeout(() => setDone(false), 2500);
  };

  if (!user) return null;

  return (
    <div className="bg-surface-card border border-border-light rounded-xl p-space-lg shadow-sm">
      <div className="flex items-center justify-between gap-2 mb-space-base pb-space-base border-b border-border-light">
        <div>
          <h2 className="font-display text-lg uppercase tracking-wider font-bold text-primary">
            {t("buy.delivery.title")}
          </h2>
          <p className="text-xs text-text-muted">{t("buy.delivery.hint")}</p>
        </div>
        {!editing && saved && (
          <button onClick={start} className="sp-btn sp-racket inline-flex items-center gap-1.5 py-1.5 text-xs font-semibold">
            <Edit className="w-3.5 h-3.5" />
            {t("buy.delivery.edit")}
          </button>
        )}
        {done && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-600">
            <Check className="w-3.5 h-3.5" /> {t("buy.delivery.saved")}
          </span>
        )}
      </div>

      {error && (
        <div className="bg-badge-discount/10 border border-badge-discount/30 rounded-lg p-3 mb-space-base">
          <p className="text-xs font-medium text-badge-discount">{error}</p>
        </div>
      )}

      {editing ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">{t("buy.delivery.name")}</label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  autoComplete="name"
                  className={inputCls}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">{t("buy.delivery.phone")}</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input
                  type="tel"
                  inputMode="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="01XXXXXXXXX"
                  autoComplete="tel"
                  className={inputCls}
                />
              </div>
            </div>
          </div>
          <AddressPicker value={form} onChange={(a) => setForm({ ...form, ...a })} />
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditing(false)} className="sp-btn sp-red py-1.5 text-xs font-semibold">
              {t("buy.delivery.cancel")}
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="sp-btn sp-goal inline-flex items-center gap-1.5 py-1.5 text-xs font-semibold"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? t("buy.delivery.saving") : t("buy.delivery.save")}
            </button>
          </div>
        </div>
      ) : saved ? (
        <div className="text-sm text-on-surface space-y-1">
          {saved.name && <p className="font-semibold">{saved.name}</p>}
          <p className="flex items-center gap-2"><Phone className="w-4 h-4 text-text-muted" /> {saved.phone}</p>
          <p className="flex items-start gap-2">
            <MapPin className="w-4 h-4 mt-0.5 text-text-muted shrink-0" />
            {[saved.line, saved.thana, saved.district, saved.division].filter(Boolean).join(", ")}
          </p>
        </div>
      ) : (
        <div className="text-center py-2">
          <p className="text-sm text-text-muted mb-3">{t("buy.delivery.empty")}</p>
          <button onClick={start} className="sp-btn sp-goal inline-flex items-center gap-1.5 py-2 text-xs font-semibold">
            <MapPin className="w-3.5 h-3.5" />
            {t("buy.delivery.add")}
          </button>
        </div>
      )}
    </div>
  );
}
