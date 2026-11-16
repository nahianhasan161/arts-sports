"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ChipSkeletons } from "./Skeletons";

type Cat = { id: string; slug: string; name: string };

/**
 * Horizontally scrolling category chips. The first page comes from the
 * server; the rest load when the shopper scrolls near the right edge.
 */
export function CategoryStrip({
  initial,
  initialHasMore,
  active,
  onSelect,
  pageSize = 10,
}: {
  initial: Cat[];
  initialHasMore: boolean;
  active: string;
  onSelect: (slug: string) => void;
  pageSize?: number;
}) {
  const [items, setItems] = useState(initial);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const busy = useRef(false);

  const loadMore = useCallback(async () => {
    if (busy.current || !hasMore) return;
    busy.current = true;
    setLoading(true);
    try {
      const res = await fetch(`/api/shop/categories?offset=${items.length}&limit=${pageSize}`);
      const json = (await res.json()) as { items: Cat[]; hasMore: boolean };
      setItems((prev) => {
        const seen = new Set(prev.map((c) => c.id));
        return [...prev, ...json.items.filter((c) => !seen.has(c.id))];
      });
      setHasMore(json.hasMore);
    } catch {
      setHasMore(false);
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, [hasMore, items.length, pageSize]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver(
      (entries) => entries[0]?.isIntersecting && loadMore(),
      { root: scroller.current, rootMargin: "0px 200px 0px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadMore]);

  const nudge = (dir: 1 | -1) =>
    scroller.current?.scrollBy({ left: dir * scroller.current.clientWidth * 0.8, behavior: "smooth" });

  const chip = (slug: string, label: string) => (
    <button
      key={slug}
      onClick={() => onSelect(slug)}
      aria-pressed={active === slug}
      className={`px-3.5 py-1.5 rounded text-xs font-display uppercase tracking-wider font-semibold whitespace-nowrap shrink-0 transition-colors border ${
        active === slug
          ? "bg-primary text-primary-foreground border-primary shadow-sm"
          : "bg-surface-subtle hover:bg-surface-container text-on-surface border-border-light"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="relative flex items-center gap-1 pt-2">
      <button
        onClick={() => nudge(-1)}
        aria-label="Scroll left"
        className="hidden md:flex shrink-0 w-7 h-7 items-center justify-center rounded-full border border-border-light bg-surface-card hover:bg-surface-subtle"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <div
        ref={scroller}
        className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth snap-x py-1 flex-1 min-w-0"
      >
        {chip("all", "All")}
        {items.map((c) => chip(c.slug, c.name))}
        {loading && <ChipSkeletons count={3} />}
        {hasMore && <div ref={sentinel} className="w-px h-6 shrink-0" />}
      </div>
      <button
        onClick={() => nudge(1)}
        aria-label="Scroll right"
        className="hidden md:flex shrink-0 w-7 h-7 items-center justify-center rounded-full border border-border-light bg-surface-card hover:bg-surface-subtle"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
