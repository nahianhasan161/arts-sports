"use client";
import { badgeClass, discountBadgePercent } from "@/lib/badges";

import React, { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Home,
  ChevronRight,
  Heart,
  Share2,
  Plus,
  Minus,
  ShoppingBag,
  Zap,
  Truck,
  RotateCcw,
  ShieldCheck,
  Ruler,
  AlertCircle
} from "lucide-react";
import SizeGuideModal from "@/components/product/SizeGuideModal";
import { useLiveBadges } from "@/lib/promotions/useLiveBadges";
import { Product } from "@/types";
import { colorCover, galleryForColor, readColorMedia, readDefaultVariant } from "@/lib/products/color-images";
import { useCartStore } from "@/lib/store/cart-store";
import { trackEvent } from "@/lib/tracking/events";
import { ShareButtons } from "@/components/product/ShareButtons";
import { SocialProof } from "@/components/product/SocialProof";
import { useWishlistStore } from "@/lib/store/wishlist-store";
import { useT } from "@/i18n/client";
import { formatMoney } from "@/i18n";
import { RETURN_DAYS } from "@/lib/nav";
import { readVideos, type ProductVideo as Video } from "@/lib/media/video";
import { ProductVideo, VideoThumb } from "@/components/product/ProductVideo";
import type { VariantCombo } from "@/lib/services/products";

type Slide = { type: "image"; src: string } | { type: "video"; video: Video };

interface ProductDetailClientProps {
  product: Product;
  discountPercent: number;
  /** For the breadcrumb; null when the category is not in the list any more. */
  category: { name: string; name_bn?: string | null; slug: string } | null;
  subCategory: { name: string; name_bn?: string | null; slug?: string } | null;
  /** The description, cleaned on the server. */
  details: { en: string; bn: string };
  /** Switched-on colour + size pairs with their stock (empty = old products / no data). */
  combos?: VariantCombo[];
  /** Text for the main picture (from the product's search text). */
  imageAlt?: { en: string; bn: string };
}

