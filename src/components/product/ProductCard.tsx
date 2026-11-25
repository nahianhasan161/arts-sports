"use client";
import { badgeClass } from "@/lib/badges";
import { formatTaka } from "@/lib/pricing";

import React from "react";
import Image from "next/image";
import { thumbUrl } from "@/lib/media/thumb";
import { HoverLink as Link } from "@/components/ui/HoverLink";
import { Heart } from "lucide-react";
import { Product } from "@/types";
import { useCartStore } from "@/lib/store/cart-store";
import { useWishlistStore } from "@/lib/store/wishlist-store";
import { useLiveBadges } from "@/lib/promotions/useLiveBadges";
import { useProofBadge } from "@/lib/catalog/useProofBadge";
import { useT } from "@/i18n/client";
import { assignFrames, frameWords, type SportFrame } from "@/lib/sport-frames";
import { SportCard } from "./SportCard";

interface ProductCardProps {
  product: Product;
  aspectRatio?: "portrait" | "square";
  /** From `assignFrames` for a whole grid; without it, the first frame of the product's sport. */
  frame?: SportFrame;
}

/** Inner width of the quick add bar on the narrowest card that shows it, and the rows it may fill. */
const QUICK_WIDTH = 132;
const QUICK_ROWS = 3;

/** How many options fit in the quick add bar; the rest are on the product page. */
function quickCount(labels: string[]): number {
  let row = 1;
  let used = 0;
  for (let i = 0; i < labels.length; i++) {
    const width = Math.min(QUICK_WIDTH, Math.max(28, 14 + labels[i].length * 6.5));
    if (used > 0 && used + 4 + width > QUICK_WIDTH) {
      row++;
      used = 0;
    }
    if (row > QUICK_ROWS) return i;
    used += (used > 0 ? 4 : 0) + width;
  }
  return labels.length;
}

export function ProductCard({ product, aspectRatio = "portrait", frame }: ProductCardProps) {
  const { t } = useT();
  const { addItem } = useCartStore();
  const { toggleWishlist, isInWishlist } = useWishlistStore();
  const [imgFailed, setImgFailed] = React.useState(false);

  // A live promotion wins over the product's static badge, so the label can
  // never outlive the promotion that produced it.
  const liveBadges = useLiveBadges([product.id]);
  const live = liveBadges[product.id];

  const proof = useProofBadge(product.id);

  const shownSizes = quickCount(product.sizes.map((s) => s.size));
  const hiddenSizes = product.sizes.length - shownSizes;

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
    <SportCard
      frame={frame ?? assignFrames([frameWords(product)])[0]}
      media={
        <Link
          href={`/products/${product.slug}`}
          className={`relative w-full ${
            aspectRatio === "square" ? "aspect-square" : "aspect-[3/4]"
          } overflow-hidden block`}
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
            className="sp-ico sp-medal absolute top-2.5 right-2.5"
          >
            <Heart className="w-4 h-4" fill={isLiked ? "currentColor" : "none"} />
          </button>

          {/* Quick size bar: slides up on hover (pointer devices only). Not
              clickable while hidden, so a tap on the picture opens the product. */}
          {product.sizes.length > 0 && (
            <div className="absolute bottom-2 inset-x-2 translate-y-3 opacity-0 pointer-events-none group-hover:translate-y-0 group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-all duration-300 bg-surface-card/95 backdrop-blur rounded-xl p-2 hidden sm:block shadow-lg">
              <div className="flex items-center justify-between gap-2 mb-1.5 text-[10px] leading-none font-bold text-text-muted">
                <span className="uppercase truncate">{t("store.card.quickAdd")}</span>
                {hiddenSizes > 0 && (
                  <span className="shrink-0 hover:underline">{t("store.card.moreOptions", { count: hiddenSizes })}</span>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                {product.sizes.slice(0, shownSizes).map((s) => (
                  <button
                    key={s.size}
                    disabled={s.stock === 0}
                    onClick={(e) => handleQuickAdd(e, s.size)}
                    className={`sp-size ${s.size.length > 3 ? "sp-option h-7 px-2" : "w-10 h-9 pt-1.5"} max-w-full text-[11px] font-bold flex items-center justify-center`}
                    title={s.chest ? `${s.size} · ${s.chest}″` : s.size}
                  >
                    <span className="truncate">{s.size}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </Link>
      }
    >
      <div className="flex flex-col flex-1 justify-between gap-1.5">
        <div className="min-w-0">
          <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider block truncate">
            {product.sub_category || product.category}
          </span>
          <Link
            href={`/products/${product.slug}`}
            className="font-body text-sm sm:text-[15px] text-on-surface font-semibold leading-snug line-clamp-2 hover:underline underline-offset-2 block mt-0.5"
            title={product.title}
          >
            {product.title}
          </Link>
        </div>

        {/* Pricing */}
        <div className="flex items-baseline flex-wrap gap-x-2 gap-y-0.5 pt-0.5">
          <span className="as-sc-price font-display font-bold text-base sm:text-lg tabular-nums">
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
    </SportCard>
  );
}
