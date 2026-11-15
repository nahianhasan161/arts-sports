"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Banknote, Receipt, Wallet, Boxes, Shirt, Contact, Building2, Link2, UserRound, Store, Play } from "lucide-react";
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
  // The shop where my own cash drawer is open, if it is.
  const [myShop, setMyShop] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void api<{ session: { showroom_id: string } | null }>("/api/admin/pos/session").then((res) => {
      if (alive && res.ok) setMyShop(res.data.session?.showroom_id ?? null);
    });
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

  const paid = Math.max(1, ...data.methods.map((m) => m.amount));

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* One card per shop: open its register from here. */}
      {data.shops.length === 0 ? (
        <section className={`${panel} p-6 text-center`}>
          <p className="text-sm text-text-muted mb-3">{t("admin.store.noShops")}</p>
          <Link href="/admin/offline/branches" className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
            <Building2 className="w-4 h-4" />
            {t("admin.store.addShop")}
          </Link>
        </section>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {data.shops.map((s) => {
            const selling = data.drawers.filter((d) => d.shop === s.name);
            const mine = myShop === s.id;
            return (
              <section key={s.id} className={`${panel} p-4 sm:p-5 flex flex-col gap-4 ${mine ? "border-accent-gold" : ""}`}>
                <div className="flex items-start gap-3">
                  <span className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0">
                    <Store className="w-5 h-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-bold text-primary truncate">{s.name}</h2>
                    <p className="text-xs text-text-muted truncate">{selling.length ? selling.map((d) => d.staff).join(", ") : t("admin.store.nobodySelling")}</p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${selling.length ? "bg-emerald-100 text-emerald-700" : "bg-surface-subtle text-text-muted"}`}>{selling.length ? t("admin.branches.open") : t("admin.branches.closed")}</span>
                </div>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-xl bg-surface-subtle p-3">
                    <dt className="text-xs text-text-muted">{t("admin.store.salesToday")}</dt>
                    <dd className="text-lg font-bold text-on-surface">{formatMoney(Math.round(s.total), locale)}</dd>
                  </div>
                  <div className="rounded-xl bg-surface-subtle p-3">
                    <dt className="text-xs text-text-muted">{t("admin.store.billsToday")}</dt>
                    <dd className="text-lg font-bold text-on-surface">{num(s.bills, locale)}</dd>
                  </div>
                </dl>
                <Link href={`/admin/offline/pos?shop=${s.id}`} className="mt-auto inline-flex items-center justify-center gap-2 h-11 rounded-xl bg-accent-gold text-white text-sm font-bold hover:opacity-90">
                  <Play className="w-4 h-4" />
                  {mine ? t("admin.store.continueSelling") : t("admin.store.openRegister")}
                </Link>
              </section>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Stat label={t("admin.store.salesToday")} value={formatMoney(Math.round(data.total), locale)} icon={Banknote} tone="green" />
        <Stat label={t("admin.store.billsToday")} value={num(data.bills, locale)} icon={Receipt} tone="blue" href="/admin/offline/orders" />
        <Stat label={t("admin.store.openDrawers")} value={num(data.drawers.length, locale)} icon={Wallet} tone="purple" href="/admin/offline/cash" />
        <Stat label={t("admin.store.lowStock")} value={num(data.low_stock, locale)} icon={Boxes} tone={data.low_stock > 0 ? "red" : "green"} href="/admin/offline/inventory" />
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <QuickLink label={t("admin.nav.shopCustom.name")} href="/admin/offline/custom-jersey" icon={Shirt} />
        <QuickLink label={t("admin.store.manageStock")} href="/admin/offline/inventory" icon={Boxes} />
        <QuickLink label={t("admin.store.seeCustomers")} href="/admin/offline/customers" icon={Contact} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
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
