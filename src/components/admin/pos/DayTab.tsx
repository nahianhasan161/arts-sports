"use client";

import { useState } from "react";
import { useT } from "@/i18n/client";
import { taka, type PayMethod } from "@/lib/pos/types";
import { api, btnGhost, btnPrimary, card, dateTime, field } from "./api";

export interface SessionInfo {
  showrooms: { id: string; name: string }[];
  session: { id: string; showroom_id: string; opened_at: string; opening_float: number } | null;
  summary: { opening_float: number; sales_count: number; sales_total: number; refunds_total: number; cash_moves: number; expected_cash: number; by_method: Record<string, number> } | null;
  moves: { id: string; amount: number; reason: string; created_at: string }[];
  history: { id: string; staff: string; opened_at: string; closed_at: string; expected_cash: number; counted_cash: number; difference: number; note: string | null }[];
  can_manage: boolean;
  max_discount_percent: number;
}

/** The cash drawer: open it with a float, note cash in/out, and count it at the end of the day. */
export function DayTab({ info, reload }: { info: SessionInfo; reload: () => Promise<void> }) {
  const { t } = useT();
  const [showroom, setShowroom] = useState(info.showrooms[0]?.id ?? "");
  const [float, setFloat] = useState("");
  const [moveAmount, setMoveAmount] = useState("");
  const [moveReason, setMoveReason] = useState("");
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [closed, setClosed] = useState<{ difference: number } | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    const res = await api<{ summary?: { difference: number } }>("/api/admin/pos/session", body);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return null;
    }
    setError(null);
    await reload();
    return res.data;
  }

  const diffLine = (d: number) => (Math.abs(d) < 0.005 ? t("shop.day.exact") : d < 0 ? t("shop.day.short", { amount: taka(-d) }) : t("shop.day.over", { amount: taka(d) }));
  const s = info.summary;

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      {error && <p className="text-sm text-badge-discount">{error}</p>}
      {closed && <p className="text-sm bg-green-50 text-green-800 rounded p-3">{t("shop.day.closedOk", { result: diffLine(closed.difference) })}</p>}

      {!info.session ? (
        <section className={`${card} p-4 flex flex-col gap-3 max-w-md`}>
          <h3 className="font-display font-bold text-primary">{t("shop.day.openTitle")}</h3>
          {info.showrooms.length > 1 && (
            <select value={showroom} onChange={(e) => setShowroom(e.target.value)} className={field}>
              {info.showrooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          )}
          <label className="text-sm flex flex-col gap-1">
            {t("shop.day.openingFloat")}
            <input value={float} onChange={(e) => setFloat(e.target.value)} className={field} inputMode="decimal" placeholder="0" />
          </label>
          <button
            className={btnPrimary}
            disabled={busy}
            onClick={async () => {
              setClosed(null);
              await send({ action: "open", showroom_id: showroom, opening_float: Number(float) || 0 });
            }}
          >
            {t("shop.day.openDrawer")}
          </button>
        </section>
      ) : (
        s && (
          <>
            <section className={`${card} p-4 flex flex-col gap-3`}>
              <p className="text-xs text-text-muted">{t("shop.day.openedAt", { time: dateTime(info.session.opened_at) })}</p>
              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-sm">
                {[
                  [t("shop.day.salesCount"), String(s.sales_count)],
                  [t("shop.day.salesTotal"), taka(s.sales_total)],
                  [t("shop.day.refunds"), taka(s.refunds_total)],
                  [t("shop.day.expectedCash"), taka(s.expected_cash)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded bg-surface-subtle p-2">
                    <dt className="text-xs text-text-muted">{label}</dt>
                    <dd className="font-bold text-base">{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-xs text-text-muted">
                {t("shop.day.float", { amount: taka(s.opening_float) })}
                {Object.entries(s.by_method).map(([m, v]) => ` · ${t(`shop.method.${m as PayMethod}`)} ${taka(v)}`)}
                {s.cash_moves !== 0 && ` · ${t("shop.day.cashInOut")} ${taka(s.cash_moves)}`}
              </p>
            </section>

            <section className={`${card} p-4 flex flex-col gap-2`}>
              <h3 className="text-sm font-semibold">{t("shop.day.cashInOut")}</h3>
              <p className="text-xs text-text-muted">{t("shop.day.cashHint")}</p>
              <div className="grid grid-cols-[120px_1fr_auto_auto] gap-2">
                <input value={moveAmount} onChange={(e) => setMoveAmount(e.target.value)} placeholder={t("shop.common.amount")} className={field} inputMode="decimal" />
                <input value={moveReason} onChange={(e) => setMoveReason(e.target.value)} placeholder={t("shop.day.cashReason")} className={field} />
                {([1, -1] as const).map((sign) => (
                  <button
                    key={sign}
                    className={btnGhost}
                    disabled={busy}
                    onClick={async () => {
                      if (await send({ action: "cash_move", amount: sign * Math.abs(Number(moveAmount) || 0), reason: moveReason })) {
                        setMoveAmount("");
                        setMoveReason("");
                      }
                    }}
                  >
                    {t(sign === 1 ? "shop.day.cashIn" : "shop.day.cashOut")}
                  </button>
                ))}
              </div>
              {info.moves.length > 0 && (
                <ul className="text-xs text-text-muted">
                  {info.moves.map((m) => (
                    <li key={m.id}>
                      {m.amount > 0 ? "+" : "−"}
                      {taka(Math.abs(m.amount))} · {m.reason}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className={`${card} p-4 flex flex-col gap-2 max-w-md`}>
              <h3 className="text-sm font-semibold">{t("shop.day.closeDay")}</h3>
              <label className="text-sm flex flex-col gap-1">
                {t("shop.day.countedCash")}
                <input value={counted} onChange={(e) => setCounted(e.target.value)} className={field} inputMode="decimal" />
              </label>
              {counted !== "" && <p className="text-sm font-semibold">{diffLine((Number(counted) || 0) - s.expected_cash)}</p>}
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("shop.common.note")} className={field} />
              <button
                className={btnPrimary}
                disabled={busy || counted === ""}
                onClick={async () => {
                  const data = await send({ action: "close", counted_cash: counted, note });
                  if (data?.summary) {
                    setClosed({ difference: Number(data.summary.difference) });
                    setCounted("");
                    setNote("");
                  }
                }}
              >
                {t("shop.day.closeDay")}
              </button>
            </section>
          </>
        )
      )}

      {info.history.length > 0 && (
        <section className={`${card} overflow-x-auto`}>
          <table className="w-full text-sm">
            <thead className="text-xs text-text-muted text-left">
              <tr>
                <th className="p-2">{t("shop.day.closedAt")}</th>
                <th className="p-2">{t("shop.common.staff")}</th>
                <th className="p-2 text-right">{t("shop.day.expectedCash")}</th>
                <th className="p-2 text-right">{t("shop.day.counted")}</th>
                <th className="p-2">{t("shop.day.difference")}</th>
              </tr>
            </thead>
            <tbody>
              {info.history.map((h) => (
                <tr key={h.id} className="border-t border-border-light">
                  <td className="p-2">{dateTime(h.closed_at)}</td>
                  <td className="p-2">{h.staff}</td>
                  <td className="p-2 text-right">{taka(h.expected_cash)}</td>
                  <td className="p-2 text-right">{taka(h.counted_cash)}</td>
                  <td className={`p-2 ${Math.abs(h.difference) >= 0.005 ? "text-badge-discount font-semibold" : ""}`}>
                    {diffLine(Number(h.difference))}
                    {h.note && <span className="block text-xs text-text-muted font-normal">{h.note}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
