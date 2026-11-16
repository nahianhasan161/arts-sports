import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCollectionBySlug, getCollectionProducts } from "@/lib/services/catalog";
import { CatalogHero } from "@/components/shop/CatalogHero";

/** /collection/bpl-2027, /collection/new-arrivals: a campaign or picked list. */
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
  const c = await getCollectionBySlug(slug);
  if (!c) return { title: "Collection not found", robots: { index: false } };
  return {
    title: c.title_en,
    description: c.description_en ?? `${c.title_en} at Arts Sports.`,
    alternates: { canonical: `/collection/${slug}` },
  };
}

export default async function CollectionPage({ params }: Props) {
  const { slug } = await params;
  const collection = await getCollectionBySlug(slug);
  if (!collection) notFound();
  const products = await getCollectionProducts(collection);
  return (
    <CatalogHero
      crumb={collection.title_en}
      title={collection.title_en}
      description={collection.description_en}
      image={collection.banner_url}
      endsAt={collection.show_countdown ? collection.ends_at : null}
      products={products}
    />
  );
}
