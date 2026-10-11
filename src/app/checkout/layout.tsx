import React from "react";
import type { Metadata } from "next";

/**
 * Keeps the checkout funnel out of search results.
 *
 * A checkout page in a search index is noise for the shopper and an
 * information leak about how the payment step is laid out. It is also a
 * route that should never be cached, which `nocache` asks for.
 */

export const metadata: Metadata = {
  title: "Checkout",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
