import React from "react";
import type { Metadata } from "next";
import { getProducts } from "@/lib/services/products";
import { getAccessoryShowcase } from "@/lib/services/accessories";
import { categoryHref, getHomeReviews } from "@/lib/services/home";
import { getPublicCatalogue, getPublicFabrics, onePiecePrice, startPrice } from "@/lib/custom-jersey/designs-public";
import { loadPublicPricing } from "@/lib/custom-jersey/server";
import { ProductCard } from "@/components/product/ProductCard";
import { ErrorBoundary, ProductGridErrorFallback } from "@/components/ui/ErrorBoundary";
import { ProductSchema } from "@/components/seo/ProductSchema";
import {
  CatalogueShowcase,
  CustomerReviews,
  EmptyProducts,
  FabricQuality,
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
    description: "Your team. Your jersey. Custom kits from 1 piece, with names, numbers and your logo.",
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

export default async function HomePage() {
  const [newArrivals, catalogue, fabrics, pricing, accessories, reviews, jerseysHref, sportswearHref] = await Promise.all([
    getProducts({ limit: 10 }),
    getPublicCatalogue({ limit: 12 }),
    getPublicFabrics(),
    loadPublicPricing(),
    getAccessoryShowcase().catch(() => null),
    getHomeReviews(),
    categoryHref("jersey"),
    categoryHref("t-shirt"),
  ]);
  // Only fabrics the shop has described.
  const described = fabrics
    .filter((f) => f.description_bn || f.description_en)
    .map((f) => ({ ...f, price: onePiecePrice(f, pricing) }));

  // The cards are client components: what they are given is also sent as data.
  // Leave out what a card does not show (descriptions can be long).
  const arrivalCards = newArrivals.map((p) => ({ ...p, description: "", short_description: null, specs: undefined, cost_price: undefined }));

  return (
    <div className="flex flex-col w-full pb-24">
      {newArrivals.slice(0, 3).map((p) => (
        <ProductSchema key={p.id} product={p} />
      ))}

      <HomeHero startPrice={startPrice(fabrics, pricing)} />
      <Perks normalDays={pricing.rush.normal_days} />
      <ShopCategories jerseysHref={jerseysHref} sportswearHref={sportswearHref} accessoriesHref={accessories ? "/#accessories" : "/shop"} />
      {accessories && <AccessoryShowcase data={accessories} />}
      <CatalogueShowcase designs={catalogue.designs} categories={catalogue.categories} />
      <FabricQuality fabrics={described} />
      <HowItWorks advancePercent={pricing.advance_percent} />

      {/* New arrivals */}
      <section className="max-w-container-max mx-auto px-4 sm:px-6 pt-16 sm:pt-24 w-full">
        <NewArrivalsHeading />
        <ErrorBoundary fallback={<ProductGridErrorFallback />}>
          {newArrivals.length === 0 ? (
            <EmptyProducts />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-3 gap-y-7 sm:gap-x-5 sm:gap-y-9 pt-4">
              {arrivalCards.map((product) => (
                <ProductCard key={product.id} product={product} aspectRatio="square" />
              ))}
            </div>
          )}
        </ErrorBoundary>
      </section>

      <CustomerReviews reviews={reviews} />
      <TeamBand />
      <div className="pt-16 sm:pt-24">
        <SportsMarquee />
      </div>
      <WhyUs />
    </div>
  );
}

