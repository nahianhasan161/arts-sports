import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ClientProviders } from "@/components/ClientProviders";
import { AdminCancellationsClient } from "@/components/admin/cancellations/AdminCancellationsClient";

export const metadata = { title: "Cancellations — Admin" };

export default function CancellationsPage() {
  return (
    <ClientProviders>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-primary">Cancellations</h2>
        </div>
        <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
          <AdminCancellationsClient />
        </Suspense>
      </div>
    </ClientProviders>
  );
}