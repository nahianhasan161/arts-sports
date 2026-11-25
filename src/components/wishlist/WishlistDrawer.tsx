"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { X, Trash2, Heart, ShoppingBag } from "lucide-react";
import { useWishlistStore } from "@/lib/store/wishlist-store";
import { useCartStore } from "@/lib/store/cart-store";
import { useT } from "@/i18n/client";
import { formatMoney } from "@/i18n";

export function WishlistDrawer() {
  const { t, locale } = useT();
  const taka = (n: number) => formatMoney(n, locale);
  const num = (n: number) => new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-IN").format(n);
  const name = (p: { title: string; title_bn?: string | null }) => (locale === "bn" && p.title_bn) || p.title;
  const [mounted, setMounted] = useState(false);
  const {
    items,
    isOpen,
    closeWishlist,
    removeItem,
    getCount,
  } = useWishlistStore();
  const { addItem: addToCart } = useCartStore();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const wishlistCount = getCount();

  const handleAddToCart = (product: typeof items[0]) => {
    const defaultSize = product.sizes.find((s) => s.stock > 0)?.size || product.sizes[0]?.size || "M";
    const defaultColor = product.colors[0]?.name || "Default";
    addToCart(product, defaultSize, defaultColor, 1);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] overflow-hidden" role="dialog" aria-modal="true" aria-label={t("buy.wishlist.title")}>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300"
        onClick={closeWishlist}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10 max-sm:pl-0">
        <div className="w-screen max-w-md bg-surface-card shadow-2xl flex flex-col">
          {/* 1. Header */}
          <div className="px-space-base py-space-md border-b border-border-light flex items-center justify-between bg-surface-subtle">
            <div className="flex items-center gap-2">
              <Heart className="w-5 h-5 text-badge-discount" />
              <h2 className="font-display uppercase tracking-wider text-base font-bold text-primary">
                {t("buy.wishlist.title")} ({num(wishlistCount)})
              </h2>
            </div>
            <button
              onClick={closeWishlist}
              className="sp-ico sp-red sp-lg"
              aria-label={t("buy.wishlist.close")}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* 2. Items List */}
          <div className="flex-1 overflow-y-auto px-space-base py-space-md divide-y divide-border-light">
            {items.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-text-muted">
                <div className="w-16 h-16 rounded-full bg-surface-subtle flex items-center justify-center mb-4 text-text-muted">
                  <Heart className="w-8 h-8 opacity-40" />
                </div>
                <h3 className="font-display uppercase tracking-wider text-base font-bold text-primary mb-1">
                  {t("buy.wishlist.empty")}
                </h3>
                <p className="text-xs text-text-muted mb-6 max-w-xs">
                  {t("buy.wishlist.emptyText")}
                </p>
                <Link
                  href="/shop"
                  onClick={closeWishlist}
                  className="sp-btn sp-medal py-3 font-display uppercase tracking-wider text-xs font-semibold"
                >
                  {t("buy.cart.shop")}
                </Link>
              </div>
            ) : (
              items.map((product) => (
                <div key={product.id} className="py-4 flex gap-3">
                  {/* Thumbnail */}
                  <Link
                    href={`/products/${product.slug}`}
                    onClick={closeWishlist}
                    className="relative w-20 h-24 bg-surface-subtle rounded-lg overflow-hidden shrink-0 border border-border-light block"
                  >
                    <Image
                      src={product.images[0]}
                      alt=""
                      fill
                      sizes="80px"
                      className="object-cover"
                    />
                  </Link>

                  {/* Details */}
                  <div className="flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          href={`/products/${product.slug}`}
                          onClick={closeWishlist}
                          className="font-body text-sm font-semibold text-on-surface hover:text-primary transition-colors line-clamp-2"
                        >
                          {name(product)}
                        </Link>
                        <button
                          onClick={() => removeItem(product.id)}
                          className="sp-ico sp-yellow sp-lg shrink-0"
                          aria-label={t("buy.wishlist.remove", { name: name(product) })}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="flex items-center gap-2 mt-1 text-xs text-text-muted">
                        <span className="text-xs uppercase tracking-wider">
                          {product.sub_category || product.category}
                        </span>
                        {product.stock > 0 ? (
                          <span className="text-emerald-700 dark:text-emerald-400 font-semibold text-xs">{t("buy.wishlist.inStock")}</span>
                        ) : (
                          <span className="text-badge-discount font-semibold text-xs">{t("buy.wishlist.soldOut")}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-3">
                      {/* Price */}
                      <div>
                        <span className="font-bold text-sm text-primary">
                          {taka(product.price)}
                        </span>
                        {product.original_price > product.price && (
                          <span className="ml-1.5 text-xs text-text-muted line-through">
                            {taka(product.original_price)}
                          </span>
                        )}
                      </div>

                      {/* Add to Cart Button */}
                      <button
                        onClick={() => handleAddToCart(product)}
                        disabled={product.stock === 0}
                        className="sp-btn sp-basket flex items-center gap-1 min-h-11 text-xs font-bold uppercase tracking-wider"
                      >
                        <ShoppingBag className="w-3 h-3" />
                        {t("buy.wishlist.add")}
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* 3. Footer */}
          {items.length > 0 && (
            <div className="p-space-base bg-surface-subtle border-t border-border-light flex flex-col gap-3">
              <p className="text-xs text-center text-text-muted">
                {t("buy.wishlist.saved", { count: num(wishlistCount) })}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
