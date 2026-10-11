import React from "react";
import type { Metadata } from "next";

/**
 * Keeps the customer account area out of search results.
 *
 * The account pages contain a signed-in customer's profile and order
 * history. Indexing them would serve personal data to anyone searching, and
 * a cached copy of an account page is stale the moment the customer places
 * another order.
 */

export const metadata: Metadata = {
  title: "My Account",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
