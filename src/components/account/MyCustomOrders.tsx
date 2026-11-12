"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useT } from "@/i18n/client";
import { formatMoney } from "@/i18n";
import type { CustomOrderStatus } from "@/lib/custom-jersey/types";

interface Row {
  order_number: string;
  access_token: string;
  status: CustomOrderStatus;
  quantity: number;
  estimated_price: number;
  final_price: number | null;
  created_at: string;
}

/** The signed-in customer's custom jersey orders. Shows nothing when there are none. */
export function MyCustomOrders() {
  const { t, locale } = useT();
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    fetch("/api/custom-jersey/orders", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { orders: [] }))
      .then((json) => setRows(json.orders ?? []))
      .catch(() => {});
  }, []);

  if (rows.length === 0) return null;
  return (
    <section className="bg-surface-card rounded-xl border border-border-light p-space-base mt-space-lg">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display text-lg uppercase font-bold text-primary">{t("customJersey.account.title")}</h2>
        <Link href="/custom-jersey" className="text-xs font-bold uppercase text-primary underline underline-offset-2">
          {t("customJersey.account.start")}
        </Link>
      </div>
      <ul className="divide-y divide-border-light">
        {rows.map((r) => (
          <li key={r.order_number} className="py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <strong className="text-primary">{r.order_number}</strong>
            <span className="text-text-muted">{t(`customJersey.status.${r.status}`)}</span>
            <span className="tabular-nums ml-auto">{formatMoney(Number(r.final_price ?? r.estimated_price), locale)}</span>
            <Link href={`/custom-jersey/order/${r.access_token}`} className="text-xs font-bold uppercase underline underline-offset-2">
              {t("customJersey.account.view")}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
