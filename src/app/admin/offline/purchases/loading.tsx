import PageSkeleton from "@/components/ui/PageSkeleton";

/** Shown while the register's code loads during navigation. */
export default function RegisterLoading() {
  return <PageSkeleton variant="register" className="h-screen" />;
}
