"use client";

import { useState } from "react";
import { ArrowLeft, Banknote, CreditCard, Smartphone, Wallet, X, UserRound, Check } from "lucide-react";
import { useT } from "@/i18n/client";
import { PAY_METHODS, taka, type PayMethod } from "@/lib/pos/types";
import { field } from "../api";
import { Numpad, applyKey, padSide, type PadKey } from "./parts";

export interface Pay {
  method: PayMethod;
  amount: string;
  reference: string;
}

const ICONS: Record<PayMethod, React.ComponentType<{ className?: string }>> = { cash: Banknote, card: CreditCard, bkash: Smartphone, nagad: Smartphone, other: Wallet };
const QUICK = [100, 500, 1000];
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The payment screen: choose how the customer pays on the left, type the
 * amount on the pad, then validate. Several lines make a split payment;
 * cash over the total shows the change to give back.
 */
export function PaymentScreen({
  total,
  pays,
  setPays,
  customerLabel,
  onCustomer,
  onBack,
  onValidate,
  busy,
  error,
  blocked,
}: {
  total: number;
  pays: Pay[];
  setPays: (next: Pay[]) => void;
  customerLabel: string;
  onCustomer: () => void;
  onBack: () => void;
  onValidate: () => void;
  busy: boolean;
  error: string | null;
  /** A reason the sale cannot be saved (discount over the limit), shown instead of the button being silently off. */
  blocked: string | null;
}) {
  const { t } = useT();
  const [selected, setSelected] = useState(0);
  // True right after a line is chosen: the first digit replaces the amount instead of adding to it.
  const [fresh, setFresh] = useState(true);

  const paid = pays.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const remaining = Math.max(0, round2(total - paid));
  const change = Math.max(0, round2(paid - total));
  const current = pays[selected];

  function addMethod(method: PayMethod) {
    if (pays.length >= 4) return;
    setPays([...pays, { method, amount: remaining ? String(remaining) : "", reference: "" }]);
    setSelected(pays.length);
    setFresh(true);
  }

  function patch(i: number, change: Partial<Pay>) {
    setPays(pays.map((p, n) => (n === i ? { ...p, ...change } : p)));
  }

  function press(key: PadKey) {
    if (!current) return;
    patch(selected, { amount: applyKey(fresh && key !== "back" ? "" : current.amount, key) });
    setFresh(false);
  }

  function remove(i: number) {
    setPays(pays.filter((_, n) => n !== i));
    setSelected(Math.max(0, i - 1));
    setFresh(true);
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-surface">
      <div className="max-w-5xl mx-auto p-3 sm:p-5 grid lg:grid-cols-[240px_1fr] gap-4">
        {/* How the customer pays */}
        <aside className="flex flex-col gap-2">
          <button type="button" onClick={onBack} className="inline-flex items-center gap-2 h-11 px-3 rounded-lg border border-border-light bg-surface-card text-sm font-semibold hover:bg-surface-subtle">
            <ArrowLeft className="w-4 h-4" /> {t("shop.register.backToBill")}
          </button>
          <p className="text-xs font-semibold text-text-muted mt-2">{t("shop.register.payWith")}</p>
          <div className="grid grid-cols-2 lg:grid-cols-1 gap-2">
            {PAY_METHODS.map((m) => {
              const Icon = ICONS[m];
              return (
                <button key={m} type="button" onClick={() => addMethod(m)} disabled={pays.length >= 4} className="h-12 px-3 rounded-lg border border-border-light bg-surface-card flex items-center gap-2.5 text-sm font-semibold text-on-surface hover:border-accent-gold disabled:opacity-40">
                  <Icon className="w-5 h-5 text-accent-gold" />
                  {t(`shop.method.${m}`)}
                </button>
              );
            })}
          </div>
          <button type="button" onClick={onCustomer} className="mt-2 h-12 px-3 rounded-lg border border-border-light bg-surface-card flex items-center gap-2.5 text-sm font-semibold text-on-surface hover:border-accent-gold">
            <UserRound className="w-5 h-5 text-accent-gold" />
            <span className="truncate">{customerLabel}</span>
          </button>
        </aside>

        <section className="flex flex-col gap-4 min-w-0">
          <div className="rounded-2xl border border-border-light bg-surface-card p-4 sm:p-6 text-center">
            <p className="text-sm text-text-muted">{t("shop.pos.toPay")}</p>
            <p className="text-4xl sm:text-5xl font-bold text-primary tabular-nums">{taka(total)}</p>
            <p className={`mt-2 text-base font-semibold ${remaining > 0 ? "text-badge-discount" : "text-emerald-600"}`}>
              {remaining > 0 ? t("shop.pos.remaining", { amount: taka(remaining) }) : change > 0 ? t("shop.pos.changeToGive", { amount: taka(change) }) : t("shop.register.paidInFull")}
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-4 items-start">
            <div className="flex flex-col gap-2">
              {pays.length === 0 && <p className="rounded-xl border border-dashed border-border-light p-5 text-sm text-text-muted text-center">{t("shop.register.chooseMethod")}</p>}
              {pays.map((p, i) => {
                const Icon = ICONS[p.method];
                const active = i === selected;
                return (
                  <div key={i} className={`rounded-xl border bg-surface-card ${active ? "border-accent-gold ring-1 ring-accent-gold" : "border-border-light"}`}>
                    <div className="flex items-center gap-2 p-3">
                      <button
                        type="button"
                        className="flex-1 flex items-center gap-2.5 text-left min-w-0"
                        onClick={() => {
                          setSelected(i);
                          setFresh(true);
                        }}
                      >
                        <Icon className="w-5 h-5 text-accent-gold flex-shrink-0" />
                        <span className="text-sm font-semibold flex-1 truncate">{t(`shop.method.${p.method}`)}</span>
                        <span className="text-lg font-bold tabular-nums">{taka(p.amount)}</span>
                      </button>
                      <button type="button" onClick={() => remove(i)} className="p-1.5 rounded text-text-muted hover:text-badge-discount" aria-label={t("shop.common.remove")}>
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    {active && p.method !== "cash" && (
                      <div className="px-3 pb-3">
                        <input value={p.reference} onChange={(e) => patch(i, { reference: e.target.value })} placeholder={t("shop.pos.reference")} className={field} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex flex-col gap-3">
              <Numpad
                onKey={press}
                disabled={!current}
                side={QUICK.map((n) => (
                  <button
                    key={n}
                    type="button"
                    disabled={!current}
                    className={padSide(false)}
                    onClick={() => {
                      if (!current) return;
                      patch(selected, { amount: String(round2((Number(current.amount) || 0) + n)) });
                      setFresh(false);
                    }}
                  >
                    +{n}
                  </button>
                ))}
              />
              {(error || blocked) && <p className="text-sm text-badge-discount bg-badge-discount/10 rounded-lg p-2.5">{error ?? blocked}</p>}
              <button type="button" onClick={onValidate} disabled={busy || remaining > 0 || Boolean(blocked) || (pays.length === 0 && total > 0)} className="h-14 rounded-xl bg-accent-gold text-white text-lg font-bold flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-40">
                <Check className="w-5 h-5" />
                {busy ? t("shop.common.saving") : t("shop.register.validate")}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
