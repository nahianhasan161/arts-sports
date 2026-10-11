import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ClientProviders } from "@/components/ClientProviders";
import { AdminReturnsClient } from "@/components/admin/returns/AdminReturnsClient";

export const metadata = { title: "Returns — Admin" };

export default function ReturnsPage() {
  return (
    <ClientProviders>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-primary">Returns</h2>
        </div>
        <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
          <AdminReturnsClient />
        </Suspense>
      </div>
    </ClientProviders>
  );
}
