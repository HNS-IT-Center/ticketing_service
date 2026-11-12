import { requirePage } from "@/lib/page-access";
import { storeScopeFor, storeWhere } from "@/lib/store-scope-server";
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
import {
  DEFAULT_TICKET_SORT,
  DEFAULT_TICKET_SORT_STATE,
  TICKET_SORT_KEYS,
  statusCounts,
  ticketListOrderBy,
  ticketListWhere,
  ticketProgressOptions,
  ticketSearchWhere,
} from "@/lib/ticket-list-filter";
import { readSort, sortValue } from "@/lib/table-sort";
import { relativeTimeId } from "@/lib/ticket-recency";
import RecencyCode from "@/components/tickets/RecencyCode";
import { ticketBadgeChoice } from "@/lib/rma/ticket-status-badge";
import { FileSpreadsheet, Plus, Ticket } from "lucide-react";
import { ticketPartyName } from "@/lib/ticket-party";

export const metadata = { title: "All Tickets — HNS IT Center" };
const PAGE_SIZE = 10;

export default async function AdminTicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string; sort?: string; per?: string }>;
}) {
  const session = await requirePage("page_tickets_all");
  const params = await searchParams;
  const statusFilter = params.status || "all";
  const query = params.q || "";
  const page = Math.max(1, parseInt(params.page || "1") || 1);
  const pageSize = parsePageSize(params.per, PAGE_SIZE);
  const skip = (page - 1) * pageSize;
  const sortState = readSort(params.sort, TICKET_SORT_KEYS, DEFAULT_TICKET_SORT_STATE);
  const sortParam = sortValue(sortState);
  // One clock for the whole render, so every "x jam lalu" agrees.
  const now = new Date();

  // A kepala toko granted this page sees the stores they hold.
  const scope = await storeScopeFor(session);
  // Everything but the progress, for the dropdown's counts.
  const baseWhere = { ...storeWhere(scope), ...ticketSearchWhere(query) };
  const where = {
    ...storeWhere(scope),
    // Chip → filter lives in lib/ticket-list-filter.ts so the admin and
    // technician lists cannot offer the same chip and mean different things.
    ...ticketListWhere(statusFilter),
    ...ticketSearchWhere(query),
  };
  const orderBy = ticketListOrderBy(sortParam);

  const [tickets, totalCount] = await Promise.all([
    db.ticket.findMany({
      where,
      orderBy,
      take: pageSize,
      skip,
      include: {
        user: { select: { name: true } },
        technician: { select: { name: true } },
        // `rma_process` is one ticket status covering nine RMA ones; the list
        // shows the informative one. See lib/rma/ticket-status-badge.ts.
        rma_case: { select: { status: true } },
        // When the status last moved, for the "Update" mark.
        status_logs: { orderBy: { created_at: "desc" }, take: 1, select: { created_at: true } },
      },
    }),
    db.ticket.count({ where }),
  ]);
  const [byStatus, unassigned, claims] = await Promise.all([
    db.ticket.groupBy({ by: ["status"], where: baseWhere, _count: { _all: true } }),
    db.ticket.count({ where: { ...baseWhere, technician_id: null } }),
    db.ticket.count({ where: { ...baseWhere, ticket_type: "warranty_claim" } }),
  ]);
  const progressOptions = ticketProgressOptions(statusCounts(byStatus), { unassigned, warrantyClaim: claims });

  const totalPages = Math.ceil(totalCount / pageSize);

  const buildHref = (p: number, currentSort: string = sortParam, size: number = pageSize) => {
    const qs = new URLSearchParams();
    if (statusFilter !== "all") qs.set("status", statusFilter);
    if (query) qs.set("q", query);
    if (currentSort !== DEFAULT_TICKET_SORT) qs.set("sort", currentSort);
    if (size !== PAGE_SIZE) qs.set("per", String(size));
    if (p > 1) qs.set("page", String(p));
    const str = qs.toString();
    return `/admin/tickets${str ? `?${str}` : ""}`;
  };


  type ListTicket = (typeof tickets)[number];
  const columns: DataTableColumn<ListTicket>[] = [
    {
      key: "code",
      header: "Code",
      sortKey: "code",
      cell: (t) => <RecencyCode ticket={t} now={now} />,
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
      key: "technician",
      header: "Technician",
      sortKey: "technician",
      // "Unassigned" was var(--accent) — near-white since the shadcn init.
      cell: (t) => t.technician?.name ?? <span className="text-sm font-medium text-destructive">Unassigned</span>,
      className: "text-muted-foreground",
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
      key: "date",
      header: "Update terakhir",
      sortKey: "updated",
      sortFirst: "desc",
      cell: (t) => {
        const last = t.status_logs[0]?.created_at ?? t.updated_at;
        return (
          <span className="flex flex-col whitespace-nowrap">
            <span>{relativeTimeId(last > t.updated_at ? last : t.updated_at, now)}</span>
            <span className="text-[0.7rem]">dibuat {new Date(t.created_at).toLocaleDateString("id-ID")}</span>
          </span>
        );
      },
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

  // The export carries the same filter, search and sort as the list, all pages.
  const exportQs = new URLSearchParams();
  if (statusFilter !== "all") exportQs.set("status", statusFilter);
  if (query) exportQs.set("q", query);
  if (sortParam !== DEFAULT_TICKET_SORT) exportQs.set("sort", sortParam);
  const exportHref = `/admin/tickets/export${exportQs.size ? `?${exportQs}` : ""}`;


  return (
    // Built from components/app and shadcn only, so the page opts into
    // Tailwind spacing with a data-slot (the UI-1 reset rule).
    <div data-slot="admin-tickets" className="flex flex-col gap-5">
      <PageHeader
        title="All Tickets"
        description={`${totalCount} ticket${totalCount !== 1 ? "s" : ""}`}
        actions={
          <>
            {/* A plain <a>: a file download, not a page for the router to prefetch.
                The export checks the same page permission as this list. */}
            <a
              href={exportHref}
              download
              className={buttonVariants({ variant: "outline" })}
              title="Semua tiket yang cocok dengan filter dan pencarian ini, bukan hanya halaman ini"
            >
              <FileSpreadsheet aria-hidden="true" /> Export Excel
            </a>
            {/* Everyone else creates tickets from their own portal's form. */}
            {session.role === "Administrator" && (
              <Link href="/admin/tickets/create" className={buttonVariants()}>
                <Plus aria-hidden="true" /> New Ticket
              </Link>
            )}
          </>
        }
      />

      <div className="flex flex-col gap-3">
        <FilterBar action="/admin/tickets">
          {sortParam !== DEFAULT_TICKET_SORT && <input type="hidden" name="sort" value={sortParam} />}
          {pageSize !== PAGE_SIZE && <input type="hidden" name="per" value={pageSize} />}
          <FilterBarSearch label="Search tickets" placeholder="Cari kode, customer, atau nama barang…" defaultValue={query} />
          <ProgressSelect id="admin-progress" options={progressOptions} value={statusFilter} />
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
        caption="All Tickets"
        columns={columns}
        rows={tickets}
        getRowKey={(t) => t.id}
        rowHref={(t) => `/admin/tickets/${t.id}`}
        sort={{ state: sortState, href: (s) => buildHref(1, sortValue(s)) }}
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
