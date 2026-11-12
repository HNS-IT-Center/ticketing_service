import { requireRole } from "@/lib/session";
import { db } from "@/lib/db";
import Link from "next/link";
import { DataTable, type DataTableColumn } from "@/components/app/DataTable";
import { EmptyState } from "@/components/app/EmptyState";
import { FilterBar, FilterBarSearch } from "@/components/app/FilterBar";
import { ProgressSelect } from "@/components/app/ProgressSelect";
import { PageHeader } from "@/components/app/PageHeader";
import { Pagination } from "@/components/app/Pagination";
import { PageSizePicker } from "@/components/app/PageSizePicker";
import { parsePageSize } from "@/lib/pagination";
import { StatusBadge } from "@/components/app/StatusBadge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { memorySortState, sortTicketsInMemory, statusCounts, ticketListWhere, ticketProgressOptions, ticketSearchWhere } from "@/lib/ticket-list-filter";
import { sortValue } from "@/lib/table-sort";
import { ticketBadgeChoice } from "@/lib/rma/ticket-status-badge";
import { Ticket, Plus } from "lucide-react";
import { ticketPartyName } from "@/lib/ticket-party";

function getTicketPoints(type: string, deviceType?: string | null, extraServices?: string[]): number {
  let base = 2;
  if (type === "pc_build") base = 4;
  else if (type === "service") base = 5;
  else if (type === "cleaning" && deviceType === "PC_Gaming") base = 4;
  return base + (extraServices?.length ?? 0) * 3;
}

export const metadata = { title: "My Tickets — HNS IT Center" };

const PAGE_SIZE = 10;

