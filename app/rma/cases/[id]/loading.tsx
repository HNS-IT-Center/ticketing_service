import { Skeleton } from "@/components/ui/skeleton";

// Breadcrumb and title, then the case and its history beside the action
// panel (stacked on a phone) — the case page's frame.
export default function Loading() {
  return (
    <div data-slot="rma-case-loading" aria-busy="true" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2.5">
        <Skeleton className="h-3 w-36" />
        <Skeleton className="h-7 w-64 max-w-full" />
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-6">
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    </div>
  );
}
