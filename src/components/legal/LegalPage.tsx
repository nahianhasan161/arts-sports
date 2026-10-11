import React from "react";
import Link from "next/link";
import type { Metadata } from "next";

/**
 * Shared shell for the store's policy pages.
 *
 * Every one of these used to be a `href="#"` in the footer, which meant the
 * site promised a return policy, a refund policy and privacy terms on every
 * page and linked to nowhere. A storefront that cannot show its terms is not
 * shippable, so these pages are real routes with the same breadcrumb, the
 * same reading width, and the same "last updated" line an auditor expects to
 * see.
 */

const LAST_UPDATED = "11 October 2026";

interface LegalPageProps {
  title: string;
  intro: string;
  children: React.ReactNode;
}

export function LegalPage({ title, intro, children }: LegalPageProps) {
  return (
    <div className="w-full bg-surface">
      <div className="max-w-3xl mx-auto px-space-base py-space-xl">
        {/* Breadcrumb. A policy page is a dead end without a way back. */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-text-muted mb-space-base">
          <Link href="/" className="hover:text-primary transition-colors">
            Home
          </Link>
          <span className="opacity-40">/</span>
          <span className="font-bold text-primary">{title}</span>
        </nav>

        <header className="mb-space-lg pb-space-base border-b border-border-light">
          <h1 className="font-display text-2xl sm:text-3xl uppercase font-bold text-primary mb-2">
            {title}
          </h1>
          <p className="text-sm text-text-muted max-w-2xl">{intro}</p>
          <p className="text-[11px] text-text-muted mt-3">
            Last updated: {LAST_UPDATED}
          </p>
        </header>

        <div className="flex flex-col gap-space-lg text-sm text-on-surface leading-relaxed">
          {children}
        </div>

        <footer className="mt-space-xl pt-space-base border-t border-border-light text-xs text-text-muted">
          <p className="mb-2">
            Questions about this policy? Call{" "}
            <a href="tel:+8809677666888" className="text-primary font-semibold hover:underline">
              +880 9677 666 888
            </a>{" "}
            between 9 AM and 10 PM, or email{" "}
            <a href="mailto:support@artsfashion.com" className="text-primary font-semibold hover:underline">
              support@artsfashion.com
            </a>
            .
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <Link href="/returns" className="hover:text-primary transition-colors">
              Return &amp; Exchange
            </Link>
            <Link href="/refund-policy" className="hover:text-primary transition-colors">
              Refund Policy
            </Link>
            <Link href="/shipping-policy" className="hover:text-primary transition-colors">
              Shipping Policy
            </Link>
            <Link href="/privacy-policy" className="hover:text-primary transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-primary transition-colors">
              Terms of Service
            </Link>
          </div>
        </footer>
      </div>
    </div>
  );
}

/** A titled section of a policy page. */
export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-sm uppercase tracking-wider font-bold text-primary">
        {title}
      </h2>
      {children}
    </section>
  );
}

export const legalMetadata = (title: string, description: string): Metadata => ({
  title,
  description,
  // Policy pages are legal documents, not landing pages. They belong in the
  // index so a customer searching for the terms finds the real one.
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
});

export const LAST_UPDATED_DATE = LAST_UPDATED;
