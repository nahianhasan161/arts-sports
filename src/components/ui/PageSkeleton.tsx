import { Skeleton } from "@/components/ui/skeleton";

type Variant = "page" | "register" | "receipt";

/**
 * Skeleton placeholder shown while a page's data loads.
 * - page: title, stat cards and table rows (dashboards, lists)
 * - register: POS layout (product grid + bill panel)
 * - receipt: narrow receipt slip
 */
export default function PageSkeleton({
  label = "Loading",
  className = "min-h-[60vh]",
  variant = "page",
}: {
  label?: string;
  className?: string;
  variant?: Variant;
}) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={`w-full bg-surface ${className}`}>
      <span className="sr-only">{label}</span>
      {variant === "register" ? <Register /> : variant === "receipt" ? <Receipt /> : <Page />}
    </div>
  );
}

function Page() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-10 w-28" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-xl border border-border-light bg-surface-card p-4">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-7 w-28" />
          </div>
        ))}
      </div>
      <div className="space-y-3 rounded-xl border border-border-light bg-surface-card p-4">
        <Skeleton className="h-5 w-40" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <Skeleton className="h-10 w-10 shrink-0" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="hidden h-4 w-24 sm:block" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

function Register() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border-light p-3">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-9 flex-1" />
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 lg:flex-row">
        <div className="grid flex-1 grid-cols-2 content-start gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="space-y-2 rounded-xl border border-border-light bg-surface-card p-2">
              <Skeleton className="aspect-square w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          ))}
        </div>
        <div className="flex w-full flex-col gap-3 rounded-xl border border-border-light bg-surface-card p-3 lg:w-96">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-14" />
            </div>
          ))}
          <div className="mt-auto space-y-3">
            <Skeleton className="h-8 w-full" />
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 12 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
            <Skeleton className="h-12 w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

function Receipt() {
  return (
    <div className="mx-auto w-full max-w-sm space-y-4 p-6">
      <Skeleton className="mx-auto h-8 w-40" />
      <Skeleton className="mx-auto h-4 w-56" />
      <div className="space-y-2 border-y border-border-light py-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex justify-between gap-4">
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
      <div className="flex justify-between">
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-6 w-24" />
      </div>
      <Skeleton className="mx-auto h-16 w-48" />
    </div>
  );
}

/** In-panel placeholder: a grid of product tiles (POS product grid). */
export function SkeletonTiles({ count = 12, label = "Loading" }: { count?: number; label?: string }) {
  return (
    <div role="status" aria-busy="true" className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
      <span className="sr-only">{label}</span>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex h-40 flex-col gap-2 overflow-hidden rounded-md border border-border-light bg-surface-card p-2">
          <Skeleton className="w-full flex-1" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      ))}
    </div>
  );
}

/** In-panel placeholder: list rows (bills, order items). */
export function SkeletonRows({ count = 6, label = "Loading", className = "p-3" }: { count?: number; label?: string; className?: string }) {
  return (
    <div role="status" aria-busy="true" className={`w-full space-y-3 ${className}`}>
      <span className="sr-only">{label}</span>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-4 w-20 shrink-0" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}
