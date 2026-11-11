import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCollectionBySlug, getCollectionProducts } from "@/lib/services/catalog";
import { CatalogHero } from "@/components/shop/CatalogHero";

/** /collection/bpl-2027, /collection/new-arrivals: a campaign or picked list. */
interface Props {
  params: Promise<{ slug: string }>;
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
