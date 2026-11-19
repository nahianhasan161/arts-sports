import React from "react";
import type { Metadata } from "next";
import { getProducts } from "@/lib/services/products";
import { getLandingContent, savedImage } from "@/lib/services/landing-content";
import { getCustomStartPrice, getPublicCatalogue } from "@/lib/custom-jersey/designs-public";
import { loadPricing } from "@/lib/custom-jersey/server";
import { isServiceSupabaseConfigured } from "@/lib/supabase/service";
import { DEFAULT_PRICING } from "@/lib/custom-jersey/types";
import { ProductCard } from "@/components/product/ProductCard";
import { ErrorBoundary, ProductGridErrorFallback } from "@/components/ui/ErrorBoundary";
import { ProductSchema } from "@/components/seo/ProductSchema";
import { LandingPageFAB, EditModeProvider, EditableImage } from "@/components/landing/EditModeFAB";
import {
  CatalogueShowcase,
  EditionText,
  EmptyProducts,
  HomeHero,
  HowItWorks,
  NewArrivalsHeading,
  Perks,
  ShopCategories,
  SportsMarquee,
  TeamBand,
  WhyUs,
} from "@/components/home/HomeSections";
import { getServerUrl } from "@/lib/config";

export const metadata: Metadata = {
  title: "Arts Sports | Custom Jerseys, Sportswear & Accessories in Bangladesh",
  description:
    "Design your own team jersey with names, numbers and logo from just 1 piece, or shop jerseys, sportswear and sports accessories. Delivery all over Bangladesh.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Arts Sports | Custom Jerseys & Sportswear",
    description: "Your team. Your jersey. Custom kits from 1 piece, made in 5–7 days.",
    url: getServerUrl(),
    type: "website",
    images: [{ url: "/og-cover.jpg", width: 1200, height: 630, alt: "Arts Sports" }],
  },
};

/**
 * Served from the ISR cache and rebuilt in the background at most once a
 * minute. Text is translated in the client sections (useT), so the page
 * reads no cookies and stays cacheable.
 */
export const revalidate = 60;

async function advancePercent(): Promise<number> {
  if (!isServiceSupabaseConfigured()) return DEFAULT_PRICING.advance_percent;
  try {
    return (await loadPricing()).advance_percent;
  } catch {
    return DEFAULT_PRICING.advance_percent;
  }
}

export default async function HomePage() {
  const [newArrivals, content, catalogue, startPrice, advance] = await Promise.all([
    getProducts({ limit: 10 }),
    getLandingContent(),
    getPublicCatalogue({ limit: 12 }),
    getCustomStartPrice().catch(() => null),
    advancePercent(),
  ]);

  const editions = [
    { which: "player" as const, id: "player-edition-image", fallback: "/images/player-edition-jersey.jpg", href: "/shop?category=jersey" },
    { which: "fan" as const, id: "fan-edition-image", fallback: "/images/fan-edition-jersey.jpg", href: "/shop?category=jersey" },
  ];

  return (
    <EditModeProvider>
      <div className="flex flex-col w-full pb-24">
        {newArrivals.slice(0, 3).map((p) => (
          <ProductSchema key={p.id} product={p} />
        ))}

        <HomeHero startPrice={startPrice} />
        <Perks />
        <ShopCategories />
        <CatalogueShowcase designs={catalogue.designs} categories={catalogue.categories} />
        <HowItWorks advancePercent={advance} />

        {/* New arrivals */}
        <section className="max-w-container-max mx-auto px-4 sm:px-6 pt-16 sm:pt-24 w-full">
          <NewArrivalsHeading />
          <ErrorBoundary fallback={<ProductGridErrorFallback />}>
            {newArrivals.length === 0 ? (
              <EmptyProducts />
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
                {newArrivals.map((product) => (
                  <ProductCard key={product.id} product={product} aspectRatio="square" />
                ))}
              </div>
            )}
          </ErrorBoundary>
        </section>

        {/* Player / fan edition banners (pictures editable from the FAB) */}
        <section className="max-w-container-max mx-auto px-4 sm:px-6 pt-16 sm:pt-24 w-full">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {editions.map((e) => (
              <div key={e.id} className="relative rounded-2xl overflow-hidden shadow-md group aspect-[16/10] min-h-[240px]">
                <EditableImage
                  id={e.id}
                  src={savedImage(content, e.id, e.fallback)}
                  alt=""
                  className="object-cover group-hover:scale-105 transition-transform duration-700"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent flex flex-col justify-end p-5 sm:p-7 text-white">
                  <EditionText which={e.which} href={e.href} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <TeamBand />
        <div className="pt-16 sm:pt-24">
          <SportsMarquee />
        </div>
        <WhyUs />

        <LandingPageFAB />
      </div>
    </EditModeProvider>
  );
}

