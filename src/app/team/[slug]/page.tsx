import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTermBySlug, getTermProducts } from "@/lib/services/catalog";
import { CatalogHero } from "@/components/shop/CatalogHero";

/** /team/argentina: every product tagged with that team, across all sports. */
interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * ISR: each page is rendered on its first visit, kept in the cache, and
 * rebuilt in the background at most once a minute. Nothing is prerendered at
 * build time (the empty list), so builds don't query the DB. Price and stock
 * shown here can be up to ~60 s old; checkout re-checks both on the server.
 */
export const revalidate = 60;
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const term = await getTermBySlug("team", slug);
  if (!term) return { title: "Team not found", robots: { index: false } };
  return {
    title: `${term.name_en} jerseys and gear`,
    description: term.description_en ?? `Shop ${term.name_en} jerseys and gear at Arts Sports.`,
    alternates: { canonical: `/team/${slug}` },
  };
}

export default async function TeamPage({ params }: Props) {
  const { slug } = await params;
  const term = await getTermBySlug("team", slug);
  if (!term) notFound();
  const products = await getTermProducts(term.id);
  return (
    <CatalogHero
      crumb={term.name_en}
      title={term.name_en}
      description={term.description_en}
      image={term.image_url}
      products={products}
      refineHref={`/shop?team=${encodeURIComponent(slug)}`}
    />
  );
}
