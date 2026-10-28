import { Skeleton } from "@/components/ui/skeleton";

function SkeletonCard({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={`flex flex-col gap-4 rounded-xl border border-border bg-card p-4 md:p-5 ${className ?? ""}`}>{children}</div>;
}

// Skeleton for the ticket detail page: header, then the info, notes and chat
// column beside the status column (stacked on a phone).
export default function TicketDetailLoading() {
  return (
    <div data-slot="ticket-detail-loading" aria-busy="true" className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
          <Skeleton className="h-4 w-28" />
        </div>
        <Skeleton className="h-11 w-full md:h-9 md:w-36" />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-6">
          <SkeletonCard>
            <Skeleton className="h-5 w-40" />
            <div className="grid grid-cols-2 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex flex-col gap-1.5">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-4 w-28" />
                </div>
              ))}
            </div>
          </SkeletonCard>
          <SkeletonCard>
            <Skeleton className="h-5 w-44" />
            {[80, 70, 60, 50].map((w) => (
              <Skeleton key={w} className="h-4" style={{ width: `${w}%` }} />
            ))}
          </SkeletonCard>
          <SkeletonCard className="min-h-72">
            <Skeleton className="h-5 w-24" />
            {[40, 60, 35, 55, 45].map((w, i) => (
              <div key={i} className={i % 2 === 0 ? "flex justify-start" : "flex justify-end"}>
                <Skeleton className="h-10 rounded-2xl" style={{ width: `${w}%` }} />
              </div>
            ))}
          </SkeletonCard>
        </div>
        <SkeletonCard>
          <Skeleton className="h-5 w-36" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-3 border-b border-border pb-3 last:border-b-0">
              <Skeleton className="h-6 w-16 rounded-full" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          ))}
        </SkeletonCard>
      </div>
    </div>
  );
}
