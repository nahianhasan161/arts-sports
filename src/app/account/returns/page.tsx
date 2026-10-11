import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ClientProviders } from "@/components/ClientProviders";
import { ReturnsList } from "@/components/returns/ReturnsList";
import { NewReturnButton } from "@/components/returns/NewReturnButton";

export const metadata = { title: "My Returns — Art's Fashion" };

export default function AccountReturnsPage() {
  return (
    <ClientProviders>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-primary">My Returns</h2>
          <NewReturnButton />
        </div>
        <Suspense fallback={<Skeleton className="h-80 w-full rounded-xl" />}>
          <ReturnsList />
        </Suspense>
      </div>
    </ClientProviders>
  );
}
