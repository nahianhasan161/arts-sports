"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useT } from "@/i18n/client";

/**
 * The header's category row. Its scrollbar is hidden, so a small round arrow
 * appears at whichever edge has more items; a click moves the row that way.
 */
export function NavScroller({ children }: { children: React.ReactNode }) {
  const { t } = useT();
  const viewRef = useRef<HTMLElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    const view = viewRef.current;
    const row = rowRef.current;
    if (!view || !row) return;
    const update = () => {
      const left = view.scrollLeft > 2;
      const right = view.scrollLeft + view.clientWidth < view.scrollWidth - 2;
      setEdges((e) => (e.left === left && e.right === right ? e : { left, right }));
    };
    update();
    view.addEventListener("scroll", update, { passive: true });
    // The row is watched too: its items load later and change with the language.
    const ro = new ResizeObserver(update);
    ro.observe(view);
    ro.observe(row);
    return () => {
      view.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);

  const step = (dir: 1 | -1) => {
    const view = viewRef.current;
    if (!view) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    view.scrollBy({ left: dir * view.clientWidth * 0.6, behavior: still ? "auto" : "smooth" });
  };

  // The fade lets clicks through; only the round button takes them.
  const fade = "absolute inset-y-0 z-20 flex items-center pointer-events-none from-surface-card from-60% to-transparent";
  const button = "sp-ico sp-tennis sp-sm pointer-events-auto";

  return (
    <div className="relative min-w-0 flex-1">
      {/* Reaches over the 6px touchline below the bar, where the ball rolls. */}
      <nav ref={viewRef} className="relative z-10 -mb-1.5 overflow-x-auto no-scrollbar scroll-px-12">
        <div ref={rowRef} className="w-max">
          {children}
        </div>
      </nav>
      {edges.left && (
        <div className={`${fade} left-0 pr-6 bg-gradient-to-r`}>
          <button type="button" onClick={() => step(-1)} aria-label={t("site.header.scrollLeft")} className={button}>
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>
      )}
      {edges.right && (
        <div className={`${fade} right-0 pl-6 bg-gradient-to-l`}>
          <button type="button" onClick={() => step(1)} aria-label={t("site.header.scrollRight")} className={button}>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
