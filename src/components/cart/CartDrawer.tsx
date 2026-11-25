"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import { Ball } from "@/components/football/Ball";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X, Trash2, Plus, Minus, ShoppingBag, ArrowRight, Truck } from "lucide-react";
import { useCartStore } from "@/lib/store/cart-store";
import { useCheckoutSettings } from "@/lib/checkout-settings";
import { useT } from "@/i18n/client";
import { formatMoney } from "@/i18n";
import { RETURN_DAYS } from "@/lib/nav";

export function CartDrawer() {
  const router = useRouter();
  const { t, locale } = useT();
  const taka = (n: number) => formatMoney(n, locale);
  const num = (n: number) => new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-IN").format(n);
  const [mounted, setMounted] = useState(false);
  const { 
    items, 
    isOpen, 
    closeCart, 
    updateQuantity, 
    removeItem, 
    getSubtotal, 
    getTotalCount 
  } = useCartStore();

  const settings = useCheckoutSettings();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const subtotal = getSubtotal();
  const totalCount = getTotalCount();
  const freeShippingThreshold = settings.free_delivery_over;
  const progress = Math.min(100, Math.round((subtotal / freeShippingThreshold) * 100));
  const remainingForFree = Math.max(0, freeShippingThreshold - subtotal);
  const shippingFee = subtotal >= freeShippingThreshold || subtotal === 0 ? 0 : settings.delivery_fee_dhaka;
  const grandTotal = subtotal + shippingFee;

  const handleProceedCheckout = () => {
    closeCart();
    router.push("/checkout");
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] overflow-hidden" role="dialog" aria-modal="true" aria-label={t("buy.cart.title")}>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300"
        onClick={closeCart}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10 max-sm:pl-0">
        <div className="w-screen max-w-md bg-surface-card shadow-2xl flex flex-col">
          {/* 1. Header */}
          <div className="px-space-base py-space-md border-b border-border-light flex items-center justify-between bg-surface-subtle">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-primary" />
              <h2 className="font-display uppercase tracking-wider text-base font-bold text-primary">
                {t("buy.cart.title")} ({num(totalCount)})
              </h2>
            </div>
            <button
              onClick={closeCart}
              className="sp-ico sp-red sp-lg"
              aria-label={t("buy.cart.close")}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* 2. Free Shipping Progress Meter */}
          <div className="px-space-base py-3 bg-accent-gold-soft border-b border-accent-gold/20">
            <div className="flex items-center gap-2 text-xs font-semibold text-primary mb-1.5">
              <Truck className="w-4 h-4 text-gold-ink shrink-0" />
              {remainingForFree > 0 ? (
                <span>{t("buy.cart.freeLeft", { amount: taka(remainingForFree) })}</span>
              ) : (
                <span className="text-emerald-700 dark:text-emerald-400 font-bold">{t("buy.cart.freeDone")}</span>
              )}
            </div>
            <div className="relative w-full bg-surface-card h-2 rounded-full border border-accent-gold/20">
              <div
                className="bg-accent-gold h-full rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
              {/* The ball rolls to the end as the bag fills up. */}
              <Ball className="absolute top-1/2 w-4 h-4 -translate-x-1/2 -translate-y-1/2 transition-all duration-500" style={{ left: `clamp(8px, ${progress}%, calc(100% - 8px))`, rotate: `${progress * 7}deg` }} />
            </div>
          </div>

          {/* 3. Items List */}
          <div className="flex-1 overflow-y-auto px-space-base py-space-md divide-y divide-border-light">
            {items.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-text-muted">
                <div className="w-16 h-16 rounded-full bg-surface-subtle flex items-center justify-center mb-4 text-text-muted">
                  <ShoppingBag className="w-8 h-8 opacity-40" />
                </div>
                <h3 className="font-display uppercase tracking-wider text-base font-bold text-primary mb-1">
                  {t("buy.cart.empty")}
                </h3>
                <p className="text-xs text-text-muted mb-6 max-w-xs">
                  {t("buy.cart.emptyText")}
                </p>
                <Link
                  href="/shop"
                  onClick={closeCart}
                  className="sp-btn sp-pitch py-3 font-display uppercase tracking-wider text-xs font-semibold"
                >
                  {t("buy.cart.shop")}
                </Link>
              </div>
            ) : (
              items.map((item) => (
                <div key={item.id} className="py-4 flex gap-3">
                  {/* Thumbnail */}
                  <div className="relative w-20 h-24 bg-surface-subtle rounded-lg overflow-hidden shrink-0 border border-border-light">
                    <Image
                      src={item.image}
                      alt=""
                      fill
                      sizes="80px"
                      className="object-cover"
                    />
                  </div>

                  {/* Details */}
                  <div className="flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          href={`/products/${item.slug}`}
                          onClick={closeCart}
                          className="font-body text-sm font-semibold text-on-surface hover:text-primary transition-colors line-clamp-2"
                        >
                          {(locale === "bn" && item.title_bn) || item.title}
                        </Link>
                        <button
                          onClick={() => removeItem(item.id)}
                          className="sp-ico sp-yellow sp-lg -mt-1"
                          aria-label={t("buy.cart.remove", { name: (locale === "bn" && item.title_bn) || item.title })}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="flex items-center gap-2 mt-1 text-xs text-text-muted">
                        {item.size && <span className="bg-surface-subtle px-1.5 py-0.5 rounded font-medium border border-border-light">
                          {t("buy.cart.size")}: <strong className="text-primary font-bold">{item.size}</strong>
                        </span>}
                        {item.color && item.color !== "Default" && <span className="bg-surface-subtle px-1.5 py-0.5 rounded font-medium border border-border-light truncate max-w-[120px]">
                          {item.color}
                        </span>}
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-3">
                      {/* Quantity Stepper */}
                      <div className="sp-stepper h-12 w-32">
                        <button
                          onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          className="sp-ico sp-plate sp-lg"
                          aria-label={t("buy.cart.less")}
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="flex-1 text-center text-sm font-bold text-primary">
                          {num(item.quantity)}
                        </span>
                        <button
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          disabled={item.quantity >= item.maxStock}
                          className="sp-ico sp-plate sp-lg"
                          aria-label={t("buy.cart.more")}
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Line Price */}
                      <div className="text-right">
                        <span className="font-bold text-sm text-primary">
                          {taka(item.price * item.quantity)}
                        </span>
                        {item.original_price > item.price && (
                          <span className="block text-xs text-text-muted line-through">
                            {taka(item.original_price * item.quantity)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* 4. Footer & Checkout CTA */}
          {items.length > 0 && (
            <div className="p-space-base bg-surface-subtle border-t border-border-light flex flex-col gap-3">
              <div className="flex flex-col gap-1.5 text-xs">
                <div className="flex justify-between text-text-muted">
                  <span>{t("buy.cart.subtotal")}</span>
                  <span className="text-on-surface font-semibold">
                    {taka(subtotal)}
                  </span>
                </div>
                <div className="flex justify-between text-text-muted">
                  <span>{t("buy.cart.delivery")}</span>
                  <span className={shippingFee === 0 ? "text-emerald-700 dark:text-emerald-400 font-bold" : "text-on-surface font-semibold"}>
                    {shippingFee === 0 ? t("buy.cart.free") : taka(shippingFee)}
                  </span>
                </div>
                <div className="border-t border-border-light pt-2 flex justify-between text-sm font-bold text-primary">
                  <span>{t("buy.cart.total")}</span>
                  <span className="text-base font-display text-primary">
                    {taka(grandTotal)}
                  </span>
                </div>
              </div>

              <button
                onClick={handleProceedCheckout}
                className="sp-btn sp-goal w-full h-12 font-display uppercase tracking-wider text-xs font-bold flex items-center justify-center gap-2"
              >
                <span>{t("buy.cart.checkout")}</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <p className="text-xs text-center text-text-muted">
                {t("buy.cart.note", { days: num(RETURN_DAYS) })}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
