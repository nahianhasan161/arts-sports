"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { ImageIcon, LayoutGrid, List } from "lucide-react";
import { useT } from "@/i18n/client";
import { thumbUrl } from "@/lib/media/thumb";

export type ListView = "list" | "cards";
export const LIST_VIEWS: ListView[] = ["list", "cards"];

/** "List | Cards" switch for admin lists. */
export function ViewToggle({ value, onChange }: { value: ListView; onChange: (v: ListView) => void }) {
  const { t } = useT();
  const item = (v: ListView, Icon: typeof List, label: string) => (
    <button
      type="button"
      onClick={() => onChange(v)}
      aria-pressed={value === v}
      title={label}
      className={`h-9 px-2.5 inline-flex items-center gap-1.5 text-xs font-semibold ${value === v ? "bg-primary/10 text-on-surface" : "text-text-muted hover:bg-surface-subtle"}`}
    >
      <Icon className="w-4 h-4" /> <span className="hidden sm:inline">{label}</span>
    </button>
  );
  return (
    <div className="inline-flex rounded-lg border border-border-light bg-surface-card overflow-hidden divide-x divide-border-light">
      {item("list", List, t("shop.common.viewList"))}
      {item("cards", LayoutGrid, t("shop.common.viewCards"))}
    </div>
  );
}

/** Whole days between a date and now ("today" = 0), in Dhaka days. */
export function daysSince(iso: string, now = Date.now()): number {
  const day = (ms: number) => Math.floor((ms + 6 * 3_600_000) / 86_400_000);
  return Math.max(0, day(now) - day(Date.parse(iso)));
}

/** "3 days ago" (in the reader's language) with the date in small text underneath. */
export function UpdatedAgo({ at, inline }: { at: string | null | undefined; inline?: boolean }) {
  const { locale } = useT();
  if (!at || Number.isNaN(Date.parse(at))) return <span className="text-text-muted">—</span>;
  const lang = locale === "bn" ? "bn-BD" : "en-GB";
  const days = daysSince(at);
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
  const ago =
    days < 45 ? rtf.format(-days, "day") : days < 365 ? rtf.format(-Math.round(days / 30), "month") : rtf.format(-Math.round(days / 365), "year");
  const date = new Date(at).toLocaleDateString(lang, { day: "numeric", month: "short", year: "numeric" });
  return inline ? (
    <span title={new Date(at).toLocaleString(lang)}>
      {ago} <span className="text-[11px] text-text-muted">· {date}</span>
    </span>
  ) : (
    <span className="inline-flex flex-col leading-tight" title={new Date(at).toLocaleString(lang)}>
      <span className="text-on-surface">{ago}</span>
      <span className="text-[11px] text-text-muted">{date}</span>
    </span>
  );
}

/** A product picture: the small thumbnail when there is one, else the full image, else a placeholder. */
export function Thumb({ src, className = "" }: { src: string | null | undefined; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src) {
    return (
      <span className={`flex items-center justify-center bg-surface-subtle ${className}`}>
        <ImageIcon className="w-5 h-5 text-text-muted" />
      </span>
    );
  }
  return <img src={failed ? src : thumbUrl(src)} alt="" loading="lazy" onError={() => setFailed(true)} className={`object-cover bg-surface-subtle ${className}`} />;
}
