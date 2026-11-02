import { Skeleton } from "@/components/ui/skeleton";

const PODIUM = [
  { h: "h-[120px]", w: "w-[90px]" },
  { h: "h-[160px]", w: "w-[100px]" },
  { h: "h-[100px]", w: "w-[90px]" },
];

export default function Loading() {
  return (
    <div data-slot="leaderboard-loading" aria-busy="true" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-52" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-11 w-32 rounded-full md:h-8" />
        <Skeleton className="h-11 w-36 rounded-full md:h-8" />
      </div>
      <div className="flex items-end justify-center gap-4 py-6">
        {PODIUM.map((s, i) => (
          <div key={i} className="flex flex-col items-center gap-2">
            <Skeleton className="size-12 rounded-full" />
            <Skeleton className={`${s.w} ${s.h} rounded-t-lg rounded-b-none`} />
          </div>
        ))}
      </div>
      <div className="flex flex-col rounded-xl border border-border bg-card">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-4 border-b border-border p-3.5 last:border-b-0">
            <Skeleton className="h-4 w-8" />
            <Skeleton className="size-9 rounded-full" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-14" />
          </div>
        ))}
      </div>
    </div>
  );
}
