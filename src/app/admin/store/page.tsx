"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Banknote, Receipt, Wallet, Boxes, ScanBarcode, Contact, Building2, Link2, UserRound } from "lucide-react";
import { useT } from "@/i18n/client";
import { formatMoney } from "@/i18n";
import { api } from "@/components/admin/pos/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Stat, QuickLink, panel, num } from "@/components/admin/dashboard/parts";

interface StoreOverview {
  shops: { id: string; name: string; bills: number; total: number }[];
  total: number;
  bills: number;
  methods: { method: "cash" | "card" | "bkash" | "nagad" | "other"; amount: number }[];
  drawers: { id: string; shop: string; staff: string; opened_at: string }[];
  low_stock: number;
}

/** The shop (POS) dashboard: every branch at a glance. Needs `pos.use`. */
export default function StoreOverviewPage() {
  const { t, locale } = useT();
  const [data, setData] = useState<StoreOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void api<StoreOverview>("/api/admin/store/overview").then((res) => {
      if (!alive) return;
      if (res.ok) setData(res.data);
      else setError(res.error);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (error) return <p className="rounded-xl bg-badge-discount/10 border border-badge-discount/30 p-4 text-sm text-badge-discount">{error}</p>;
  if (!data) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 max-w-7xl mx-auto">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
    );
  }

  const top = Math.max(1, ...data.shops.map((s) => s.total));
  const paid = Math.max(1, ...data.methods.map((m) => m.amount));

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{t("admin.store.intro")}</p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Stat label={t("admin.store.salesToday")} value={formatMoney(Math.round(data.total), locale)} icon={Banknote} tone="green" />
        <Stat label={t("admin.store.billsToday")} value={num(data.bills, locale)} icon={Receipt} tone="blue" href="/admin/pos" />
        <Stat label={t("admin.store.openDrawers")} value={num(data.drawers.length, locale)} icon={Wallet} tone="purple" />
        <Stat label={t("admin.store.lowStock")} value={num(data.low_stock, locale)} icon={Boxes} tone={data.low_stock > 0 ? "red" : "green"} href="/admin/inventory" />
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <QuickLink label={t("admin.store.startSelling")} href="/admin/pos" icon={ScanBarcode} />
        <QuickLink label={t("admin.store.manageStock")} href="/admin/inventory" icon={Boxes} />
        <QuickLink label={t("admin.store.seeCustomers")} href="/admin/customers" icon={Contact} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <section className={`${panel} p-4 sm:p-5`}>
          <h2 className="text-base font-bold text-primary mb-4">{t("admin.store.byShop")}</h2>
          {data.shops.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-sm text-text-muted mb-3">{t("admin.store.noShops")}</p>
              <Link href="/admin/store/branches" className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
                <Building2 className="w-4 h-4" />
                {t("admin.store.addShop")}
              </Link>
            </div>
          ) : (
            <ul className="space-y-4">
              {data.shops.map((s) => (
                <li key={s.id}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-semibold text-on-surface truncate">{s.name}</span>
                    <span className="text-text-muted whitespace-nowrap">
                      {t("admin.store.bills", { n: num(s.bills, locale) })} · <b className="text-on-surface">{formatMoney(Math.round(s.total), locale)}</b>
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 rounded-full bg-surface-subtle overflow-hidden">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(0, (s.total / top) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={`${panel} p-4 sm:p-5`}>
          <h2 className="text-base font-bold text-primary mb-4">{t("admin.store.drawers")}</h2>
          {data.drawers.length === 0 ? (
            <p className="text-sm text-text-muted py-4">{t("admin.store.noDrawers")}</p>
          ) : (
            <ul className="divide-y divide-border-light">
              {data.drawers.map((d) => (
                <li key={d.id} className="flex items-center gap-3 py-2.5">
                  <span className="w-9 h-9 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center">
                    <UserRound className="w-4 h-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-on-surface truncate">{d.staff}</p>
                    <p className="text-xs text-text-muted truncate">{d.shop}</p>
                  </div>
                  <span className="text-xs text-text-muted whitespace-nowrap">
                    {t("admin.store.since", { time: new Date(d.opened_at).toLocaleTimeString(locale === "bn" ? "bn-BD" : "en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dhaka" }) })}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <h2 className="text-base font-bold text-primary mt-6 mb-3">{t("admin.store.byMethod")}</h2>
          {data.methods.length === 0 ? (
            <p className="text-sm text-text-muted">{t("admin.store.noPayments")}</p>
          ) : (
            <ul className="space-y-2.5">
              {data.methods.map((m) => (
                <li key={m.method} className="flex items-center gap-3 text-sm">
                  <span className="w-16 text-on-surface-variant">{t(`shop.method.${m.method}`)}</span>
                  <div className="flex-1 h-2 rounded-full bg-surface-subtle overflow-hidden">
                    <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.max(0, (m.amount / paid) * 100)}%` }} />
                  </div>
                  <b className="w-24 text-right text-on-surface">{formatMoney(Math.round(m.amount), locale)}</b>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className={`${panel} p-4 sm:p-5`}>
        <h2 className="flex items-center gap-2 text-base font-bold text-primary mb-3">
          <Link2 className="w-5 h-5 text-accent-gold" />
          {t("admin.store.connected")}
        </h2>
        <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm text-on-surface-variant list-disc pl-5">
          <li>{t("admin.store.c1")}</li>
          <li>{t("admin.store.c2")}</li>
          <li>{t("admin.store.c3")}</li>
          <li>{t("admin.store.c4")}</li>
        </ul>
      </section>
    </div>
  );
}
