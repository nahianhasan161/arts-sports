"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import PageSkeleton from "@/components/ui/PageSkeleton";
import { BUY } from "@/components/admin/nav";

/** Old link: purchases now open in the full-screen buy window. */
export default function PurchasesRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace(`${BUY}${window.location.search}`);
  }, [router]);
  return <PageSkeleton variant="register" className="h-screen" />;
}
