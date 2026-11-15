import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ClientProviders } from "@/components/ClientProviders";
import { AdminPaymentsClient } from "@/components/admin/payments/AdminPaymentsClient";

export const metadata = { title: "Payments — Admin" };

export default function PaymentsPage() {
  return (
    <ClientProviders>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-primary">Payments</h2>
        </div>
        <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
          <AdminPaymentsClient />
        </Suspense>
      </div>
    </ClientProviders>
  );
}
