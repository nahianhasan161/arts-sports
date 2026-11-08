import type { Metadata } from "next";
import { Suspense } from "react";
import { TrackOrder } from "./TrackOrder";

export const metadata: Metadata = {
  title: "Track your order",
  description: "Check where your Arts Sports order is with your order number and phone number.",
  robots: { index: false, follow: true },
};

export default function TrackPage() {
  return (
    <div className="max-w-xl mx-auto px-space-base py-space-2xl">
      <h1 className="font-display text-2xl sm:text-3xl uppercase font-bold text-primary mb-2">Track your order</h1>
      <p className="text-sm text-text-muted mb-space-lg">
        Enter the order number from your confirmation and the phone number you ordered with.
      </p>
      <Suspense fallback={null}>
        <TrackOrder />
      </Suspense>
    </div>
  );
}
