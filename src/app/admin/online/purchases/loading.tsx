import PageSkeleton from "@/components/ui/PageSkeleton";

/** Shown while the purchase screen's code loads during navigation. */
export default function PurchasesLoading() {
  return <PageSkeleton variant="register" className="h-screen" />;
}
