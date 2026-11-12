"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertCircle, Check, Copy, Download, FileText, Loader2, MessageCircle, Upload } from "lucide-react";
import { useT } from "@/i18n/client";
import { formatMoney } from "@/i18n";
import { sizeSummary } from "@/lib/custom-jersey/pricing";
import { DESIGN_ACCEPT } from "@/lib/custom-jersey/files";
import { BEFORE_APPROVAL, PRODUCTION_STEPS, type CustomOrderDetail, type Pattern, type UploadedFile } from "@/lib/custom-jersey/types";
import { JerseyPreview } from "./JerseyPreview";
import { SizeSummary } from "./RosterEditor";
import { LanguageToggle } from "./LanguageToggle";

interface Due {
  total: number;
  paid: number;
  advance: number;
  payable: number;
  kind: "advance" | "balance";
}
interface Payload {
  order: CustomOrderDetail;
  due: Due;
  free_revisions: number;
  advance_percent: number;
  online_payment: boolean;
}

const card = "bg-surface-card border border-border-light rounded-xl p-4 sm:p-5 flex flex-col gap-3";
const heading = "font-display uppercase font-bold text-primary text-sm tracking-wider";
const primaryBtn = "h-11 px-5 bg-primary text-white rounded-lg text-xs font-bold uppercase tracking-wider inline-flex items-center justify-center gap-2 disabled:opacity-50";
const ghostBtn = "h-10 px-4 border border-border-light bg-white rounded-lg text-xs font-bold uppercase tracking-wider inline-flex items-center justify-center gap-2 disabled:opacity-50";
const WHATSAPP = process.env.NEXT_PUBLIC_STORE_WHATSAPP?.replace(/[^\d]/g, "");

