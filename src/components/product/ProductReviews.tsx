"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BadgeCheck, Camera, MessageCircleQuestion, Star } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useT } from "@/i18n/client";
import { useAuth } from "@/components/auth/AuthProvider";
import type { PublicQuestion, PublicReview, RatingSummary } from "@/lib/services/catalog";

function Stars({ value, size = "w-4 h-4" }: { value: number; size?: string }) {
  const { t } = useT();
  return (
    <span className="inline-flex" role="img" aria-label={t("store.reviews.outOf", { value })}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`${size} ${n <= Math.round(value) ? "fill-accent-gold text-gold-ink" : "text-border-light"}`} />
      ))}
    </span>
  );
}

/**
 * Reviews and questions for a product page. The list is real approved
 * reviews only. Only someone with a delivered order sees the review form;
 * anyone signed in can ask a question. New text waits for staff approval.
 */
export function ProductReviews({
  productId,
  summary,
  reviews,
  questions,
}: {
  productId: string;
  summary: RatingSummary;
  reviews: PublicReview[];
  questions: PublicQuestion[];
}) {
  const pathname = usePathname();
  const { user } = useAuth();
  const { t, locale } = useT();
  const num = (n: number) => new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-IN").format(n);
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(locale === "bn" ? "bn-BD" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
  const [verifiedFor, setVerifiedFor] = useState<string | null>(null);
  const [existing, setExisting] = useState<{ status: string } | null>(null);

  // Tied to the signed-in user, so signing out hides the form.
  const canReview = Boolean(user && verifiedFor === user.id);

  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [reviewMsg, setReviewMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [sending, setSending] = useState(false);

  const [question, setQuestion] = useState("");
  const [qMsg, setQMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !user) return;
    let alive = true;
    Promise.resolve(supabase.rpc("my_review_state", { p_product_id: productId })).then(({ data, error }) => {
      if (!alive || error || !data) return;
      const state = data as { can_review: boolean; review: { status: string } | null };
      setVerifiedFor(state.can_review ? user.id : null);
      setExisting(state.review);
    });
    return () => {
      alive = false;
    };
  }, [productId, user]);

  async function uploadPhoto(file: File) {
    setUploading(true);
    setReviewMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/reviews/photo", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? t("store.reviews.uploadFailed"));
      setPhotos((p) => [...p, json.url].slice(0, 4));
    } catch (e) {
      setReviewMsg({ ok: false, text: e instanceof Error ? e.message : t("store.reviews.uploadFailed") });
    } finally {
      setUploading(false);
    }
  }

  async function submitReview(e: React.FormEvent) {
    e.preventDefault();
    if (rating < 1) return setReviewMsg({ ok: false, text: t("store.reviews.chooseStars") });
    setSending(true);
    setReviewMsg(null);
    const res = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: productId, rating, title, body, photos }),
    });
    const json = await res.json().catch(() => ({}));
    setSending(false);
    if (res.ok) {
      setReviewMsg({ ok: true, text: json.message });
      setExisting({ status: "pending" });
    } else setReviewMsg({ ok: false, text: json.error ?? t("store.reviews.failed") });
  }

  async function submitQuestion(e: React.FormEvent) {
    e.preventDefault();
    setQMsg(null);
    const res = await fetch("/api/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: productId, question }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      setQMsg({ ok: true, text: json.message });
      setQuestion("");
    } else setQMsg({ ok: false, text: json.error ?? t("store.reviews.askFailed") });
  }

  const input = "w-full px-3 py-2 text-sm bg-surface-subtle rounded-lg border border-border-light focus:outline-none focus:ring-1 focus:ring-primary";
  const signInHref = `/sign-in?next=${encodeURIComponent(pathname)}`;

  return (
    <section id="reviews" className="max-w-container-max mx-auto px-space-base py-space-xl grid gap-space-xl lg:grid-cols-2">
      {/* Reviews */}
      <div>
        <h2 className="font-display text-lg uppercase font-bold text-primary mb-3">{t("store.reviews.title")}</h2>
        {summary.count > 0 && summary.average !== null ? (
          <div className="flex items-start gap-4 mb-4">
            <div className="text-center">
              <p className="font-display text-4xl font-bold text-primary leading-none">{num(summary.average)}</p>
              <Stars value={summary.average} />
              <p className="text-xs text-text-muted mt-1">{summary.count === 1 ? t("store.reviews.one") : t("store.reviews.count", { count: num(summary.count) })}</p>
            </div>
            <div className="flex-1 space-y-1">
              {([5, 4, 3, 2, 1] as const).map((n) => (
                <div key={n} className="flex items-center gap-2 text-xs">
                  <span className="w-3 text-text-muted">{n}</span>
                  <div className="flex-1 h-1.5 bg-surface-subtle rounded">
                    <div className="h-full bg-accent-gold rounded" style={{ width: `${(summary.stars[String(n) as "1"] / summary.count) * 100}%` }} />
                  </div>
                  <span className="w-5 text-right text-text-muted">{summary.stars[String(n) as "1"]}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-text-muted mb-4">{t("store.reviews.none")}</p>
        )}

        <ul className="space-y-4">
          {reviews.map((r) => (
            <li key={r.id} className="border-b border-border-light pb-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Stars value={r.rating} size="w-3.5 h-3.5" />
                <span className="text-sm font-semibold text-primary">{r.author_name}</span>
                {r.verified && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-600/10 px-1.5 py-0.5 rounded">
                    <BadgeCheck className="w-3 h-3" /> {t("store.reviews.verified")}
                  </span>
                )}
                <span className="text-xs text-text-muted ml-auto">{fmtDate(r.created_at)}</span>
              </div>
              {r.title && <p className="text-sm font-semibold mt-1">{r.title}</p>}
              <p className="text-sm text-on-surface mt-1 whitespace-pre-line">{r.body}</p>
              {r.photos.length > 0 && (
                <div className="flex gap-2 mt-2 flex-wrap">
                  {r.photos.map((url) => (
                    <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={t("store.reviews.photo")} loading="lazy" className="w-16 h-16 object-cover rounded border border-border-light" />
                    </a>
                  ))}
                </div>
              )}
              {r.staff_reply && (
                <p className="text-xs bg-surface-subtle rounded p-2 mt-2">
                  <strong className="text-primary">Arts Sports:</strong> {r.staff_reply}
                </p>
              )}
            </li>
          ))}
        </ul>

        {/* Write a review: shown only to verified buyers */}
        {canReview && (
          <form onSubmit={submitReview} className="mt-5 bg-surface-subtle rounded-xl p-4 space-y-3 border border-border-light">
            <h3 className="font-display text-sm uppercase font-bold text-primary">
              {existing ? t("store.reviews.update") : t("store.reviews.write")}
            </h3>
            {existing?.status === "pending" && <p className="text-xs text-text-muted">{t("store.reviews.waiting")}</p>}
            <div className="flex gap-1" role="radiogroup" aria-label={t("store.reviews.rating")}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" onClick={() => setRating(n)} aria-label={t("store.reviews.star", { n: num(n) })} aria-checked={rating === n} role="radio" className="w-11 h-11 flex items-center justify-center">
                  <Star className={`w-7 h-7 ${n <= rating ? "fill-accent-gold text-gold-ink" : "text-border-light"}`} />
                </button>
              ))}
            </div>
            <input className={input} placeholder={t("store.reviews.titleField")} aria-label={t("store.reviews.titleField")} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
            <textarea className={input} rows={4} placeholder={t("store.reviews.bodyField")} aria-label={t("store.reviews.bodyField")} required minLength={3} maxLength={3000} value={body} onChange={(e) => setBody(e.target.value)} />
            <div className="flex items-center gap-2 flex-wrap">
              {photos.map((url) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={url} src={url} alt="" className="w-14 h-14 object-cover rounded border border-border-light" />
              ))}
              {photos.length < 4 && (
                <label className="sp-btn sp-racket inline-flex items-center gap-1.5 text-xs font-semibold py-3 cursor-pointer">
                  <Camera className="w-4 h-4" /> {t(uploading ? "store.reviews.uploading" : "store.reviews.addPhoto")}
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={uploading}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadPhoto(f); e.target.value = ""; }} />
                </label>
              )}
            </div>
            {reviewMsg && <p className={`text-xs ${reviewMsg.ok ? "text-emerald-700 dark:text-emerald-400" : "text-badge-discount"}`}>{reviewMsg.text}</p>}
            <button type="submit" disabled={sending} className="sp-btn sp-medal min-h-11 font-display text-xs uppercase font-bold">
              {t(sending ? "store.reviews.sending" : "store.reviews.submit")}
            </button>
          </form>
        )}
      </div>

      {/* Questions */}
      <div>
        <h2 className="font-display text-lg uppercase font-bold text-primary mb-3 flex items-center gap-2">
          <MessageCircleQuestion className="w-5 h-5" /> {t("store.reviews.qaTitle")}
        </h2>
        {questions.length === 0 && <p className="text-sm text-text-muted mb-4">{t("store.reviews.noQuestions")}</p>}
        <ul className="space-y-3 mb-4">
          {questions.map((q) => (
            <li key={q.id} className="text-sm border-b border-border-light pb-3">
              <p className="font-semibold text-primary">Q: {q.question}</p>
              <p className="mt-1 text-on-surface">A: {q.answer}</p>
              <p className="text-xs text-text-muted mt-1">{q.author_name} · {fmtDate(q.created_at)}</p>
            </li>
          ))}
        </ul>
        {user ? (
          <form onSubmit={submitQuestion} className="space-y-2">
            <textarea className={input} rows={3} required minLength={3} maxLength={1000} placeholder={t("store.reviews.askField")} aria-label={t("store.reviews.askField")} value={question} onChange={(e) => setQuestion(e.target.value)} />
            {qMsg && <p className={`text-xs ${qMsg.ok ? "text-emerald-700 dark:text-emerald-400" : "text-badge-discount"}`}>{qMsg.text}</p>}
            <button type="submit" className="sp-btn sp-shuttle min-h-11 font-display text-xs uppercase font-bold">{t("store.reviews.ask")}</button>
          </form>
        ) : (
          <p className="text-sm text-text-muted">
            <Link href={signInHref} className="text-primary underline font-semibold">{t("store.reviews.signIn")}</Link> {t("store.reviews.signInText")}
          </p>
        )}
      </div>
    </section>
  );
}
