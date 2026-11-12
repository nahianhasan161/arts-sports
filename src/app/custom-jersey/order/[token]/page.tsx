import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { CustomOrderView } from "@/components/custom-jersey/CustomOrderView";

// The link is the key to the order, so it must never be indexed or sent on as a referrer.
export const metadata: Metadata = {
  title: "Your custom jersey order",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function CustomOrderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{64}$/.test(token)) notFound();
  return (
    <div className="max-w-3xl mx-auto px-space-base py-space-xl">
      <Suspense fallback={null}>
        <CustomOrderView token={token} />
      </Suspense>
    </div>
  );
}
