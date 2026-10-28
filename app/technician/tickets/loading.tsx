import { DataTable, type DataTableColumn } from "@/components/app/DataTable";
import { Skeleton } from "@/components/ui/skeleton";

// Skeleton for the ticket list: header, search, status chips, then the table
// (cards on a phone) in the same places the real list draws them.
const COLUMNS: DataTableColumn<never>[] = ["Code", "Type", "Customer", "Points", "Status", "Updated"].map((header, i) => ({
  key: String(i),
  header,
  cell: () => null,
  mobile: i === 0 ? "title" : i === 4 ? "badge" : "detail",
}));

export default function TicketListLoading() {
  return (
    <div data-slot="technician-tickets-loading" aria-busy="true" className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-11 w-full md:h-9 md:w-32" />
      </div>
      <Skeleton className="h-11 w-full md:h-9" />
      <div className="flex flex-wrap gap-2">
        {[80, 60, 90, 60, 80, 80].map((w, i) => (
          <Skeleton key={i} className="h-11 rounded-full md:h-8" style={{ width: w }} />
        ))}
      </div>
      <DataTable caption="Loading" columns={COLUMNS} rows={[]} getRowKey={() => ""} loading skeletonRows={8} />
    </div>
  );
}
