import { Skeleton } from "@/components/ui/skeleton";
import { card } from "./api";

/** Placeholder cards shaped like an order card, shown while orders load. */
export function OrderCardsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`${card} p-4 flex flex-col gap-3`}>
          <div className="flex justify-between gap-2">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-40" />
            </div>
            <div className="flex flex-col items-end gap-2">
              <Skeleton className="h-6 w-20" />
              <div className="flex gap-1.5">
                <Skeleton className="h-7 w-16" />
                <Skeleton className="h-7 w-16" />
                <Skeleton className="h-7 w-16" />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
    </div>
  );
}
