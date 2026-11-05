import { requireRole } from "@/lib/session";
import { db } from "@/lib/db";
import Link from "next/link";
import { DataTable, type DataTableColumn } from "@/components/app/DataTable";
import { EmptyState } from "@/components/app/EmptyState";
import { FilterBar, FilterBarSearch } from "@/components/app/FilterBar";
import { FilterChips } from "@/components/app/FilterChips";
import { PageHeader } from "@/components/app/PageHeader";
import { Pagination } from "@/components/app/Pagination";
import { PageSizePicker } from "@/components/app/PageSizePicker";
import { parsePageSize } from "@/lib/pagination";
import { StatusBadge } from "@/components/app/StatusBadge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TECHNICIAN_TICKET_FILTERS, ticketListWhere, ticketSearchWhere } from "@/lib/ticket-list-filter";
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

  const where = {
    ...technicianWhere,
    // Chip → filter lives in lib/ticket-list-filter.ts, shared with the admin
    // list so the same chip cannot mean two things.
    ...ticketListWhere(statusFilter),
    // Shared with the admin list: code, customer, or the unit / parts.
    ...ticketSearchWhere(query),
  };

  const STATUS_PRIORITY: Record<string, number> = {
    on_progress: 1,
    waiting: 2,
    ready_for_pickup: 3,
    waiting_pickup: 3,
    handed_to_courier: 3,
    done: 4,
    delivered: 5,
    completed: 6,
    cancelled: 7,
    rejected: 8,
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

  allTickets.sort((a, b) => {
    if (sortParam === "updated_desc") return b.updated_at.getTime() - a.updated_at.getTime();
    if (sortParam === "updated_asc") return a.updated_at.getTime() - b.updated_at.getTime();
    if (sortParam === "code_asc") return a.ticket_code.localeCompare(b.ticket_code);
    if (sortParam === "code_desc") return b.ticket_code.localeCompare(a.ticket_code);
    if (sortParam === "status_asc" || sortParam === "status_desc") {
      const res = a.status.localeCompare(b.status);
      return sortParam === "status_desc" ? -res : res;
    }
    // Default: priority sort
    const pA = STATUS_PRIORITY[a.status] || 99;
    const pB = STATUS_PRIORITY[b.status] || 99;
    if (pA !== pB) return pA - pB;
    return b.updated_at.getTime() - a.updated_at.getTime(); // secondary sort by latest updated
  });

  const totalCount = allTickets.length;
  const tickets = allTickets.slice(skip, skip + pageSize);

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

  const renderSortableHeader = (label: string, ascKey: string, descKey: string) => {
    const isActive = sortParam === ascKey || sortParam === descKey;
    const isAsc = sortParam === ascKey;
    const nextSort = isAsc ? descKey : ascKey;
    return (
      <Link
        href={buildHref(1, nextSort)}
        className="inline-flex items-center gap-1 rounded-sm text-inherit outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {label}
        {isActive ? (isAsc ? " ↑" : " ↓") : <span className="opacity-30"> ↕</span>}
      </Link>
    );
  };

  type ListTicket = (typeof tickets)[number];
  const columns: DataTableColumn<ListTicket>[] = [
    {
      key: "code",
      header: renderSortableHeader("Code", "code_asc", "code_desc"),
      mobileLabel: "Code",
      cell: (t) => <span title={t.ticket_code} className="block max-w-32 truncate font-mono">{t.ticket_code}</span>,
      mobile: "title",
    },
    { key: "type", header: "Type", cell: (t) => <span className="capitalize">{t.ticket_type.replace("_", " ")}</span>, className: "hidden xl:table-cell" },
    {
      key: "customer",
      header: "Customer",
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
      header: renderSortableHeader("Status", "status_asc", "status_desc"),
      mobileLabel: "Status",
      // `rma_process` is one ticket status covering nine RMA ones; the list
      // shows the informative one. See lib/rma/ticket-status-badge.ts.
      cell: (t) => (
        <StatusBadge {...ticketBadgeChoice(t.status, t.rma_case?.status)} hasTechnician={Boolean(t.technician_id)} size="sm" />
      ),
      mobile: "badge",
    },
    {
      key: "updated",
      header: renderSortableHeader("Updated", "updated_asc", "updated_desc"),
      mobileLabel: "Updated",
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

  const chips = TECHNICIAN_TICKET_FILTERS.map(({ key: s, label }) => {
    const qs = new URLSearchParams();
    if (s !== "all") qs.set("status", s);
    if (query) qs.set("q", query);
    if (sortParam !== "priority") qs.set("sort", sortParam);
    if (pageSize !== PAGE_SIZE) qs.set("per", String(pageSize));
    const str = qs.toString();
    return { key: s, label, href: `/technician/tickets${str ? `?${str}` : ""}` };
  });

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
          {statusFilter !== "all" && <input type="hidden" name="status" value={statusFilter} />}
          {sortParam !== "priority" && <input type="hidden" name="sort" value={sortParam} />}
          {pageSize !== PAGE_SIZE && <input type="hidden" name="per" value={pageSize} />}
          <FilterBarSearch label="Search tickets" placeholder="Cari kode, customer, atau nama barang…" defaultValue={query} />
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
        <FilterChips label="Status" chips={chips} active={statusFilter} />
      </div>

      <DataTable
        caption={isCoordinator ? "Store Tickets" : "My Tickets"}
        columns={columns}
        rows={tickets}
        getRowKey={(t) => t.id}
        rowHref={(t) => `/technician/tickets/${t.id}`}
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
