import { Skeleton } from "@/components/ui/skeleton";

// Header, the summary numbers, then queue cards two abreast — the dashboard's
// own frame, so nothing jumps when it arrives.
export default function Loading() {
  return (
    <div data-slot="rma-dashboard-loading" aria-busy="true" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 md:p-5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-7 w-12" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1].map((section) => (
          <div key={section} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 md:p-5">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-64 max-w-full" />
            {[0, 1, 2].map((row) => (
              <div key={row} className="flex items-center justify-between gap-3 border-t border-border pt-3">
                <div className="flex flex-col gap-1.5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
