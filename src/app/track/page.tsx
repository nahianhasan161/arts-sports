import type { Metadata } from "next";
import { Suspense } from "react";
import { TrackOrder } from "./TrackOrder";

export const metadata: Metadata = {
  title: "অর্ডার ট্র্যাক করুন",
  description: "অর্ডার নম্বর আর ফোন নম্বর দিয়ে দেখুন আপনার Arts Sports অর্ডার কোথায় আছে।",
  robots: { index: false, follow: true },
};

export default function TrackPage() {
  return (
    <div className="max-w-xl mx-auto px-space-base py-space-2xl">
      <Suspense fallback={null}>
        <TrackOrder />
      </Suspense>
    </div>
  );
}