export function ProductDetailClient({ product, discountPercent, category, subCategory, details, combos = [], imageAlt }: ProductDetailClientProps) {
  const router = useRouter();
  const { t, locale } = useT();
  const num = (n: number) => new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-IN").format(n);

  const label = (x: { name: string; name_bn?: string | null }) => (locale === "bn" && x.name_bn) || x.name;
  const title = (locale === "bn" && product.title_bn) || product.title;
  const mainAlt = (imageAlt && ((locale === "bn" && imageAlt.bn) || imageAlt.en)) || title;
  const summary = (locale === "bn" && product.short_description_bn) || product.short_description;
  const about = (locale === "bn" && details.bn) || details.en;
  const specs = Object.entries(product.specs ?? {}).filter(([, value]) => String(value ?? "").trim());
  const section = subCategory ? label(subCategory) : category ? label(category) : "";

  // The product arrives as a prop, fetched on the server by page.tsx. This
  // component used to fetch it itself in an effect, which meant the first
  // HTML a crawler or a shopper received was an empty shell — the reason no
  // product detail page was ever indexed.
  const [selectedImgIndex, setSelectedImgIndex] = useState(0);
  const [videoPlaying, setVideoPlaying] = useState(false);
  // With colours, stock is per colour + size pair: a pair the shop does not
  // sell (switched off in the admin) or has none of cannot be picked, because
  // checkout would refuse it. Without colours the per-size stock is enough.
  const pairAware = combos.length > 0 && product.colors.length > 0;
  const lc = (x: string) => x.trim().toLowerCase();
  const pairsFor = (color: string, size: string) =>
    combos.filter(
      (c) =>
        (c.color === null || c.color === lc(color)) &&
        (c.sizes.length === 0 || !size || c.sizes.includes(lc(size))),
    );
  const offered = (color: string, size: string) => pairsFor(color, size).length > 0;
  const stockOf = (color: string, size: string) => pairsFor(color, size).reduce((n, c) => n + c.stock, 0);
  const colorInStock = (color: string) => combos.some((c) => c.color === lc(color) && c.stock > 0);
  /** The size to show for a colour: the current one if it can be bought, else the first that can. */
  const sizeFor = (color: string, current?: string) => {
    if (product.sizes.length === 0) return "";
    if (current && stockOf(color, current) > 0) return current;
    return (
      product.sizes.find((s) => stockOf(color, s.size) > 0)?.size ??
      product.sizes.find((s) => offered(color, s.size))?.size ??
      product.sizes[0].size
    );
  };

  // "Shown first" from the admin; used while it can be bought, else the first in stock.
  const firstPick = readDefaultVariant(product.default_variant);
  const startColor = (() => {
    const pick = firstPick.color && product.colors.find((c) => lc(c.name) === firstPick.color);
    if (pick && (!pairAware || colorInStock(pick.name))) return pick.name;
    return pairAware
      ? (product.colors.find((c) => colorInStock(c.name)) ?? product.colors[0]).name
      : product.colors[0]?.name || "Default";
  })();
  const [selectedColor, setSelectedColor] = useState<string>(startColor);
  const [selectedSize, setSelectedSize] = useState<string>(() => {
    const pick = firstPick.size && product.sizes.find((x) => lc(x.size) === firstPick.size);
    if (pick && (pairAware ? stockOf(startColor, pick.size) > 0 : pick.stock > 0)) return pick.size;
    return pairAware
      ? sizeFor(startColor)
      : product.sizes.find((s) => s.stock > 0)?.size || product.sizes[0]?.size || "";
  });
  // Pictures/videos per colour (set in the admin): the picked colour's own
  // media first, then media no colour has. Without any, every colour sees all.
  // Photos, with the videos after the main photo: the first picture still
  // sells (and is the share image); the video is one tap away.
  const colorMedia = useMemo(() => readColorMedia(product.color_images), [product.color_images]);
  const photoOf = (color: string) => colorCover(product.images, colorMedia, color);
  const slides = useMemo<Slide[]>(() => {
    const g = galleryForColor(product.images, readVideos(product.videos), colorMedia, product.colors.length ? selectedColor : null);
    const photos: Slide[] = g.images.map((src) => ({ type: "image", src }));
    const clips: Slide[] = g.videos.map((video) => ({ type: "video", video }));
    return photos.length ? [photos[0], ...clips, ...photos.slice(1)] : clips;
  }, [product.images, product.videos, product.colors.length, colorMedia, selectedColor]);
  const slide = slides[selectedImgIndex] ?? slides[0];
  const showSlide = (idx: number) => {
    setSelectedImgIndex(idx);
    setVideoPlaying(false);
  };
  // The gallery changes with the colour, so start it again at its first item.
  const showColorPhoto = (color: string) => {
    if (color !== selectedColor) showSlide(0);
  };
  const pickColor = (name: string) => {
    setSelectedColor(name);
    showColorPhoto(name);
    if (pairAware) setSelectedSize((cur) => sizeFor(name, cur));
  };
  const [quantity, setQuantity] = useState(1);
  const [copied, setCopied] = useState(false);
  const [sizeModalOpen, setSizeModalOpen] = useState(false);

  const { addItem, setBuyNow } = useCartStore();

  // Ad links can open a specific option: /products/x?color=Blue&size=L.
  // Read after mount so the server HTML stays the same for every URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const wantColor = params.get("color")?.toLowerCase();
    const wantSize = params.get("size")?.toLowerCase();
    const color = wantColor && product.colors.find((c) => c.name.toLowerCase() === wantColor);
    const size = wantSize && product.sizes.find((s) => s.size.toLowerCase() === wantSize);
    if (color) {
      setSelectedColor(color.name);
      showColorPhoto(color.name);
    }
    if (size) setSelectedSize(size.size);
    else if (color && pairAware) setSelectedSize((cur) => sizeFor(color.name, cur));
    // Once per product: pairAware / sizeFor only read `product` and `combos`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product]);

  useEffect(() => {
    trackEvent("ViewContent", {
      value: product.price,
      items: [{ id: product.id, name: product.title, price: product.price, quantity: 1, category: product.category }],
    });
  }, [product]);
  const { toggleWishlist, isInWishlist } = useWishlistStore();

  // Live promotion wins over the product's static discount fields, so a
  // badge can never outlive the promotion that produced it.
  const liveBadges = useLiveBadges(product ? [product.id] : []);
  const live = product ? liveBadges[product.id] : undefined;
  // A variation with its own price (set in the admin) replaces the product
  // price; the server already applied the discount / promotion to it.
  const variantPrice = pairsFor(selectedColor, selectedSize).find((c) => c.price)?.price;
  const displayPrice = variantPrice?.final ?? live?.final_price ?? product?.price ?? 0;
  // Rounded for display, like every other percentage on the storefront.
  // `discount_value` is stored to two decimals, so a 14.8% markdown reaches
  // this page as 14.8 -- and showing it raw would print "14.8% Off" here while
  // the badge beside it said "15% OFF", which is the same discount rendered two
  // ways on one screen.
  const displayPercent = discountPercent;

  // A badge is a label, and a label has two possible sources: the promotion
  // that is live now, or the product's own badge. The promotion wins while it
  // runs, and the product's own badge returns when it ends, so a badge never
  // outlives the promotion that produced it.
  //
  // products.badge is now server-derived from the discount, so the fallback
  // chain below cannot contradict the price. The `badge_type !== "discount"`
  // arm is kept for rows whose badge predates the derivation: a hand-set
  // "NEW" on an existing product is still the better badge than none.
  const badgeType = live?.badge_type ?? product?.badge_type ?? null;
  const livePercent = discountBadgePercent(live?.badge_label);
  const liveBadgeLabel =
    (livePercent !== null ? t("store.pdp.discount", { percent: num(livePercent) }) : live?.badge_label) ??
    (displayPercent > 0
      ? t("store.pdp.discount", { percent: num(displayPercent) })
      : product?.badge && product.badge_type !== "discount"
        ? product.badge
        : null);

  // The crossed-out price is the base the saving was taken from, which for a
  // live promotion is the server's base_price. product.original_price is the
  // product's standing markdown base, and using it here made the two figures
  // disagree whenever a promotion applied on top of a product that already had
  // one.
  //
  // The badges API answers for every product, also when no promotion runs; then
  // base_price equals final_price and only the product's original_price says
  // what the price was. Reading base_price alone hid the struck price and showed
  // "Save ৳0.00 (10% off)".
  const crossedOutPrice = variantPrice
    ? variantPrice.regular
    : live && live.base_price > live.final_price ? live.base_price : (product?.original_price ?? 0);
  const savedAmount = Math.max(0, crossedOutPrice - displayPrice);
  const savedPercent =
    savedAmount > 0
      ? displayPercent > 0 && !variantPrice
        ? displayPercent
        : Math.round((savedAmount / crossedOutPrice) * 100)
      : 0;

  const isLiked = isInWishlist(product.id);
  const currentSizeObj = product.sizes.find((s) => s.size === selectedSize);
  // "3U / G5", "0.68 mm"...: a variation that is not a clothing size.
  const isOption = product.sizes.some((s) => !/^(x*[sml]|\d*xl)$/i.test(s.size.trim()));
  const availableStock = pairAware
    ? stockOf(selectedColor, selectedSize)
    : currentSizeObj
      ? currentSizeObj.stock
      : product.stock;

  const eventItem = () => ({
    value: displayPrice * quantity,
    items: [{ id: product.id, name: product.title, price: displayPrice, quantity, variant: `${selectedSize} / ${selectedColor}` }],
  });

  const unitPrice = { price: displayPrice, original_price: Math.max(displayPrice, crossedOutPrice) };

  const handleAddToCart = () => {
    addItem(product, selectedSize, selectedColor, quantity, unitPrice);
    trackEvent("AddToCart", eventItem());
  };

  // Straight to checkout with just this item; the bag is left as it is.
  const handleBuyNow = () => {
    setBuyNow(product, selectedSize, selectedColor, quantity, unitPrice);
    trackEvent("AddToCart", eventItem());
    router.push("/checkout?mode=buynow");
  };

  return (
    <div className="w-full pb-32 lg:pb-space-3xl">
      {/* 1. Breadcrumbs */}
      <div className="w-full bg-surface-subtle border-b border-border-light py-0 md:py-1">
        <div className="max-w-container-max mx-auto px-space-base flex items-center gap-1.5 text-xs text-text-muted flex-wrap">
          <Link href="/" className="hover:text-primary transition-colors flex min-h-11 min-w-11 md:min-h-8 items-center gap-1">
            <Home className="w-3.5 h-3.5" />
            <span>{t("store.shop.home")}</span>
          </Link>
          <ChevronRight className="w-3 h-3 opacity-40" />
          <Link href={category ? `/shop?category=${encodeURIComponent(category.slug)}` : "/shop"} className="hover:text-primary transition-colors inline-flex min-h-11 min-w-11 md:min-h-8 items-center">
            {category ? label(category) : t("store.shop.shop")}
          </Link>
          <ChevronRight className="w-3 h-3 opacity-40" />
          {category && subCategory?.slug && (
            <>
              <Link
                href={`/shop?category=${encodeURIComponent(category.slug)}&sub=${encodeURIComponent(subCategory.slug)}`}
                className="hover:text-primary transition-colors inline-flex min-h-11 min-w-11 md:min-h-8 items-center"
              >
                {label(subCategory)}
              </Link>
              <ChevronRight className="w-3 h-3 opacity-40" />
            </>
          )}
          <span className="text-on-surface font-semibold truncate max-w-xs md:max-w-none">
            {title}
          </span>
        </div>
      </div>

      {/* 2. Main Product Section */}
      <section className="w-full py-space-xl">
        <div className="max-w-container-max mx-auto px-space-base">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-xl lg:gap-space-2xl items-start">
            {/* LEFT: Gallery Module (7 cols) */}
            <div className="lg:col-span-7 flex flex-col-reverse md:flex-row gap-space-base items-start">
              {/* Vertical Thumbnail Strip */}
              {slides.length > 1 && (
              <div className="flex md:flex-col gap-2 w-full md:w-20 overflow-x-auto md:overflow-y-auto no-scrollbar shrink-0">
                {slides.map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => showSlide(idx)}
                    aria-label={
                      item.type === "video"
                        ? t("store.pdp.video")
                        : t("store.pdp.photo", { n: num(idx + 1), total: num(slides.length) })
                    }
                    aria-pressed={selectedImgIndex === idx}
                    className={`relative rounded-lg overflow-hidden w-16 h-20 md:w-20 md:h-24 bg-surface-subtle transition-all shrink-0 border-2 ${
                      selectedImgIndex === idx
                        ? "border-primary shadow-sm"
                        : "border-border-light hover:border-text-muted"
                    }`}
                  >
                    {item.type === "video" ? (
                      <VideoThumb
                        video={item.video}
                        fallback={slides[0]?.type === "image" ? slides[0].src : null}
                        label={t("store.pdp.video")}
                      />
                    ) : (
                      <Image src={item.src} alt="" fill sizes="80px" className="object-cover" />
                    )}
                  </button>
                ))}
              </div>
              )}

              {/* Main Gallery Stage */}
              <div className="flex-1 w-full bg-surface-card rounded-xl overflow-hidden shadow-sm border border-border-light relative group">
                {/* Floating Badges */}
                <div className={`absolute top-4 left-4 z-20 flex flex-col gap-1.5 pointer-events-none ${videoPlaying ? "hidden" : ""}`}>
                  {/*
                    Shown when a promotion is live OR a standing markdown is in
                    effect. The old gate was `displayPercent > 0` alone, which
                    hid a promotion badge that carried a label but no
                    percentage -- a "Festive" or "New" promotion has no reason
                    to be a discount, so its percent is 0 and its badge never
                    appeared at all.
                  */}
                  {liveBadgeLabel && (
                    <span
                      className={`${badgeClass(badgeType) ?? "bg-badge-discount text-white"} font-display text-xs px-3 py-1 rounded-full uppercase tracking-wider shadow-sm font-bold`}
                    >
                      {liveBadgeLabel}
                    </span>
                  )}
                  {availableStock > 0 ? (
                    <span className="self-start bg-primary text-primary-foreground text-xs px-2.5 py-1 rounded-full uppercase tracking-wider shadow-sm font-bold flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> {t("store.pdp.inStock", { count: num(availableStock) })}
                    </span>
                  ) : (
                    <span className="self-start bg-surface-card/95 text-badge-discount text-xs px-2.5 py-1 rounded-full uppercase tracking-wider shadow-sm font-bold">
                      {t("store.pdp.soldOut")}
                    </span>
                  )}
                </div>

                {/* Floating Wishlist & Share */}
                <div className={`absolute top-4 right-4 z-20 flex flex-col gap-4 ${videoPlaying ? "hidden" : ""}`}>
                  <button
                    onClick={() => toggleWishlist(product)}
                    aria-label={t("store.card.wishlist")}
                    aria-pressed={isLiked}
                    className="sp-ico sp-medal sp-lg"
                  >
                    <Heart className="w-4 h-4" fill={isLiked ? "currentColor" : "none"} />
                  </button>
                  <button
                    onClick={() => {
                      if (navigator.share) {
                        void navigator.share({ title, url: window.location.href }).catch(() => {});
                      } else {
                        void navigator.clipboard?.writeText(window.location.href).then(() => {
                          setCopied(true);
                          setTimeout(() => setCopied(false), 1800);
                        });
                      }
                    }}
                    aria-label={t("store.pdp.share")}
                    className="sp-ico sp-basket sp-lg"
                  >
                    <Share2 className="w-4 h-4" />
                  </button>
                  {copied && (
                    <span role="status" className="absolute right-0 top-full mt-2 whitespace-nowrap rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground shadow">
                      {t("store.pdp.copied")}
                    </span>
                  )}
                </div>

                {/* Main Large Image */}
                <div className="relative w-full aspect-[4/5] bg-surface-subtle overflow-hidden flex items-center justify-center">
                  {slide?.type === "video" ? (
                    <ProductVideo
                      key={selectedImgIndex}
                      video={slide.video}
                      title={title}
                      playLabel={t("store.pdp.playVideo")}
                      onPlay={() => setVideoPlaying(true)}
                    />
                  ) : (
                    <Image
                      src={(slide?.type === "image" && slide.src) || product.images[0]}
                      alt={selectedImgIndex === 0 ? mainAlt : `${title} – ${selectedImgIndex + 1}`}
                      fill
                      priority
                      sizes="(max-width: 1024px) 100vw, 55vw"
                      className="object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  )}
                </div>
              </div>
            </div>

            {/* RIGHT: Product Purchasing & Detail Column (5 cols) */}
            <div className="lg:col-span-5 flex flex-col gap-space-lg">
              {/* Header Title Block */}
              <div>
                {section && (
                  <span className="text-gold-ink font-display text-xs tracking-widest uppercase font-bold block mb-1">{section}</span>
                )}

                <h1 className="font-display text-2xl sm:text-3xl text-primary uppercase tracking-tight font-bold leading-tight">
                  {title}
                </h1>
                {summary && <p className="text-sm text-text-muted mt-1 leading-relaxed">{summary}</p>}

                {/* Real stock of the chosen size. No rating or order counts: the store shows only what it can back up. */}
                <div className="flex items-center gap-3 pt-2 flex-wrap">
                  {availableStock > 0 ? (
                    <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-600/10 px-2 py-0.5 rounded-full">
                      {selectedSize ? t("store.pdp.inStockSize", { count: num(availableStock), size: selectedSize }) : t("store.pdp.inStock", { count: num(availableStock) })}
                    </span>
                  ) : (
                    <span className="text-xs font-semibold text-badge-discount bg-badge-discount/10 px-2 py-0.5 rounded-full">
                      {selectedSize ? t("store.pdp.sizeSoldOut", { size: selectedSize }) : t("store.pdp.unavailable")}
                    </span>
                  )}
                </div>
              </div>

              {/* Price Engine Box */}
              <div className="bg-surface-subtle p-space-base rounded-xl border border-border-light flex flex-col gap-2">
                <div className="flex items-baseline flex-wrap gap-x-3 gap-y-1.5">
                  <span className="font-display text-2xl sm:text-3xl font-bold text-on-surface whitespace-nowrap tabular-nums">
                    {formatMoney(displayPrice, locale)}
                  </span>
                  {savedAmount > 0 && (
                    <span className="text-sm text-text-muted line-through whitespace-nowrap">
                      {formatMoney(crossedOutPrice, locale)}
                    </span>
                  )}
                  {savedAmount > 0 && (
                    <span className="bg-badge-discount/10 text-badge-discount font-bold text-xs px-2.5 py-1 rounded-full">
                      {/* The amount saved goes through the same rounding as the
                          percentage, and to the paisa rather than to the taka.
                          toFixed(0) used to turn a 104.50 saving into "Save
                          105", which is a claim about money that is not
                          accurate on the page that is about to take the order. */}
                      {t("store.pdp.save", { amount: formatMoney(savedAmount, locale), percent: num(savedPercent) })}
                    </span>
                  )}
                  {live?.promotion_name && (
                    <span className="text-xs text-text-muted self-center">
                      {live.promotion_name}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-text-muted">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{t("store.pdp.inclusive")}</span>
                </div>
              </div>

              {/* Color Swatch Selector (hidden for single-colour products, which said "0 Colorways") */}
              {product.colors.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-display text-xs uppercase text-primary font-bold">
                    {t("store.pdp.color")}: <span className="text-text-muted font-normal normal-case">{selectedColor}</span>
                  </span>
                  <span className="text-xs text-text-muted">{t("store.pdp.colors", { count: num(product.colors.length) })}</span>
                </div>
                {product.colors.some((c) => photoOf(c.name)) ? (
                <div className="flex flex-wrap gap-2">
                  {product.colors.map((c) => {
                    const out = pairAware && !colorInStock(c.name);
                    const name = out ? `${c.name} · ${t("store.pdp.soldOut")}` : c.name;
                    const photo = photoOf(c.name);
                    const on = selectedColor === c.name;
                    return (
                    <button
                      key={c.name}
                      type="button"
                      onClick={() => pickColor(c.name)}
                      className={`group relative w-[4.5rem] overflow-hidden rounded-lg border-2 bg-surface-card text-left transition-all ${
                        on ? "border-primary shadow-sm" : "border-border-light hover:border-text-muted"
                      }`}
                      title={name}
                      aria-label={name}
                      aria-pressed={on}
                    >
                      <span className={`relative block aspect-square w-full ${out ? "opacity-40" : ""}`} style={photo ? undefined : { backgroundColor: c.hex }}>
                        {photo && <Image src={photo} alt="" fill sizes="72px" className="object-cover" />}
                        <span
                          aria-hidden
                          className="absolute bottom-1 right-1 h-3.5 w-3.5 rounded-full border-2 border-white shadow"
                          style={{ backgroundColor: c.hex }}
                        />
                      </span>
                      <span className={`block truncate px-1 py-0.5 text-center text-xs ${on ? "font-bold text-on-surface" : "text-text-muted"}`}>
                        {c.name}
                      </span>
                      {out && (
                        <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 flex aspect-square items-center justify-center">
                          <span className="block h-0.5 w-12 rotate-45 rounded bg-text-muted/80" />
                        </span>
                      )}
                    </button>
                    );
                  })}
                </div>
                ) : (
                <div className="flex items-center gap-3">
                  {product.colors.map((c) => {
                    const out = pairAware && !colorInStock(c.name);
                    const name = out ? `${c.name} · ${t("store.pdp.soldOut")}` : c.name;
                    return (
                    <button
                      key={c.name}
                      type="button"
                      onClick={() => pickColor(c.name)}
                      className={`relative p-1.5 rounded-full border-2 transition-all ${
                        selectedColor === c.name ? "border-primary scale-110 shadow-sm" : "border-transparent hover:border-border-light"
                      }`}
                      title={name}
                      aria-label={name}
                      aria-pressed={selectedColor === c.name}
                    >
                      <span
                        className={`sp-swatch block w-7 h-7 rounded-full shadow-inner border border-black/10 ${out ? "opacity-40" : ""}`}
                        style={{ backgroundColor: c.hex }}
                      />
                      {out && (
                        <span aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
                          <span className="block h-0.5 w-8 rotate-45 rounded bg-text-muted/80" />
                        </span>
                      )}
                    </button>
                    );
                  })}
                </div>
                )}
              </div>

              )}

              {/* Size Selector Matrix (hidden for products without sizes) */}
              <div>
                {product.sizes.length > 0 && (
                <>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-display text-xs uppercase text-primary font-bold">
                    {isOption ? t("store.pdp.option") : t("store.pdp.size")}: <span className="text-on-surface font-bold">{selectedSize}</span>
                    {currentSizeObj?.chest && <span className="text-text-muted font-normal normal-case"> · {t("store.pdp.chest", { value: currentSizeObj.chest })}</span>}
                  </span>
                  {!isOption && <button
                    type="button"
                    onClick={() => setSizeModalOpen(true)}
                    className="sp-btn sp-whistle h-11 inline-flex items-center gap-1 text-xs font-semibold"
                  >
                    <Ruler className="w-3.5 h-3.5" />
                    {t("store.pdp.sizeGuide")}
                  </button>}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {product.sizes.map((s) => {
                    const isSelected = selectedSize === s.size;
                    const sizeStock = pairAware ? stockOf(selectedColor, s.size) : s.stock;
                    const notInColor = pairAware && !offered(selectedColor, s.size);
                    return (
                      <button
                        key={s.size}
                        type="button"
                        disabled={sizeStock === 0}
                        onClick={() => setSelectedSize(s.size)}
                        aria-pressed={isSelected}
                        className={`sp-size ${isOption ? "sp-option py-3" : "min-h-16 py-2.5"} px-1 text-center ${isSelected ? "sp-on" : ""}`}
                      >
                        <div className={`font-bold text-sm ${sizeStock === 0 ? "line-through" : ""}`}>{s.size}</div>
                        <div className="text-xs leading-tight opacity-80">
                          {notInColor
                            ? t("store.pdp.notInColor")
                            : sizeStock === 0
                              ? t("store.pdp.soldOut")
                              : s.chest
                                ? t("store.pdp.chest", { value: s.chest })
                                : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
                </>
                )}

                {/* Scarcity and social proof: real stock, real orders, live viewers. */}
                <SocialProof productId={product.id} stock={availableStock} size={selectedSize} />
              </div>

              {/* Quantity Selector & CTAs */}
              <div className="flex flex-col gap-2.5 pt-2">
                <div className="flex items-center gap-3">
                  {/* Quantity Stepper */}
                  <div className="sp-stepper h-12 w-32 shrink-0">
                    <button
                      type="button"
                      aria-label={t("store.pdp.less")}
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      className="sp-ico sp-plate sp-lg"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="w-12 text-center font-bold text-sm">
                      {num(quantity)}
                    </span>
                    <button
                      type="button"
                      aria-label={t("store.pdp.moreQty")}
                      onClick={() => setQuantity(Math.min(availableStock, quantity + 1))}
                      className="sp-ico sp-plate sp-lg"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Add to Cart CTA */}
                  <button
                    type="button"
                    onClick={handleAddToCart}
                    disabled={availableStock <= 0}
                    className="sp-btn sp-basket flex-1 h-12 font-display text-xs uppercase tracking-wider font-bold flex items-center justify-center gap-2"
                  >
                    <ShoppingBag className="w-4 h-4" />
                    <span>{availableStock > 0 ? t("store.pdp.addToCart", { price: formatMoney(displayPrice * quantity, locale) }) : t("store.pdp.soldOut")}</span>
                  </button>
                </div>

                {/* Express Buy Now CTA */}
                <button
                  type="button"
                  onClick={handleBuyNow}
                  disabled={availableStock <= 0}
                  className="sp-btn sp-leather w-full h-12 font-display text-xs uppercase tracking-wider font-bold flex items-center justify-center gap-2"
                >
                  <Zap className="w-4 h-4" />
                  <span>{t("store.pdp.buyNow")}</span>
                </button>

                <ShareButtons title={title} path={`/products/${encodeURIComponent(product.slug)}`} />
              </div>

              {/* Delivery and returns, as on the policy pages */}
              <div className="bg-surface-card rounded-xl p-space-md border border-border-light flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-surface-subtle flex items-center justify-center text-primary shrink-0">
                    <Truck className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="font-bold text-sm text-primary block">{t("store.pdp.delivery")}</span>
                    <p className="text-xs text-text-muted mt-0.5">{t("store.pdp.deliveryText")}</p>
                    <span className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold mt-1 block">✓ {t("store.pdp.cod")}</span>
                  </div>
                </div>
                <Link href="/returns" className="border-t border-border-light pt-1 min-h-11 flex items-center gap-2 text-xs text-on-surface-variant underline-offset-2 hover:underline">
                  <RotateCcw className="w-4 h-4 text-gold-ink shrink-0" />
                  <span>{t("store.pdp.returns", { days: num(RETURN_DAYS) })}</span>
                </Link>
              </div>

              {/* Only what the shop wrote about this product */}
              {(about || specs.length > 0) && (
                <div className="bg-surface-card rounded-xl p-space-md border border-border-light flex flex-col gap-3">
                  <h2 className="font-display text-sm uppercase font-bold text-primary">{t("store.pdp.details")}</h2>
                  {specs.length > 0 && (
                    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                      {specs.map(([key, value]) => (
                        <React.Fragment key={key}>
                          <dt className="text-text-muted">{key}</dt>
                          <dd className="text-on-surface font-semibold">{String(value)}</dd>
                        </React.Fragment>
                      ))}
                    </dl>
                  )}
                  {about && <div className="text-sm leading-relaxed text-on-surface-variant [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p+p]:mt-2 [&_a]:underline" dangerouslySetInnerHTML={{ __html: about }} />}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Mobile: buy button stays on screen while scrolling (above the bottom nav). */}
      <div className="lg:hidden fixed bottom-[calc(4rem+env(safe-area-inset-bottom))] inset-x-0 z-30 bg-surface-card/95 backdrop-blur border-t border-border-light px-4 py-2.5 flex items-center gap-3">
        <div className="min-w-0">
          <p className="text-xs text-text-muted truncate">
            {[selectedSize, product.colors.length > 0 && selectedColor].filter((x) => x && x !== "Default").join(" · ")}
          </p>
          <p className="font-display font-bold text-on-surface tabular-nums">{formatMoney(displayPrice * quantity, locale)}</p>
        </div>
        <button
          type="button"
          onClick={handleBuyNow}
          disabled={availableStock <= 0}
          className="sp-btn sp-leather flex-1 h-11 font-display text-xs uppercase tracking-wider font-bold flex items-center justify-center gap-2"
        >
          <Zap className="w-4 h-4" /> {availableStock > 0 ? t("store.pdp.buyNow") : t("store.pdp.soldOut")}
        </button>
      </div>

      {/* Size Guide Modal - resolved regional chart */}
      <SizeGuideModal
        open={sizeModalOpen}
        onClose={() => setSizeModalOpen(false)}
        categoryId={product.category_id ?? null}
        subCategoryId={product.sub_category_id ?? null}
        onPick={(label) => {
          const match = product.sizes.find((s) => s.size.toLowerCase() === label.toLowerCase());
          if (match) setSelectedSize(match.size);
          setSizeModalOpen(false);
        }}
        type="clothing"
      />
    </div>
  );
}
