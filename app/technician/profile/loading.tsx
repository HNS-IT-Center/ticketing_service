import { StatCardSkeleton } from "@/components/app/StatCard";
import { Skeleton } from "@/components/ui/skeleton";

// Skeleton for the technician profile: header, stats, then the form card.
export default function Loading() {
  return (
    <div data-slot="profile-loading" aria-busy="true" className="flex w-full max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-4 w-60" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>

      <div className="flex flex-col gap-5 rounded-xl border border-border bg-card p-5">
        <Skeleton className="h-5 w-36" />
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-11 w-full md:h-10" />
          </div>
        ))}
        <Skeleton className="h-11 w-32 self-end md:h-10" />
      </div>
    </div>
  );
}
