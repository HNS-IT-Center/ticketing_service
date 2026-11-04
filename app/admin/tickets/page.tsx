import { requireRole } from "@/lib/session";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { DataTable, type DataTableColumn } from "@/components/app/DataTable";
import { EmptyState } from "@/components/app/EmptyState";
import { FilterBar, FilterBarSearch } from "@/components/app/FilterBar";
import { FilterChips } from "@/components/app/FilterChips";
import { PageHeader } from "@/components/app/PageHeader";
import { Pagination } from "@/components/app/Pagination";
import { StatusBadge } from "@/components/app/StatusBadge";
import { Button, buttonVariants } from "@/components/ui/button";
import { ADMIN_TICKET_FILTERS, ticketListWhere } from "@/lib/ticket-list-filter";
import { ticketBadgeChoice } from "@/lib/rma/ticket-status-badge";
import { Plus, Ticket } from "lucide-react";
import { ticketPartyName } from "@/lib/ticket-party";

export const metadata = { title: "All Tickets — HNS IT Center" };
const PAGE_SIZE = 10;

export default async function AdminTicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string; sort?: string }>;
}) {
  const session = await requireRole("Administrator", "Sales");
  const params = await searchParams;
  const statusFilter = params.status || "all";
  const query = params.q || "";
  const page = Math.max(1, parseInt(params.page || "1") || 1);
  const skip = (page - 1) * PAGE_SIZE;
  const sortParam = params.sort || "created_desc";

  const where = {
    ...(session.role === "Sales" ? { sales_id: session.userId } : {}),
    // Chip → filter lives in lib/ticket-list-filter.ts so the admin and
    // technician lists cannot offer the same chip and mean different things.
    ...ticketListWhere(statusFilter),
    ...(query
      ? {
          OR: [
            { ticket_code: { contains: query } },
            { user: { name: { contains: query } } },
            { customer_name: { contains: query } },
          ],
        }
      : {}),
  };

  let orderBy: Prisma.TicketOrderByWithRelationInput = { created_at: "desc" };
  if (sortParam === "created_asc") orderBy = { created_at: "asc" };
  else if (sortParam === "status_asc") orderBy = { status: "asc" };
  else if (sortParam === "status_desc") orderBy = { status: "desc" };
  else if (sortParam === "code_asc") orderBy = { ticket_code: "asc" };
  else if (sortParam === "code_desc") orderBy = { ticket_code: "desc" };

  const [tickets, totalCount] = await Promise.all([
    db.ticket.findMany({
      where,
      orderBy,
      take: PAGE_SIZE,
      skip,
      include: {
        user: { select: { name: true } },
        technician: { select: { name: true } },
        // `rma_process` is one ticket status covering nine RMA ones; the list
        // shows the informative one. See lib/rma/ticket-status-badge.ts.
        rma_case: { select: { status: true } },
      },
    }),
    db.ticket.count({ where }),
  ]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const buildHref = (p: number, currentSort: string = sortParam) => {
    const qs = new URLSearchParams();
    if (statusFilter !== "all") qs.set("status", statusFilter);
    if (query) qs.set("q", query);
    if (currentSort !== "created_desc") qs.set("sort", currentSort);
    if (p > 1) qs.set("page", String(p));
    const str = qs.toString();
    return `/admin/tickets${str ? `?${str}` : ""}`;
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
      key: "technician",
      header: "Technician",
      // "Unassigned" was var(--accent) — near-white since the shadcn init.
      cell: (t) => t.technician?.name ?? <span className="text-sm font-medium text-destructive">Unassigned</span>,
      className: "text-muted-foreground",
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
      key: "date",
      header: renderSortableHeader("Date", "created_asc", "created_desc"),
      mobileLabel: "Date",
      cell: (t) => new Date(t.created_at).toLocaleDateString("id-ID"),
      className: "whitespace-nowrap text-muted-foreground",
    },
    {
      key: "view",
      header: "",
      cell: () => <span className="text-sm font-medium text-primary">View →</span>,
      className: "hidden text-right xl:table-cell",
      mobile: "hidden",
    },
  ];

  const chips = ADMIN_TICKET_FILTERS.map(({ key: s, label }) => {
    const qs = new URLSearchParams();
    if (s !== "all") qs.set("status", s);
    if (query) qs.set("q", query);
    if (sortParam !== "created_desc") qs.set("sort", sortParam);
    const str = qs.toString();
    return { key: s, label, href: `/admin/tickets${str ? `?${str}` : ""}` };
  });

  return (
    // Built from components/app and shadcn only, so the page opts into
    // Tailwind spacing with a data-slot (the UI-1 reset rule).
    <div data-slot="admin-tickets" className="flex flex-col gap-5">
      <PageHeader
        title="All Tickets"
        description={`${totalCount} ticket${totalCount !== 1 ? "s" : ""}`}
        actions={
          <Link href="/admin/tickets/create" className={buttonVariants()}>
            <Plus aria-hidden="true" /> New Ticket
          </Link>
        }
      />

      <div className="flex flex-col gap-3">
        <FilterBar action="/admin/tickets">
          {statusFilter !== "all" && <input type="hidden" name="status" value={statusFilter} />}
          {sortParam !== "created_desc" && <input type="hidden" name="sort" value={sortParam} />}
          <FilterBarSearch label="Search tickets" placeholder="Search by code or customer..." defaultValue={query} />
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
        caption="All Tickets"
        columns={columns}
        rows={tickets}
        getRowKey={(t) => t.id}
        rowHref={(t) => `/admin/tickets/${t.id}`}
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
        <p className="text-center text-[0.8125rem] text-muted-foreground">
          Showing {tickets.length > 0 ? skip + 1 : 0}–{Math.min(skip + tickets.length, totalCount)} of {totalCount} tickets
        </p>
      </div>
    </div>
  );
}
