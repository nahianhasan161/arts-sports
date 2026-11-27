"use client";

import { useEffect, useState } from "react";
import { ProductCard } from "@/components/product/ProductCard";
import { useT } from "@/i18n/client";
import type { Product } from "@/types";

/** Products shown under the one being looked at, and the ones this shopper opened before. */
export function RelatedProducts({ current, related }: { current: Product; related: Product[] }) {
  const { t } = useT();
  const recent = useRecentlyViewed(current);

  return (
    <>
      {related.length > 0 && (
        <Row title={t("store.pdp.related.title")} eyebrow={t("store.pdp.related.eyebrow")} products={related} />
      )}
      {recent.length > 0 && <Row title={t("store.pdp.recent.title")} eyebrow={t("store.pdp.recent.eyebrow")} products={recent} />}
    </>
  );
}

function Row({ title, eyebrow, products }: { title: string; eyebrow: string; products: Product[] }) {
  return (
    <section className="max-w-container-max mx-auto px-space-base pt-space-xl pb-space-base w-full">
      <p className="text-gold-ink font-display text-xs tracking-widest uppercase font-bold mb-1">{eyebrow}</p>
      <h2 className="font-display text-2xl sm:text-3xl font-bold text-on-surface mb-4">{title}</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-7 sm:gap-x-5">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} aspectRatio="square" />
        ))}
      </div>
    </section>
  );
}

const KEY = "as-recent";
const MAX = 8;

/**
 * The last products this browser opened (newest first, without this one).
 * Kept in localStorage as small card rows, so no request is needed.
 */
function useRecentlyViewed(current: Product): Product[] {
  const [list, setList] = useState<Product[]>([]);
  useEffect(() => {
    let saved: Product[] = [];
    try {
      saved = JSON.parse(localStorage.getItem(KEY) ?? "[]");
      if (!Array.isArray(saved)) saved = [];
    } catch {
      saved = [];
    }
    const others = saved.filter((p) => p && p.id && p.id !== current.id);
    const slim: Product = { ...current, description: "", description_bn: null, short_description: null, specs: undefined, cost_price: undefined };
    try {
      localStorage.setItem(KEY, JSON.stringify([slim, ...others].slice(0, MAX + 1)));
    } catch {
      // Storage full or blocked: the row is a nicety.
    }
    // Shown after mount only, so the server HTML and the first render agree.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setList(others.slice(0, 4));
  }, [current]);
  return list;
}
