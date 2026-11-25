import React from "react";
import type { Metadata } from "next";
import { getProducts } from "@/lib/services/products";
import { getAccessoryShowcase } from "@/lib/services/accessories";
import { getCustomStartPrice, getPublicCatalogue } from "@/lib/custom-jersey/designs-public";
import { loadPricing } from "@/lib/custom-jersey/server";
import { isServiceSupabaseConfigured } from "@/lib/supabase/service";
import { DEFAULT_PRICING } from "@/lib/custom-jersey/types";
import { assignFrames, frameWords } from "@/lib/sport-frames";
import { ProductCard } from "@/components/product/ProductCard";
import { ErrorBoundary, ProductGridErrorFallback } from "@/components/ui/ErrorBoundary";
import { ProductSchema } from "@/components/seo/ProductSchema";
import {
  CatalogueShowcase,
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
import { AccessoryShowcase } from "@/components/home/AccessoryShowcase";
import { getServerUrl } from "@/lib/config";

export const metadata: Metadata = {
  title: "Arts Sports | Custom Jerseys, Sportswear & Accessories in Bangladesh",
  description:
    "Design your own team jersey with names, numbers and logo from just 1 piece, or shop jerseys, sportswear and sports accessories. Delivery all over Bangladesh.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Arts Sports | Custom Jerseys & Sportswear",
    description: "Your team. Your jersey. Custom kits from 1 piece, made in 4–6 days.",
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
  const [newArrivals, catalogue, startPrice, advance, accessories] = await Promise.all([
    getProducts({ limit: 10 }),
    getPublicCatalogue({ limit: 12 }),
    getCustomStartPrice().catch(() => null),
    advancePercent(),
    getAccessoryShowcase().catch(() => null),
  ]);

  // The cards are client components: what they are given is also sent as data.
  // Leave out what a card does not show (descriptions can be long).
  const arrivalCards = newArrivals.map((p) => ({ ...p, description: "", short_description: null, specs: undefined, cost_price: undefined }));
  const arrivalFrames = assignFrames(newArrivals.map(frameWords), 3);

  return (
    <div className="flex flex-col w-full pb-24">
      {newArrivals.slice(0, 3).map((p) => (
        <ProductSchema key={p.id} product={p} />
      ))}

      <HomeHero startPrice={startPrice} />
      <Perks />
      <ShopCategories accessoriesHref={accessories ? "/#accessories" : "/shop"} />
      {accessories && <AccessoryShowcase data={accessories} />}
      <CatalogueShowcase designs={catalogue.designs} categories={catalogue.categories} />
      <HowItWorks advancePercent={advance} />

      {/* New arrivals */}
      <section className="max-w-container-max mx-auto px-4 sm:px-6 pt-16 sm:pt-24 w-full">
        <NewArrivalsHeading />
        <ErrorBoundary fallback={<ProductGridErrorFallback />}>
          {newArrivals.length === 0 ? (
            <EmptyProducts />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-3 gap-y-7 sm:gap-x-5 sm:gap-y-9 pt-4">
              {arrivalCards.map((product, i) => (
                <ProductCard key={product.id} product={product} aspectRatio="square" frame={arrivalFrames[i]} />
              ))}
            </div>
          )}
        </ErrorBoundary>
      </section>

      <TeamBand />
      <div className="pt-16 sm:pt-24">
        <SportsMarquee />
      </div>
      <WhyUs />
    </div>
  );
}