export function CustomOrderView({ token }: { token: string }) {
  const { t, locale } = useT();
  const params = useSearchParams();
  const money = (n: number) => formatMoney(n, locale);
  const dateText = (d: string) => new Date(d).toLocaleDateString(locale === "bn" ? "bn-BD" : "en-GB", { day: "numeric", month: "short", year: "numeric" });

  const [data, setData] = useState<Payload | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [message, setMessage] = useState("");
  const [change, setChange] = useState("");
  const [changeOpen, setChangeOpen] = useState(false);
  const [accept, setAccept] = useState(false);
  const [gallery, setGallery] = useState(false);
  const [newFiles, setNewFiles] = useState<UploadedFile[]>([]);
  const [resubmitNote, setResubmitNote] = useState("");
  // Back from the gateway the URL carries ?payment=<id>; it is checked below.
  const paymentId = params.get("payment");
  const [payment, setPayment] = useState<"verifying" | "successful" | "pending" | null>(paymentId ? "verifying" : null);
  const [resumeUrl, setResumeUrl] = useState<string | null>(null);

  const fetchOrder = useCallback(async (): Promise<Payload | null> => {
    const res = await fetch(`/api/custom-jersey/orders/${token}`, { cache: "no-store" }).catch(() => null);
    return res?.ok ? ((await res.json()) as Payload) : null;
  }, [token]);

  const load = useCallback(
    () =>
      fetchOrder().then((json) => {
        if (!json) return setMissing(true);
        setData(json);
        setGallery(json.order.gallery_consent);
      }),
    [fetchOrder]
  );

  useEffect(() => {
    let alive = true;
    fetchOrder().then((json) => {
      if (!alive) return;
      if (!json) return setMissing(true);
      setData(json);
      setGallery(json.order.gallery_consent);
    });
    return () => {
      alive = false;
    };
  }, [fetchOrder]);

  // Confirm the payment, then show the order as it now is.
  useEffect(() => {
    if (!paymentId) return;
    let alive = true;
    const check = async (attempt: number) => {
      const res = await fetch(`/api/custom-jersey/payments/${paymentId}`, { cache: "no-store" }).catch(() => null);
      const json = res?.ok ? await res.json() : null;
      if (!alive) return;
      if (json?.status === "successful") {
        setPayment("successful");
        void load();
      } else if (json?.status === "initiated" && attempt < 5) {
        setTimeout(() => void check(attempt + 1), 3000);
      } else {
        setPayment("pending");
        setResumeUrl(json?.checkout_url ?? null);
      }
    };
    void check(0);
    return () => {
      alive = false;
    };
  }, [paymentId, load]);

  const act = async (action: string, body: Record<string, unknown> = {}): Promise<Record<string, unknown> | null> => {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/custom-jersey/orders/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...body }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? t("customJersey.errors.generic"));
        if (res.status === 409) void load();
        return null;
      }
      if (json.order) setData(json as Payload);
      return json;
    } catch {
      setError(t("customJersey.errors.network"));
      return null;
    } finally {
      setBusy(null);
    }
  };

  const pay = async () => {
    const json = await act("pay");
    if (typeof json?.checkout_url === "string") window.location.href = json.checkout_url;
  };

  const uploadMore = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy("upload");
    setError(null);
    try {
      for (const file of Array.from(list).slice(0, 5)) {
        const form = new FormData();
        form.append("file", file);
        form.append("kind", "design");
        const res = await fetch("/api/custom-jersey/upload", { method: "POST", body: form });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? "Upload failed");
        setNewFiles((prev) => [...prev, { path: json.path, name: json.name, mime: json.mime, size: json.size, kind: "design" }]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("customJersey.errors.generic"));
    } finally {
      setBusy(null);
    }
  };

  if (missing) {
    return (
      <p className="text-sm text-text-muted flex items-center gap-2 py-12 justify-center">
        <AlertCircle className="w-4 h-4" /> {t("customJersey.order.notFound")}
      </p>
    );
  }
  if (!data) {
    return (
      <div className="flex justify-center py-16 text-text-muted">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  const { order: o, due } = data;
  const beforeApproval = BEFORE_APPROVAL.includes(o.status);
  const stepIndex = PRODUCTION_STEPS.indexOf(o.status);
  const latest = o.mockups[0];
  const revisionsLeft = Math.max(0, data.free_revisions - o.revision_count);
  const canPay = due.payable > 0 && !beforeApproval && !["rejected", "cancelled"].includes(o.status);
  const statusTone = ["rejected", "cancelled"].includes(o.status) ? "bg-badge-discount/10 text-badge-discount" : o.status === "changes_needed" || o.status === "mockup_sent" || o.status === "approved" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl uppercase font-bold text-primary">{t("customJersey.order.title", { id: o.order_number })}</h1>
          <span className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-bold ${statusTone}`}>{t(`customJersey.status.${o.status}`)}</span>
        </div>
        <LanguageToggle />
      </div>

      {params.get("new") && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl p-4 text-sm flex flex-col gap-2">
          <p className="font-semibold flex items-center gap-2">
            <Check className="w-4 h-4" /> {t("customJersey.order.newBanner")}
          </p>
          <p>{t("customJersey.order.saveLink")}</p>
          <button
            type="button"
            className="self-start inline-flex items-center gap-1.5 text-xs font-bold uppercase underline underline-offset-2"
            onClick={() => {
              void navigator.clipboard?.writeText(`${window.location.origin}/custom-jersey/order/${token}`);
              setCopied(true);
            }}
          >
            <Copy className="w-3.5 h-3.5" /> {copied ? t("customJersey.order.copied") : t("customJersey.order.copy")}
          </button>
        </div>
      )}

      {payment && (
        <div className={`rounded-xl p-4 text-sm flex flex-wrap items-center gap-3 ${payment === "successful" ? "bg-emerald-50 border border-emerald-200 text-emerald-900" : "bg-amber-50 border border-amber-200 text-amber-900"}`} role="status">
          {payment === "verifying" && <Loader2 className="w-4 h-4 animate-spin" />}
          {t(payment === "verifying" ? "customJersey.order.paymentVerifying" : payment === "successful" ? "customJersey.order.paymentReceived" : "customJersey.order.paymentPending")}
          {payment === "pending" && resumeUrl && (
            <a href={resumeUrl} className="font-bold underline underline-offset-2">
              {t("customJersey.order.finishPayment")}
            </a>
          )}
        </div>
      )}

      {error && (
        <p className="text-sm text-badge-discount bg-badge-discount/10 rounded-lg px-3 py-2 flex items-center gap-2" role="alert">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </p>
      )}

      {/* What the customer has to do now */}
      {o.status === "changes_needed" && (
        <section className={`${card} border-amber-300`}>
          <h2 className={heading}>{t("customJersey.order.changesNeededTitle")}</h2>
          <p className="text-sm whitespace-pre-line">{o.status_reason}</p>
          <p className="text-xs text-text-muted">{t("customJersey.order.resubmitHint")}</p>
          <label className={`${ghostBtn} self-start cursor-pointer`}>
            {busy === "upload" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} {t("customJersey.upload.add")}
            <input type="file" multiple accept={DESIGN_ACCEPT} className="hidden" onChange={(e) => { void uploadMore(e.target.files); e.target.value = ""; }} />
          </label>
          {newFiles.map((f) => (
            <span key={f.path} className="text-xs flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" /> {f.name}
            </span>
          ))}
          <textarea className="w-full rounded-lg border border-border-light bg-white p-3 text-sm" rows={2} value={resubmitNote} onChange={(e) => setResubmitNote(e.target.value)} placeholder={t("customJersey.order.messagePlaceholder")} />
          <button
            type="button"
            className={`${primaryBtn} self-start`}
            disabled={busy !== null}
            onClick={async () => {
              if (await act("resubmit", { files: newFiles, body: resubmitNote })) {
                setNewFiles([]);
                setResubmitNote("");
              }
            }}
          >
            {busy === "resubmit" && <Loader2 className="w-4 h-4 animate-spin" />} {t("customJersey.order.resubmit")}
          </button>
        </section>
      )}

      {(o.status === "rejected" || o.status === "cancelled") && (
        <section className={card}>
          <h2 className={heading}>{t(o.status === "rejected" ? "customJersey.order.rejectedTitle" : "customJersey.order.cancelledTitle")}</h2>
          {o.status_reason && <p className="text-sm whitespace-pre-line">{o.status_reason}</p>}
        </section>
      )}

      {["submitted", "in_review", "revision_requested"].includes(o.status) && <p className="text-sm bg-surface-subtle rounded-xl p-4">{t("customJersey.order.waiting")}</p>}

      {/* Mockups */}
      {latest && (
        <section className={card}>
          <h2 className={heading}>
            {t("customJersey.order.mockup")} · {t("customJersey.order.version", { n: latest.version })}
          </h2>
          <div className="grid sm:grid-cols-2 gap-2">
            {latest.images.map((src) => (
              <a key={src} href={src} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={t("customJersey.order.mockup")} className="w-full rounded-lg border border-border-light bg-surface-subtle" />
              </a>
            ))}
          </div>
          {latest.note && <p className="text-sm whitespace-pre-line">{latest.note}</p>}

          {o.status === "mockup_sent" && (
            <div className="border-t border-border-light pt-4 flex flex-col gap-3">
              <h3 className="font-semibold">{t("customJersey.order.approveTitle")}</h3>
              <dl className="text-sm grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 max-w-xs">
                <dt className="text-text-muted">{t("customJersey.order.finalPrice")}</dt>
                <dd className="tabular-nums text-right">{money(o.final_price ?? 0)}</dd>
                {o.delivery_charge > 0 && (
                  <>
                    <dt className="text-text-muted">{t("customJersey.order.deliveryCharge")}</dt>
                    <dd className="tabular-nums text-right">{money(o.delivery_charge)}</dd>
                  </>
                )}
                <dt className="font-semibold">{t("customJersey.order.total")}</dt>
                <dd className="tabular-nums text-right font-bold">{money(due.total)}</dd>
              </dl>

              <p className="text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-3 flex gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {t("customJersey.order.approveRule")}
              </p>
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input type="checkbox" className="w-4 h-4 mt-0.5 accent-[var(--primary)]" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
                {t("customJersey.order.approveTick")}
              </label>
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input type="checkbox" className="w-4 h-4 mt-0.5 accent-[var(--primary)]" checked={gallery} onChange={(e) => setGallery(e.target.checked)} />
                {t("customJersey.order.galleryTick")}
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={primaryBtn} disabled={!accept || busy !== null} onClick={() => act("approve", { accept_terms: true, gallery_consent: gallery })}>
                  {busy === "approve" && <Loader2 className="w-4 h-4 animate-spin" />} {t("customJersey.order.approveButton")}
                </button>
                <button type="button" className={ghostBtn} onClick={() => setChangeOpen((v) => !v)}>
                  {t("customJersey.order.requestChange")}
                </button>
              </div>
              {changeOpen && (
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-text-muted">
                    {revisionsLeft > 0 ? t("customJersey.order.revisionsFree", { left: revisionsLeft, total: data.free_revisions }) : t("customJersey.order.revisionsUsed", { total: data.free_revisions })}
                  </p>
                  <textarea className="w-full rounded-lg border border-border-light bg-white p-3 text-sm" rows={3} value={change} onChange={(e) => setChange(e.target.value)} placeholder={t("customJersey.order.changePlaceholder")} />
                  <button
                    type="button"
                    className={`${primaryBtn} self-start`}
                    disabled={change.trim().length < 3 || busy !== null}
                    onClick={async () => {
                      if (await act("request_revision", { body: change })) {
                        setChange("");
                        setChangeOpen(false);
                      }
                    }}
                  >
                    {busy === "request_revision" && <Loader2 className="w-4 h-4 animate-spin" />} {t("customJersey.order.sendChange")}
                  </button>
                </div>
              )}
            </div>
          )}

          {o.mockups.length > 1 && (
            <div className="flex flex-wrap gap-2 text-xs text-text-muted">
              {o.mockups.slice(1).map((m) => (
                <a key={m.id} href={m.images[0]} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                  {t("customJersey.order.version", { n: m.version })}
                </a>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Payment */}
      {!beforeApproval && o.final_price !== null && !["rejected", "cancelled"].includes(o.status) && (
        <section className={card}>
          <h2 className={heading}>{t("customJersey.order.payTitle")}</h2>
          <dl className="text-sm grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 max-w-xs">
            <dt className="text-text-muted">{t("customJersey.order.total")}</dt>
            <dd className="tabular-nums text-right">{money(due.total)}</dd>
            <dt className="text-text-muted">{t("customJersey.order.paid")}</dt>
            <dd className="tabular-nums text-right">{money(due.paid)}</dd>
            <dt className="font-semibold">{t("customJersey.order.due")}</dt>
            <dd className="tabular-nums text-right font-bold">{money(Math.max(0, due.total - due.paid))}</dd>
          </dl>
          {canPay &&
            (data.online_payment ? (
              <>
                <button type="button" className={`${primaryBtn} self-start`} disabled={busy !== null} onClick={pay}>
                  {busy === "pay" && <Loader2 className="w-4 h-4 animate-spin" />}
                  {t(due.kind === "advance" ? "customJersey.order.payAdvance" : "customJersey.order.payBalance", { amount: money(due.payable) })}
                </button>
                <p className="text-xs text-text-muted">
                  {t("customJersey.order.payOnline")} {due.kind === "balance" && t("customJersey.order.payCod")}
                </p>
              </>
            ) : (
              <p className="text-sm">
                <strong className="tabular-nums">{t(due.kind === "advance" ? "customJersey.order.payAdvance" : "customJersey.order.payBalance", { amount: money(due.payable) })}</strong>
                <br />
                <span className="text-text-muted">{t("customJersey.order.payOffline")}</span>
              </p>
            ))}
        </section>
      )}

      {/* Progress */}
      {stepIndex !== -1 && (
        <section className={card}>
          <h2 className={heading}>{t("customJersey.order.progress")}</h2>
          <ol className="flex flex-col gap-2.5">
            {PRODUCTION_STEPS.map((s, i) => (
              <li key={s} className="flex items-center gap-3 text-sm">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${i <= stepIndex ? "bg-emerald-600 text-white" : "bg-surface-subtle text-text-muted"}`}>
                  {i <= stepIndex ? <Check className="w-3.5 h-3.5" /> : i + 1}
                </span>
                <span className={i === stepIndex ? "font-bold" : i < stepIndex ? "" : "text-text-muted"}>{t(`customJersey.status.${s}`)}</span>
              </li>
            ))}
          </ol>
          {o.due_date && o.status !== "delivered" && (
            <p className="text-xs text-text-muted">
              {t("customJersey.order.neededBy")}: {dateText(o.due_date)}
            </p>
          )}
        </section>
      )}

      {/* Messages */}
      <section className={card}>
        <h2 className={heading}>{t("customJersey.order.messages")}</h2>
        {o.messages.length === 0 ? (
          <p className="text-sm text-text-muted">{t("customJersey.order.noMessages")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {o.messages.map((m) => (
              <li key={m.id} className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${m.author === "customer" ? "self-end bg-primary text-white" : "self-start bg-surface-subtle"}`}>
                <span className="block text-[10px] uppercase font-bold opacity-70">
                  {m.author === "customer" ? t("customJersey.order.you") : t("customJersey.order.staff")} · {dateText(m.created_at)}
                </span>
                <span className="whitespace-pre-line break-words">{m.body}</span>
              </li>
            ))}
          </ul>
        )}
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (message.trim() && (await act("comment", { body: message }))) setMessage("");
          }}
        >
          <input className="flex-1 h-10 px-3 rounded-lg border border-border-light bg-white text-sm" value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t("customJersey.order.messagePlaceholder")} maxLength={2000} aria-label={t("customJersey.order.messagePlaceholder")} />
          <button type="submit" className={ghostBtn} disabled={!message.trim() || busy !== null}>
            {t("customJersey.order.send")}
          </button>
        </form>
        {WHATSAPP && (
          <a href={`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(o.order_number)}`} target="_blank" rel="noopener noreferrer" className="self-start inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
            <MessageCircle className="w-4 h-4" /> {t("customJersey.order.whatsapp")}
          </a>
        )}
      </section>

      {/* Summary */}
      <section className={card}>
        <h2 className={heading}>{t("customJersey.order.summary")}</h2>
        <div className="grid sm:grid-cols-[160px_minmax(0,1fr)] gap-4">
          {o.source === "template" && o.design.pattern && (
            <div className="bg-surface-subtle rounded-xl p-2">
              <JerseyPreview pattern={o.design.pattern as Pattern} colors={o.design.colors ?? []} side="front" sleeve={o.sleeve} teamName={o.design.team_name} number={o.design.number} className="w-full h-auto" />
            </div>
          )}
          <dl className="text-sm grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 content-start">
            <dt className="text-text-muted">{t("customJersey.sport.label")}</dt>
            <dd>{t(`customJersey.sport.${o.sport}`)}</dd>
            <dt className="text-text-muted">{t("customJersey.order.quantity")}</dt>
            <dd className="tabular-nums">{o.quantity}</dd>
            <dt className="text-text-muted">{t("customJersey.order.fabric")}</dt>
            <dd>{o.fabric_name}</dd>
            <dt className="text-text-muted">{t("customJersey.options.label")}</dt>
            <dd>
              {[
                t(`customJersey.options.${o.sleeve}`),
                t(`customJersey.options.${o.collar}`),
                o.with_names && t("customJersey.options.names"),
                o.with_numbers && t("customJersey.options.numbers"),
                o.with_logo && t("customJersey.options.logo"),
                o.with_shorts && t("customJersey.options.shorts"),
              ]
                .filter(Boolean)
                .join(" · ")}
            </dd>
            {o.needed_by && (
              <>
                <dt className="text-text-muted">{t("customJersey.order.neededBy")}</dt>
                <dd>{dateText(o.needed_by)}</dd>
              </>
            )}
            <dt className="text-text-muted">{t("customJersey.order.delivery")}</dt>
            <dd>{o.delivery_method === "pickup" ? t("customJersey.order.pickup") : o.delivery_address}</dd>
            <dt className="text-text-muted">{t(o.final_price === null ? "customJersey.order.estimated" : "customJersey.order.finalPrice")}</dt>
            <dd className="tabular-nums font-semibold">{money(o.final_price ?? o.estimated_price)}</dd>
          </dl>
        </div>
        {o.notes && <p className="text-sm whitespace-pre-line bg-surface-subtle rounded-lg p-3">{o.notes}</p>}

        {o.files.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold mb-1">{t("customJersey.order.files")}</h3>
            <ul className="flex flex-col gap-1">
              {o.files.map((f, i) => (
                <li key={f.path}>
                  <a href={`/api/custom-jersey/file?token=${token}&i=${i}`} target="_blank" rel="noopener noreferrer" className="text-sm inline-flex items-center gap-1.5 underline underline-offset-2">
                    <Download className="w-3.5 h-3.5" /> {f.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {o.roster.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold">{t("customJersey.order.roster")}</h3>
            <SizeSummary summary={sizeSummary(o.roster)} total={o.roster.length} label={t("customJersey.roster.total")} />
            <details className="text-sm">
              <summary className="cursor-pointer text-xs text-text-muted">{t("customJersey.roster.title")}</summary>
              <table className="mt-2 w-full max-w-md text-sm">
                <tbody>
                  {o.roster.map((r, i) => (
                    <tr key={r.id} className="border-t border-border-light">
                      <td className="py-1 pr-2 text-text-muted tabular-nums">{i + 1}</td>
                      <td className="py-1 pr-2">{r.player_name}</td>
                      <td className="py-1 pr-2 tabular-nums">{r.player_number}</td>
                      <td className="py-1 pr-2">{r.size}</td>
                      <td className="py-1">{t(`customJersey.options.${r.sleeve}`)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </div>
        )}
      </section>

      {beforeApproval && (
        <button
          type="button"
          className="self-start text-xs text-text-muted underline underline-offset-2 hover:text-badge-discount"
          disabled={busy !== null}
          onClick={() => {
            if (confirm(t("customJersey.order.cancelConfirm"))) void act("cancel");
          }}
        >
          {t("customJersey.order.cancel")}
        </button>
      )}
    </div>
  );
}