export default async function TechnicianTicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string; sort?: string; per?: string }>;
}) {
  const session = await requireRole("Technician");
  const params = await searchParams;
  const statusFilter = params.status || "all";
  const query = params.q || "";
  const page = Math.max(1, parseInt(params.page || "1") || 1);
  const pageSize = parsePageSize(params.per, PAGE_SIZE);
  const skip = (page - 1) * pageSize;
  const sortParam = params.sort || "priority";

  // If coordinator, show all tickets in their stores; otherwise own tickets only
  const currentUser = await db.user.findUnique({
    where: { id: session.userId },
    select: { is_team_leader: true },
  });
  const isCoordinator = currentUser?.is_team_leader ?? false;

  let technicianWhere: object = { technician_id: session.userId };
  if (isCoordinator) {
    const assignments = await db.technicianStoreAssignment.findMany({
      where: { technician_id: session.userId },
      select: { store_id: true },
    });
    const storeIds = assignments.map((a) => a.store_id);
    technicianWhere = storeIds.length > 0
      ? { store_location_id: { in: storeIds } }
      : {}; // no store → empty fallback
  }

  // Everything but the progress, for the dropdown's counts.
  const baseWhere = { ...technicianWhere, ...ticketSearchWhere(query) };
  const where = {
    ...technicianWhere,
    // Chip → filter lives in lib/ticket-list-filter.ts, shared with the admin
    // list so the same chip cannot mean two things.
    ...ticketListWhere(statusFilter),
    // Shared with the admin list: code, customer, or the unit / parts.
    ...ticketSearchWhere(query),
  };


  const allTickets = await db.ticket.findMany({
    where,
    select: {
      id: true, ticket_code: true, ticket_type: true, device_type: true,
      status: true, technician_id: true, is_for_self: true, customer_name: true,
      updated_at: true, extra_services: true,
      user: { select: { name: true } },
      // `rma_process` is one ticket status covering nine RMA ones; the list
      // shows the informative one. See lib/rma/ticket-status-badge.ts.
      rma_case: { select: { status: true } },
    },
  });

  const [byStatus, claimCount] = await Promise.all([
    db.ticket.groupBy({ by: ["status"], where: baseWhere, _count: { _all: true } }),
    db.ticket.count({ where: { ...baseWhere, ticket_type: "warranty_claim" } }),
  ]);
  const progressOptions = ticketProgressOptions(statusCounts(byStatus), { warrantyClaim: claimCount });

  // Any column ascending or descending; by default what needs hands first.
  const sorted = sortTicketsInMemory(allTickets, sortParam, {
    points: (t) => getTicketPoints(t.ticket_type, t.device_type, t.extra_services as string[]),
  });

  const totalCount = allTickets.length;
  const tickets = sorted.slice(skip, skip + pageSize);

  const totalPages = Math.ceil(totalCount / pageSize);

  const buildHref = (p: number, currentSort: string = sortParam, size: number = pageSize) => {
    const qs = new URLSearchParams();
    if (statusFilter !== "all") qs.set("status", statusFilter);
    if (query) qs.set("q", query);
    if (currentSort !== "priority") qs.set("sort", currentSort);
    if (size !== PAGE_SIZE) qs.set("per", String(size));
    if (p > 1) qs.set("page", String(p));
    const str = qs.toString();
    return `/technician/tickets${str ? `?${str}` : ""}`;
  };


  type ListTicket = (typeof tickets)[number];
  const columns: DataTableColumn<ListTicket>[] = [
    {
      key: "code",
      header: "Code",
      sortKey: "code",
      cell: (t) => <span title={t.ticket_code} className="block max-w-32 truncate font-mono">{t.ticket_code}</span>,
      mobile: "title",
    },
    { key: "type", header: "Type", sortKey: "type", cell: (t) => <span className="capitalize">{t.ticket_type.replace("_", " ")}</span>, className: "hidden xl:table-cell" },
    {
      key: "customer",
      header: "Customer",
      sortKey: "customer",
      cell: (t) => (
        <span className="flex flex-col">
          <span className="font-medium">{ticketPartyName(t)}</span>
          {!t.is_for_self && <span className="text-[0.7rem] text-muted-foreground">(For Others)</span>}
        </span>
      ),
    },
    {
      key: "points",
      header: "Points",
      sortKey: "points",
      sortFirst: "desc",
      cell: (t) => {
        const pts = getTicketPoints(t.ticket_type, t.device_type, t.extra_services as string[]);
        const hasExtra = (t.extra_services as string[])?.length > 0;
        return (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold whitespace-nowrap",
              pts >= 5
                ? "border-tone-amber-border bg-tone-amber-bg text-tone-amber-fg"
                : pts >= 4
                ? "border-tone-violet-border bg-tone-violet-bg text-tone-violet-fg"
                : "border-tone-blue-border bg-tone-blue-bg text-tone-blue-fg",
            )}
          >
            ⭐ {pts} pts{hasExtra && <span className="text-[0.68rem] font-normal opacity-70"> (+extra)</span>}
          </span>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      sortKey: "status",
      // `rma_process` is one ticket status covering nine RMA ones; the list
      // shows the informative one. See lib/rma/ticket-status-badge.ts.
      cell: (t) => (
        <StatusBadge {...ticketBadgeChoice(t.status, t.rma_case?.status)} hasTechnician={Boolean(t.technician_id)} size="sm" />
      ),
      mobile: "badge",
    },
    {
      key: "updated",
      header: "Updated",
      sortKey: "updated",
      sortFirst: "desc",
      cell: (t) => new Date(t.updated_at).toLocaleDateString("id-ID"),
      className: "whitespace-nowrap text-muted-foreground",
    },
    {
      key: "manage",
      header: "",
      cell: () => <span className="text-sm font-medium text-primary">Manage →</span>,
      className: "hidden text-right xl:table-cell",
      mobile: "hidden",
    },
  ];


  return (
    // Built from components/app and shadcn only, so the page opts into
    // Tailwind spacing with a data-slot (the UI-1 reset rule).
    <div data-slot="technician-tickets" className="flex flex-col gap-5">
      <PageHeader
        title={isCoordinator ? "Store Tickets" : "My Tickets"}
        description={isCoordinator ? "All tickets in your assigned stores" : "Manage tickets assigned to you"}
        actions={
          <Link href="/technician/tickets/create" className={buttonVariants()}>
            <Plus aria-hidden="true" /> New Ticket
          </Link>
        }
      />

      <div className="flex flex-col gap-3">
        <FilterBar action="/technician/tickets">
          {sortParam !== "priority" && <input type="hidden" name="sort" value={sortParam} />}
          {pageSize !== PAGE_SIZE && <input type="hidden" name="per" value={pageSize} />}
          <FilterBarSearch label="Search tickets" placeholder="Cari kode, customer, atau nama barang…" defaultValue={query} />
          <ProgressSelect id="list-progress" options={progressOptions} value={statusFilter} />
          <div className="flex gap-2 *:flex-1 md:*:flex-none">
            <Button type="submit">Search</Button>
            {query && (
              <Link
                href={buildHref(1, sortParam).replace(`q=${encodeURIComponent(query)}`, "").replace("&&", "&").replace("?&", "?")}
                className={buttonVariants({ variant: "ghost" })}
              >
                Clear
              </Link>
            )}
          </div>
        </FilterBar>
      </div>

      <DataTable
        caption={isCoordinator ? "Store Tickets" : "My Tickets"}
        columns={columns}
        rows={tickets}
        getRowKey={(t) => t.id}
        rowHref={(t) => `/technician/tickets/${t.id}`}
        sort={{ state: memorySortState(sortParam), href: (st) => buildHref(1, sortValue(st)) }}
        empty={<EmptyState icon={Ticket} title="No tickets found" />}
      />

      <div className="flex flex-col gap-2">
        {totalPages > 1 && (
          <Pagination
            page={page}
            pageCount={totalPages}
            hrefForPage={(p) => buildHref(p)}
            labels={{ previous: "Prev", next: "Next", pageOf: (p, n) => `Page ${p} of ${n}` }}
            className="sm:justify-center"
          />
        )}
        <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
          <p className="text-center text-[0.8125rem] text-muted-foreground">
            Showing {tickets.length > 0 ? skip + 1 : 0}–{Math.min(skip + tickets.length, totalCount)} of {totalCount} tickets
          </p>
          <PageSizePicker value={pageSize} totalItems={totalCount} hrefForSize={(n) => buildHref(1, sortParam, n)} />
        </div>
      </div>
    </div>
  );
}
