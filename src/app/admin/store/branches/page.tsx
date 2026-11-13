"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, MapPin, Pencil, Plus } from "lucide-react";
import { useT } from "@/i18n/client";
import { formatMoney } from "@/i18n";
import { api, btnGhost, btnPrimary, field } from "@/components/admin/pos/api";
import { panel, num } from "@/components/admin/dashboard/parts";

interface Branch {
  id: string;
  name: string;
  address: string | null;
  is_active: boolean;
  pieces: number;
  today: number;
}

/** Add, rename, close and reopen the physical shops. Needs `settings.manage`. */
export default function BranchesPage() {
  const { t, locale } = useT();
  const [branches, setBranches] = useState<Branch[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // "new" = the add form; an id = editing that shop.
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await api<{ branches: Branch[] }>("/api/admin/store/branches");
    if (res.ok) setBranches(res.data.branches);
    else setError(res.error);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  function startEdit(b: Branch | null) {
    setError(null);
    setEditing(b ? b.id : "new");
    setName(b?.name ?? "");
    setAddress(b?.address ?? "");
  }

  async function send(body: Record<string, unknown>, method: "POST" | "PATCH") {
    setBusy(true);
    setError(null);
    const res = await api("/api/admin/store/branches", body, method);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setEditing(null);
    await load();
  }

  const form = (
    <form
      className={`${panel} p-4 grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end`}
      onSubmit={(e) => {
        e.preventDefault();
        void send(editing === "new" ? { name, address } : { id: editing, name, address }, editing === "new" ? "POST" : "PATCH");
      }}
    >
      <label className="text-sm font-medium text-on-surface">
        {t("admin.branches.name")}
        <input autoFocus required value={name} onChange={(e) => setName(e.target.value)} placeholder={t("admin.branches.namePlaceholder")} className={`${field} mt-1`} />
      </label>
      <label className="text-sm font-medium text-on-surface">
        {t("admin.branches.address")}
        <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder={t("admin.branches.addressPlaceholder")} className={`${field} mt-1`} />
      </label>
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className={btnPrimary}>
          {t("admin.branches.save")}
        </button>
        <button type="button" onClick={() => setEditing(null)} className={btnGhost}>
          {t("admin.branches.cancel")}
        </button>
      </div>
    </form>
  );

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start gap-3">
        <p className="flex-1 text-sm text-on-surface-variant">
          {t("admin.branches.intro")} {t("admin.branches.onlineNote")}
        </p>
        {editing !== "new" && (
          <button onClick={() => startEdit(null)} className={btnPrimary}>
            <Plus className="w-4 h-4" />
            {t("admin.branches.add")}
          </button>
        )}
      </div>

      {error && <p className="rounded-xl bg-badge-discount/10 border border-badge-discount/30 p-3 text-sm text-badge-discount">{error}</p>}
      {editing === "new" && form}

      {branches === null ? (
        <p className="text-sm text-text-muted">{t("shop.common.loading")}</p>
      ) : branches.length === 0 ? (
        <p className={`${panel} p-8 text-center text-sm text-text-muted`}>{t("admin.branches.empty")}</p>
      ) : (
        <ul className="space-y-3">
          {branches.map((b) =>
            editing === b.id ? (
              <li key={b.id}>{form}</li>
            ) : (
              <li key={b.id} className={`${panel} p-4 flex flex-col sm:flex-row sm:items-center gap-4 ${b.is_active ? "" : "opacity-70"}`}>
                <span className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-5 h-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-on-surface">{b.name}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${b.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"}`}>{b.is_active ? t("admin.branches.open") : t("admin.branches.closed")}</span>
                  </div>
                  {b.address && (
                    <p className="flex items-center gap-1 text-xs text-text-muted mt-0.5">
                      <MapPin className="w-3.5 h-3.5" />
                      {b.address}
                    </p>
                  )}
                  <p className="text-xs text-text-muted mt-1">
                    {t("admin.branches.stockPieces", { n: num(b.pieces, locale) })} · {t("admin.branches.todaySales")}: {formatMoney(Math.round(b.today), locale)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => startEdit(b)} className={btnGhost}>
                    <Pencil className="w-4 h-4" />
                    {t("admin.branches.edit")}
                  </button>
                  <button disabled={busy} onClick={() => void send({ id: b.id, is_active: !b.is_active }, "PATCH")} className={btnGhost} title={b.is_active ? t("admin.branches.closeHint") : undefined}>
                    {b.is_active ? t("admin.branches.closeShop") : t("admin.branches.reopen")}
                  </button>
                </div>
              </li>
            )
          )}
        </ul>
      )}
    </div>
  );
}
