"use client";
import { badgeClass } from "@/lib/badges";
import { formatTaka } from "@/lib/pricing";

import React from "react";
import Image from "next/image";
import { thumbUrl } from "@/lib/media/thumb";
import Link from "next/link";
import { Heart } from "lucide-react";
import { Product } from "@/types";
import { useCartStore } from "@/lib/store/cart-store";
import { useWishlistStore } from "@/lib/store/wishlist-store";
import { useLiveBadges } from "@/lib/promotions/useLiveBadges";
import { useProofBadge } from "@/lib/catalog/useProofBadge";
import { useT } from "@/i18n/client";

interface ProductCardProps {
  product: Product;
  aspectRatio?: "portrait" | "square";
}

export function ProductCard({ product, aspectRatio = "portrait" }: ProductCardProps) {
  const { t } = useT();
  const { addItem } = useCartStore();
  const { toggleWishlist, isInWishlist } = useWishlistStore();
  const [imgFailed, setImgFailed] = React.useState(false);

  // A live promotion wins over the product's static badge, so the label can
  // never outlive the promotion that produced it.
  const liveBadges = useLiveBadges([product.id]);
  const live = liveBadges[product.id];

  const proof = useProofBadge(product.id);

  const isLiked = isInWishlist(product.id);

  const handleQuickAdd = (e: React.MouseEvent, size: string) => {
    e.preventDefault();
    e.stopPropagation();
    const defaultColor = product.colors[0]?.name || "Default";
    addItem(product, size, defaultColor, 1);
  };

  const handleWishlistClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleWishlist(product);
  };

  // A live promotion speaks for the product while it runs; otherwise the
  // product's own badge, which the server derives from the product's discount
  // on every save. The fallback chain is safe to read now for a reason it was
  // not before: both ends of it come from the same numbers as the price, so a
  // card cannot show a badge its own price contradicts.
  // Computed from real sales/publish dates, and only when nothing else is
  // already labelling the card.
  const proofText = proof?.bestseller ? "Bestseller" : proof?.new ? "New" : null;
  const badgeText = live?.badge_label ?? product.badge ?? proofText;
  const badgeType =
    live?.badge_type ?? product.badge_type ?? (proof?.bestseller ? "popular" : proof?.new ? "new" : undefined);
  const displayPrice = live?.final_price ?? product.price;

  // The base the saving was taken from. live.base_price is the server's figure
  // when a promotion is running; product.original_price is the product's
  // standing markdown base. Using original_price unconditionally made the two
  // disagree whenever a promotion applied on top of a product that already had
  // a markdown -- the struck-through price was not the price the saving came
  // from.
  //
  // The badges API answers for every product, also when no promotion runs; then
  // base_price equals final_price (the already-marked-down price) and the
  // product's own original_price is the real "was" price.
  const basePrice =
    live && live.base_price > live.final_price ? live.base_price : (product.original_price ?? displayPrice);
  const offPercent = basePrice > displayPrice ? Math.round(((basePrice - displayPrice) / basePrice) * 100) : 0;

  // One shared mapping, so the card and the product page cannot give the same
  // badge two different colours.
  const badgeColorClass = badgeClass(badgeType);

  return (
    <div className="group relative flex flex-col bg-surface-card rounded-2xl overflow-hidden border border-border-light/70 shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:shadow-xl hover:shadow-black/[0.06] hover:-translate-y-0.5 transition-all duration-300">
      {/* 1. Image Container */}
      <Link
        href={`/products/${product.slug}`}
        className={`relative w-full ${
          aspectRatio === "square" ? "aspect-square" : "aspect-[3/4]"
        } bg-surface-subtle overflow-hidden block`}
      >
        <Image
          // The small grid version; the original if it has none yet.
          src={imgFailed ? product.images[0] : thumbUrl(product.images[0])}
          onError={() => setImgFailed(true)}
          alt={product.title}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          className="object-cover group-hover:scale-[1.06] transition-transform duration-700 ease-out"
        />

        {/* Badges */}
        {badgeText && (
          <span
            className={`absolute top-2.5 left-2.5 ${badgeColorClass} font-bold text-[10px] px-2 py-1 rounded-full uppercase tracking-wider shadow-sm`}
          >
            {badgeText}
          </span>
        )}

        {/* Wishlist Toggle Button */}
        <button
          onClick={handleWishlistClick}
          aria-label={t("store.card.wishlist")}
          aria-pressed={isLiked}
          className={`absolute top-2.5 right-2.5 w-9 h-9 rounded-full bg-surface-card/90 backdrop-blur-sm shadow-sm flex items-center justify-center transition-all hover:scale-110 ${
            isLiked ? "text-badge-discount" : "text-on-surface-variant hover:text-badge-discount"
          }`}
        >
          <Heart className="w-4 h-4" fill={isLiked ? "currentColor" : "none"} />
        </button>

        {/* Quick size bar: slides up on hover (pointer devices only). */}
        {product.sizes.length > 0 && (
          <div className="absolute bottom-2.5 inset-x-2.5 translate-y-3 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300 bg-surface-card/95 backdrop-blur rounded-xl p-1.5 hidden sm:flex items-center justify-between gap-1 shadow-lg">
            <span className="text-[10px] font-bold text-text-muted uppercase pl-1.5 whitespace-nowrap">{t("store.card.quickAdd")}</span>
            <div className="flex items-center gap-1">
              {product.sizes.slice(0, 4).map((s) => (
                <button
                  key={s.size}
                  disabled={s.stock === 0}
                  onClick={(e) => handleQuickAdd(e, s.size)}
                  className="min-w-7 h-7 px-1 rounded-lg text-[11px] font-bold text-on-surface border border-border-light hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors disabled:opacity-30 disabled:line-through disabled:hover:bg-transparent disabled:hover:text-on-surface flex items-center justify-center"
                  title={`${s.size} · ${s.chest}″`}
                >
                  {s.size}
                </button>
              ))}
            </div>
          </div>
        )}
      </Link>

      {/* 2. Details */}
      <div className="p-3 sm:p-3.5 flex flex-col flex-1 justify-between gap-1.5">
        <div className="min-w-0">
          <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider block truncate">
            {product.sub_category || product.category}
          </span>
          <Link
            href={`/products/${product.slug}`}
            className="font-body text-sm sm:text-[15px] text-on-surface font-semibold leading-snug line-clamp-2 hover:text-accent-gold transition-colors block mt-0.5"
            title={product.title}
          >
            {product.title}
          </Link>
        </div>

        {/* Pricing */}
        <div className="flex items-baseline flex-wrap gap-x-2 gap-y-0.5 pt-0.5">
          <span className="font-display font-bold text-base sm:text-lg text-on-surface tabular-nums">
            {formatTaka(displayPrice)}
          </span>
          {offPercent > 0 && (
            <>
              <span className="text-xs text-text-muted line-through tabular-nums">{formatTaka(basePrice)}</span>
              <span className="text-[11px] font-bold text-badge-discount">{t("store.card.off", { percent: offPercent })}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
