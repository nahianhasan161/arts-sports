import Link from "next/link";
import Image from "next/image";
import { ChevronRight, Home } from "lucide-react";
import { ProductCard } from "@/components/product/ProductCard";
import type { Product } from "@/types";
import { Countdown } from "@/components/shop/Countdown";

/** Header + product grid shared by /team/<slug> and /collection/<slug>. */
export function CatalogHero({
  crumb,
  title,
  description,
  image,
  endsAt,
  products,
  refineHref,
}: {
  crumb: string;
  title: string;
  description?: string | null;
  image?: string | null;
  /** Real end time of a campaign; renders a countdown only when given. */
  endsAt?: string | null;
  products: Product[];
  refineHref?: string;
}) {
  return (
    <div className="w-full pb-space-3xl">
      <section className="w-full bg-surface-card border-b border-border-light">
        <div className="max-w-container-max mx-auto px-space-base py-space-md">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-text-muted mb-3">
            <Link href="/" className="hover:text-primary flex items-center gap-1">
              <Home className="w-3.5 h-3.5" /> Home
            </Link>
            <ChevronRight className="w-3 h-3 opacity-40" />
            <Link href="/shop" className="hover:text-primary">Shop</Link>
            <ChevronRight className="w-3 h-3 opacity-40" />
            <span className="font-bold text-primary">{crumb}</span>
          </nav>
          <div className="flex items-center gap-4">
            {image && (
              <div className="relative w-16 h-16 shrink-0 rounded-lg overflow-hidden bg-surface-subtle border border-border-light">
                <Image src={image} alt="" fill sizes="64px" className="object-contain" />
              </div>
            )}
            <div className="min-w-0">
              <h1 className="font-display text-2xl sm:text-3xl uppercase text-primary tracking-wide font-bold">{title}</h1>
              {description && <p className="text-xs sm:text-sm text-text-muted mt-1 max-w-2xl">{description}</p>}
            </div>
          </div>
          {endsAt && <Countdown endsAt={endsAt} />}
          {refineHref && (
            <Link href={refineHref} className="inline-block mt-3 text-xs font-bold uppercase tracking-wider text-primary underline">
              Filter by size, price and more
            </Link>
          )}
        </div>
      </section>
      <section className="max-w-container-max mx-auto px-space-base py-space-lg w-full">
        {products.length === 0 ? (
          <p className="text-center text-sm text-text-muted py-16">Nothing here yet. New products are added regularly.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-space-sm sm:gap-space-md">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
