"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ProductCard } from "@/components/product/ProductCard";
import { ProductGridSkeleton } from "./Skeletons";
import { useT } from "@/i18n/client";
import type { Product } from "@/types";

/**
 * Product grid that renders the server's first batch and fetches the next
 * one when the shopper scrolls near the bottom. `queryString` is the current
 * filter set; when it changes the parent remounts this (via `key`).
 */
export function InfiniteProductGrid({
  initial,
  total,
  queryString,
  pageSize,
  onCount,
}: {
  initial: Product[];
  total: number;
  queryString: string;
  pageSize: number;
  onCount?: (shown: number) => void;
}) {
  const { t } = useT();
  const [items, setItems] = useState(initial);
  const [hasMore, setHasMore] = useState(initial.length < total && initial.length >= pageSize);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const busy = useRef(false);

  const loadMore = useCallback(async () => {
    if (busy.current || !hasMore) return;
    busy.current = true;
    setLoading(true);
    setFailed(false);
    try {
      const qs = new URLSearchParams(queryString);
      qs.set("offset", String(items.length));
      qs.set("limit", String(pageSize));
      const res = await fetch(`/api/shop/products?${qs}`);
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as { products: Product[]; hasMore: boolean };
      setItems((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...json.products.filter((p) => !seen.has(p.id))];
      });
      setHasMore(json.hasMore);
    } catch {
      setFailed(true);
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, [hasMore, items.length, pageSize, queryString]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore || failed) return;
    const io = new IntersectionObserver((e) => e[0]?.isIntersecting && loadMore(), {
      rootMargin: "0px 0px 600px 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, failed, loadMore]);

  useEffect(() => onCount?.(items.length), [items.length, onCount]);

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-x-3 gap-y-7 sm:gap-x-5 sm:gap-y-9 pt-4">
        {items.map((product, i) => (
          <ProductCard key={product.id} product={product} eager={i < 4} />
        ))}
        {loading && <ProductGridSkeleton count={4} />}
      </div>
      {failed && (
        <div className="text-center pt-6">
          <button
            onClick={loadMore}
            className="sp-btn sp-whistle py-2 text-xs font-bold uppercase"
          >
            {t("store.shop.ui.retry")}
          </button>
        </div>
      )}
      {hasMore && <div ref={sentinel} className="h-px" />}
      {!hasMore && items.length > pageSize && (
        <p className="text-center text-xs text-text-muted pt-6">{t("store.shop.ui.end")}</p>
      )}
    </>
  );
}
