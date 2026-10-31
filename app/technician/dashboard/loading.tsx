import { DataTable, type DataTableColumn } from "@/components/app/DataTable";
import { Skeleton } from "@/components/ui/skeleton";

// Same order as the dashboard: active tickets, available tickets, then the
// folded stats — so nothing jumps when the real page arrives.
const COLUMNS: DataTableColumn<never>[] = ["Ticket Code", "Type", "Customer", "Points", "Status"].map((header, i) => ({
  key: String(i),
  header,
  cell: () => null,
  mobile: i === 0 ? "title" : i === 4 ? "badge" : "detail",
}));

export default function TechnicianDashboardLoading() {
  return (
    <div data-slot="technician-dashboard-loading" aria-busy="true" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-44" />
        <DataTable caption="Loading" columns={COLUMNS} rows={[]} getRowKey={() => ""} loading skeletonRows={3} />
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-40" />
        <DataTable caption="Loading" columns={COLUMNS} rows={[]} getRowKey={() => ""} loading skeletonRows={3} />
      </div>
      <Skeleton className="h-12 w-full rounded-xl" />
    </div>
  );
}
