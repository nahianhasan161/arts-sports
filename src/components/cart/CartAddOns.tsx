"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { useCartStore } from "@/lib/store/cart-store";
import { useT } from "@/i18n/client";
import { formatMoney } from "@/i18n";
import { thumbUrl } from "@/lib/media/thumb";
import type { Product } from "@/types";

/** Cheap extras worth adding (socks, grip, a ball) under the cart lines. */
const MAX_PRICE = 600;
let cache: Product[] | null = null;

export function CartAddOns() {
  const { t, locale } = useT();
  const { items, addItem, closeCart } = useCartStore();
  const [list, setList] = useState<Product[]>(cache ?? []);

  useEffect(() => {
    if (cache) return;
    fetch(`/api/shop/products?price_max=${MAX_PRICE}&stock=in&sort=popular&limit=12`)
      .then((r) => (r.ok ? r.json() : { products: [] }))
      .then((d: { products: Product[] }) => {
        cache = d.products ?? [];
        setList(cache);
      })
      .catch(() => {});
  }, []);

  const inCart = new Set(items.map((i) => i.productId));
  const shown = list.filter((p) => !inCart.has(p.id)).slice(0, 3);
  if (shown.length === 0) return null;

  return (
    <div className="mt-2 rounded-xl border border-dashed border-border-light p-3">
      <p className="text-xs font-bold text-on-surface mb-2">{t("buy.cart.addOns")}</p>
      <ul className="flex flex-col gap-2">
        {shown.map((p) => {
          // One tap only when there is nothing to choose; otherwise the product page.
          const simple = (p.sizes?.length ?? 0) === 0 && (p.colors?.length ?? 0) <= 1;
          const name = (locale === "bn" && (p as { title_bn?: string | null }).title_bn) || p.title;
          return (
            <li key={p.id} className="flex items-center gap-3">
              <span className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-surface-container">
                {p.images?.[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumbUrl(p.images[0])}
                    onError={(e) => {
                      if (p.images[0] && !e.currentTarget.src.endsWith(p.images[0])) e.currentTarget.src = p.images[0];
                    }}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : null}
              </span>
              <span className="min-w-0 flex-1">
                <Link href={`/products/${p.slug}`} onClick={closeCart} className="block truncate text-xs font-semibold text-on-surface hover:underline">
                  {name}
                </Link>
                <span className="text-xs font-bold text-primary">{formatMoney(p.price, locale)}</span>
              </span>
              {simple ? (
                <button
                  type="button"
                  onClick={() => addItem(p, "", p.colors?.[0]?.name || "Default", 1)}
                  className="inline-flex h-8 items-center gap-1 rounded-full border border-primary px-3 text-xs font-bold text-primary hover:bg-primary hover:text-primary-foreground"
                  aria-label={t("buy.cart.addOne", { name })}
                >
                  <Plus className="w-3.5 h-3.5" /> {t("buy.cart.add")}
                </button>
              ) : (
                <Link
                  href={`/products/${p.slug}`}
                  onClick={closeCart}
                  className="inline-flex h-8 items-center rounded-full border border-border-light px-3 text-xs font-bold text-on-surface hover:bg-surface-container"
                >
                  {t("buy.cart.choose")}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
