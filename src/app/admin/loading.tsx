import PageSkeleton from "@/components/ui/PageSkeleton";

/** Shown while an admin page's code loads during navigation. */
export default function AdminLoading() {
  return <PageSkeleton className="h-screen" />;
}
