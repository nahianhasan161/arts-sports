import { Skeleton } from "@/components/ui/skeleton";
import { ProductGridSkeleton, ChipSkeletons } from "@/components/shop/Skeletons";

export default function ShopLoading() {
  return (
    <div className="w-full pb-space-3xl" role="status" aria-busy="true">
      <span className="sr-only">Loading</span>
      <div className="max-w-container-max mx-auto px-space-base py-space-md space-y-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-64" />
        <div className="flex gap-1.5 overflow-hidden">
          <ChipSkeletons count={8} />
        </div>
      </div>
      <div className="max-w-container-max mx-auto px-space-base py-space-lg flex gap-space-xl">
        <Skeleton className="hidden lg:block w-[280px] h-[500px] shrink-0" />
        <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-space-sm sm:gap-space-md">
          <ProductGridSkeleton count={8} />
        </div>
      </div>
    </div>
  );
}
