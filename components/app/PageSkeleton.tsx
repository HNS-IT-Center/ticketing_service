import { DataTable, type DataTableColumn } from "@/components/app/DataTable";
import { StatCardSkeleton } from "@/components/app/StatCard";
import { Skeleton } from "@/components/ui/skeleton";

type PageSkeletonProps = {
  /**
   * The shape of the page that is loading:
   * `dashboard` — header, stat cards, a table;
   * `list` — header, search and chips, a table;
   * `form` — header, one card of fields;
   * `report` — header, filters, stat cards, a table.
   */
  variant: "dashboard" | "list" | "form" | "report";
  /** Stat cards to draw (dashboard / report). */
  stats?: number;
  /** Table columns to draw; the phone cards follow the same count. */
  columns?: number;
  rows?: number;
};

function columnsOf(count: number): DataTableColumn<never>[] {
  return Array.from({ length: count }, (_, i) => ({
    key: String(i),
    header: "",
    cell: () => null,
    mobile: i === 0 ? "title" : i === count - 1 ? "badge" : "detail",
  }));
}

/**
 * A loading.tsx in one line: the same blocks, in the same places, as the page
 * that is on its way, so nothing jumps when it arrives. No clock, no data.
 */
export function PageSkeleton({ variant, stats = 4, columns = 5, rows = 6 }: PageSkeletonProps) {
  return (
    <div data-slot="page-skeleton" aria-busy="true" aria-label="Memuat" className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-52" />
          <Skeleton className="h-4 w-64" />
        </div>
        {variant !== "form" && <Skeleton className="h-11 w-full md:h-9 md:w-36" />}
      </div>

      {(variant === "list" || variant === "report") && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-11 w-full md:h-9" />
          <div className="flex flex-wrap gap-2">
            {[80, 64, 96, 72, 84].map((w) => (
              <Skeleton key={w} className="h-11 rounded-full md:h-8" style={{ width: w }} />
            ))}
          </div>
        </div>
      )}

      {(variant === "dashboard" || variant === "report") && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: stats }, (_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
      )}

      {variant === "form" ? (
        <div className="flex max-w-2xl flex-col gap-5 rounded-xl border border-border bg-card p-5">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-11 w-full md:h-9" />
            </div>
          ))}
          <Skeleton className="h-11 w-32 self-end md:h-9" />
        </div>
      ) : (
        <DataTable caption="Memuat" columns={columnsOf(columns)} rows={[]} getRowKey={() => ""} loading skeletonRows={rows} />
      )}
    </div>
  );
}
