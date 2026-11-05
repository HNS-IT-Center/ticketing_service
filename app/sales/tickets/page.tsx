import { requireRole } from "@/lib/session";
import { db } from "@/lib/db";
import type { TicketStatus } from "@prisma/client";
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
import { Ticket, Plus } from "lucide-react";
import { ticketPartyName } from "@/lib/ticket-party";
import { ticketSearchWhere } from "@/lib/ticket-list-filter";

function getTicketPoints(type: string, deviceType?: string | null, extraServices?: string[]): number {
  let base = 2;
  if (type === "pc_build") base = 4;
  else if (type === "service") base = 5;
  else if (type === "cleaning" && deviceType === "PC_Gaming") base = 4;
  return base + (extraServices?.length ?? 0) * 3;
}

export const metadata = { title: "My Tickets — HNS IT Center" };

const STATUS_FILTERS = ["all", "waiting", "on_progress", "done", "cancelled"] as const;
const PAGE_SIZE = 10;

export default async function SalesTicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string; sort?: string; per?: string }>;
}) {
  const session = await requireRole("Sales", "Administrator");
  const params = await searchParams;
  const statusFilter = params.status || "all";
  const query = params.q || "";
  const page = Math.max(1, parseInt(params.page || "1") || 1);
  const pageSize = parsePageSize(params.per, PAGE_SIZE);
  const skip = (page - 1) * pageSize;
  const sortParam = params.sort || "priority";

  const where = {
    sales_id: session.userId,
    ...(statusFilter !== "all" ? { status: statusFilter as TicketStatus } : {}),
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
    return `/sales/tickets${str ? `?${str}` : ""}`;
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
      cell: (t) => <StatusBadge kind="ticket" status={t.status} hasTechnician={Boolean(t.technician_id)} size="sm" />,
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

  const chips = STATUS_FILTERS.map((s) => {
    const qs = new URLSearchParams();
    if (s !== "all") qs.set("status", s);
    if (query) qs.set("q", query);
    if (sortParam !== "priority") qs.set("sort", sortParam);
    if (pageSize !== PAGE_SIZE) qs.set("per", String(pageSize));
    const str = qs.toString();
    const label = s === "all" ? "All" : s.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
    return { key: s, label, href: `/sales/tickets${str ? `?${str}` : ""}` };
  });

  return (
    // Built from components/app and shadcn only (the UI-1 reset rule).
    <div data-slot="sales-tickets" className="flex flex-col gap-5">
      <PageHeader
        title="My Tickets"
        description="Manage tickets created by you"
        actions={
          <Link href="/sales/tickets/create" className={buttonVariants()}>
            <Plus aria-hidden="true" /> New Ticket
          </Link>
        }
      />

      <div className="flex flex-col gap-3">
        <FilterBar action="/sales/tickets">
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
        caption="My Tickets"
        columns={columns}
        rows={tickets}
        getRowKey={(t) => t.id}
        rowHref={(t) => `/sales/tickets/${t.id}`}
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
