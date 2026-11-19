import type { Metadata } from "next";
import { CustomJerseyForm } from "@/components/custom-jersey/CustomJerseyForm";
import { CustomHero, CustomSteps, OrderHeading, PopularDesigns } from "@/components/custom-jersey/CustomLanding";
import { getCustomStartPrice, getPublicCatalogue } from "@/lib/custom-jersey/designs-public";
import { loadPricing } from "@/lib/custom-jersey/server";
import { isServiceSupabaseConfigured } from "@/lib/supabase/service";
import { DEFAULT_PRICING, type PricingConfig } from "@/lib/custom-jersey/types";

export const metadata: Metadata = {
  title: "Custom jersey — your own team kit",
  description:
    "Order a custom jersey from 1 piece. Upload your design or pick one of ours, choose the fabric, add names and numbers, and see the estimated price straight away.",
  alternates: { canonical: "/custom-jersey" },
};

/**
 * Cached like the home page: text is translated in the client sections and
 * the form loads prices itself, so nothing here reads cookies.
 */
export const revalidate = 60;

async function pricing(): Promise<PricingConfig> {
  if (!isServiceSupabaseConfigured()) return DEFAULT_PRICING;
  try {
    return await loadPricing();
  } catch {
    return DEFAULT_PRICING;
  }
}

export default async function CustomJerseyPage() {
  const [catalogue, startPrice, p] = await Promise.all([
    getPublicCatalogue({ limit: 8 }).catch(() => ({ designs: [], categories: [], hasMore: false })),
    getCustomStartPrice().catch(() => null),
    pricing(),
  ]);

  return (
    <div className="flex flex-col w-full pb-40 lg:pb-24">
      <CustomHero startPrice={startPrice} advancePercent={p.advance_percent} normalDays={p.rush.normal_days} freeRevisions={p.free_revisions} />
      <CustomSteps advancePercent={p.advance_percent} />
      <PopularDesigns designs={catalogue.designs} categories={catalogue.categories} />
      <section id="order" className="scroll-mt-20 max-w-container-max mx-auto px-4 sm:px-6 pt-14 sm:pt-20 w-full">
        <OrderHeading />
        <CustomJerseyForm />
      </section>
    </div>
  );
}
