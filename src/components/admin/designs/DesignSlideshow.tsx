"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Maximize, Minimize, X } from "lucide-react";
import { useT } from "@/i18n/client";
import { designImages, type DesignRow } from "@/lib/custom-jersey/designs";

/**
 * Full-screen viewer for showing designs to a customer at the counter.
 * ←/→ (or swipe, or tap the sides) = next/previous picture, across designs.
 * ↑/↓ = jump to the previous/next design. Home/End, F = full screen, Esc = close.
 */
export function DesignSlideshow({ designs, start = 0, startImage = 0, heading, onClose }: {
  designs: DesignRow[];
  /** index into `designs` */
  start?: number;
  startImage?: number;
  heading?: string;
  onClose: () => void;
}) {
  const { t } = useT();
  const slides = useMemo(
    () => designs.flatMap((d, di) => designImages(d).map((src, ii, all) => ({ src, d, di, ii, n: all.length }))),
    [designs],
  );
  const first = Math.max(0, slides.findIndex((s) => s.di === start && s.ii === startImage));
  const [i, setI] = useState(first);
  const [full, setFull] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const touch = useRef<number | null>(null);
  const last = slides.length - 1;
  const cur = slides[Math.min(i, last)];

  const go = (k: number) => setI(() => Math.max(0, Math.min(last, k)));
  const step = (dir: 1 | -1) => setI((x) => (x + dir + slides.length) % slides.length);
  const jumpDesign = (dir: 1 | -1) => setI((x) => {
    const di = slides[x]?.di ?? 0;
    const target = dir > 0 ? slides.findIndex((s) => s.di > di) : slides.findIndex((s) => s.di === (slides.findLast((p) => p.di < di)?.di ?? -1));
    return target < 0 ? x : target;
  });

  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void box.current?.requestFullscreen?.().catch(() => {});
  };

  useEffect(() => {
    // Try real full screen straight away (the click that opened us counts as a user gesture).
    void box.current?.requestFullscreen?.().catch(() => {});
    const onFs = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      document.body.style.overflow = prevOverflow;
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") { e.preventDefault(); step(1); }
      else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); step(-1); }
      else if (e.key === "ArrowDown") { e.preventDefault(); jumpDesign(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); jumpDesign(-1); }
      else if (e.key === "Home") go(0);
      else if (e.key === "End") go(last);
      else if (e.key === "f" || e.key === "F") toggleFull();
      else if (e.key === "Escape" && !document.fullscreenElement) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Preload neighbours so the next tap is instant.
  useEffect(() => {
    for (const k of [i + 1, i - 1]) {
      const s = slides[(k + slides.length) % slides.length];
      if (s) { const img = new Image(); img.src = s.src; }
    }
  }, [i, slides]);

  if (!cur) return null;
  const title = cur.d.title || cur.d.caption || "";
  const designCount = designs.length;

  return (
    <div
      ref={box}
      role="dialog"
      aria-modal="true"
      aria-label={heading || t("shop.designs.showFullscreen")}
      className="fixed inset-0 z-[80] bg-black text-white flex flex-col select-none"
      onTouchStart={(e) => { touch.current = e.touches[0]?.clientX ?? null; }}
      onTouchEnd={(e) => {
        const x0 = touch.current; touch.current = null;
        const x1 = e.changedTouches[0]?.clientX;
        if (x0 == null || x1 == null || Math.abs(x1 - x0) < 40) return;
        step(x1 < x0 ? 1 : -1);
      }}
    >
      <div className="flex items-center gap-3 px-4 py-2 bg-gradient-to-b from-black/80 to-transparent absolute inset-x-0 top-0 z-10">
        <div className="min-w-0 flex-1">
          {heading && <p className="text-xs uppercase tracking-wide text-white/60 truncate">{heading}</p>}
          <p className="text-lg font-semibold truncate">{title || " "}</p>
        </div>
        <span className="text-sm tabular-nums text-white/80 whitespace-nowrap">
          {t("shop.designs.slideCount", { n: cur.di + 1, of: designCount })}
          {cur.n > 1 && <span className="text-white/50"> · {cur.ii + 1}/{cur.n}</span>}
        </span>
        <button type="button" onClick={toggleFull} aria-label={t("shop.designs.showFullscreen")} className="w-10 h-10 rounded-full hover:bg-white/15 flex items-center justify-center">
          {full ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
        </button>
        <button type="button" onClick={onClose} aria-label="Close" className="w-10 h-10 rounded-full hover:bg-white/15 flex items-center justify-center"><X className="w-6 h-6" /></button>
      </div>

      <div className="relative flex-1 min-h-0 flex items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={cur.src} src={cur.src} alt={title} className="max-w-full max-h-full object-contain" draggable={false} />
        {slides.length > 1 && (
          <>
            <button type="button" onClick={() => step(-1)} aria-label={t("shop.designs.prev")} className="absolute left-0 inset-y-0 w-1/4 sm:w-24 flex items-center justify-start pl-2 sm:pl-4 group">
              <span className="w-12 h-12 rounded-full bg-white/10 group-hover:bg-white/25 flex items-center justify-center"><ChevronLeft className="w-7 h-7" /></span>
            </button>
            <button type="button" onClick={() => step(1)} aria-label={t("shop.designs.next")} className="absolute right-0 inset-y-0 w-1/4 sm:w-24 flex items-center justify-end pr-2 sm:pr-4 group">
              <span className="w-12 h-12 rounded-full bg-white/10 group-hover:bg-white/25 flex items-center justify-center"><ChevronRight className="w-7 h-7" /></span>
            </button>
          </>
        )}
      </div>

      {slides.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto px-4 py-2 bg-black/80 justify-start sm:justify-center">
          {slides.map((s, k) => (
            <button
              key={`${s.d.id}-${s.ii}`}
              type="button"
              onClick={() => go(k)}
              ref={k === i ? (el) => el?.scrollIntoView({ block: "nearest", inline: "center" }) : undefined}
              className={`shrink-0 w-14 h-14 rounded overflow-hidden border-2 ${k === i ? "border-accent-gold" : s.di === cur.di ? "border-white/40" : "border-transparent opacity-60 hover:opacity-100"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.src} alt="" loading="lazy" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
