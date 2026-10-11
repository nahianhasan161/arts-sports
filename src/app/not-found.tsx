import Link from "next/link";
import { Home, ShoppingBag } from "lucide-react";

/**
 * 404 page.
 *
 * There was none, so a broken URL got Next.js's default unstyled "404 This
 * page could not be found." screen with no way back into the store — and
 * since the product detail page used to render an empty shell instead of
 * calling notFound(), there was an unbounded set of URLs that resolved to
 * exactly that. A shopper who mistypes a product name now gets somewhere to
 * go.
 */
export default function NotFound() {
  return (
    <div className="w-full bg-surface">
      <div className="max-w-2xl mx-auto px-space-base py-space-3xl text-center">
        <p className="font-display text-6xl sm:text-7xl font-bold text-primary/20 mb-2">
          404
        </p>
        <h1 className="font-display text-2xl sm:text-3xl uppercase font-bold text-primary mb-3">
          We couldn&apos;t find that page
        </h1>
        <p className="text-sm text-text-muted mb-space-xl max-w-md mx-auto">
          The product may have sold out and been delisted, or the link may be
          out of date. Try searching the catalogue instead.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-space-xl">
          <Link
            href="/shop"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-primary text-white font-display uppercase tracking-wider text-xs font-bold rounded-lg hover:bg-primary-container transition-colors shadow-sm"
          >
            <ShoppingBag className="w-4 h-4" />
            Browse Catalogue
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 border border-border-light bg-surface-card text-primary font-display uppercase tracking-wider text-xs font-bold rounded-lg hover:bg-surface-subtle transition-colors"
          >
            <Home className="w-4 h-4" />
            Go Home
          </Link>
        </div>

        {/* Popular destinations, so a lost shopper has somewhere to land
            without having to think about what to search for. */}
        <div className="border-t border-border-light pt-space-lg">
          <p className="text-[11px] font-display uppercase tracking-wider text-text-muted font-bold mb-3">
            Popular collections
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            {[
              { label: "All Products", href: "/shop" },
              { label: "Men", href: "/shop?category=men" },
              { label: "Women", href: "/shop?category=women" },
              { label: "Kids", href: "/shop?category=kids" },
              { label: "Sports", href: "/shop?category=sports" },
              { label: "New Arrivals", href: "/shop?sort=newest" },
            ].map((link) => (
              <Link
                key={link.href + link.label}
                href={link.href}
                className="px-3 py-1.5 rounded-md bg-surface-card border border-border-light text-xs font-semibold text-primary hover:bg-surface-subtle transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
