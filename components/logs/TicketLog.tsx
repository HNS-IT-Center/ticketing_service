import { db } from "@/lib/db";
import type { Prisma, TicketStatus } from "@prisma/client";
import { Activity } from "lucide-react";
import Link from "next/link";
import { DataTable, type DataTableColumn } from "@/components/app/DataTable";
import { EmptyState } from "@/components/app/EmptyState";
import { FilterBar, FilterBarField, FilterBarSearch } from "@/components/app/FilterBar";
import { PageHeader } from "@/components/app/PageHeader";
import { Pagination } from "@/components/app/Pagination";
import { PageSizePicker } from "@/components/app/PageSizePicker";
import { parsePageSize } from "@/lib/pagination";
import { StatusBadge } from "@/components/app/StatusBadge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AutoSubmitSelect } from "@/components/app/AutoSubmitSelect";
import { TICKET_STATUSES, isTicketStatus } from "@/lib/ticket-list-filter";
import { ticketStatusDisplay } from "@/lib/status-display";
import { readSort, sortValue } from "@/lib/table-sort";
import { formatDateTime } from "@/lib/utils";

const PAGE_SIZE = 25;

export async function TicketLog({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; date?: string; page?: string; per?: string; sort?: string }>;
}) {
  const params = await searchParams;

  const q = params.q || "";
  // Every progress a ticket can reach; anything else is ignored.
  const status = isTicketStatus(params.status ?? "") ? (params.status as TicketStatus) : "";
  const sortState = readSort(params.sort, ["ticket", "date", "changer", "activity"], { key: "date", dir: "desc" });
  const sortParam = sortValue(sortState) === "date_desc" ? "" : sortValue(sortState);
  const orderBy: Prisma.TicketStatusLogOrderByWithRelationInput[] =
    sortState.key === "ticket"
      ? [{ ticket: { ticket_code: sortState.dir } }, { created_at: "desc" }]
      : sortState.key === "changer"
        ? [{ changer: { name: sortState.dir } }, { created_at: "desc" }]
        : sortState.key === "activity"
          ? [{ new_status: sortState.dir }, { created_at: "desc" }]
          : [{ created_at: sortState.dir }];
  const date = params.date || "";
  const page = Math.max(1, parseInt(params.page || "1") || 1);
  const take = parsePageSize(params.per, PAGE_SIZE);
  const skip = (page - 1) * take;

  const where: Prisma.TicketStatusLogWhereInput = {};

  if (q) {
    where.OR = [
      { ticket: { ticket_code: { contains: q } } },
      { ticket: { customer_name: { contains: q } } },
      { ticket: { device_name: { contains: q } } },
      { changer: { name: { contains: q } } },
    ];
  }

  if (status) {
    // Typed now that `where` is no longer `any`; the value passes through as before.
    where.new_status = status;
  }

  if (date) {
    const startOfDay = new Date(date);
    const endOfDay = new Date(date);
    endOfDay.setDate(endOfDay.getDate() + 1);
    where.created_at = { gte: startOfDay, lt: endOfDay };
  }

  const [logs, total] = await Promise.all([
    db.ticketStatusLog.findMany({
      where,
      orderBy,
      take,
      skip,
      include: {
        ticket: { select: { ticket_code: true, technician_id: true } },
        changer: { select: { name: true } },
      },
    }),
    db.ticketStatusLog.count({ where }),
  ]);
  // How many changes reached each progress, under the other filters.
  const { new_status: _picked, ...otherFilters } = where;
  void _picked;
  const byStatus = await db.ticketStatusLog.groupBy({ by: ["new_status"], where: otherFilters, _count: { _all: true } });
  const reached = new Map(byStatus.map((b) => [b.new_status, b._count._all]));

  const totalPages = Math.ceil(total / take) || 1;


  const hrefForPage = (p: number, size: number = take, sort: string = sortParam) => {
    const qs = new URLSearchParams();
    if (q) qs.set("q", q);
    if (status) qs.set("status", status);
    if (date) qs.set("date", date);
    if (sort) qs.set("sort", sort);
    if (size !== PAGE_SIZE) qs.set("per", String(size));
    if (p > 1) qs.set("page", p.toString());
    const str = qs.toString();
    return `/logs?jenis=tiket${str ? `&${str}` : ""}`;
  };

  type Log = (typeof logs)[number];
  const columns: DataTableColumn<Log>[] = [
    {
      key: "ticket", sortKey: "ticket",
      header: "Ticket",
      mobile: "title",
      cell: (log) => (
        <span title={log.ticket.ticket_code} className="block max-w-32 truncate font-mono font-semibold text-primary">
          {log.ticket.ticket_code}
        </span>
      ),
    },
    {
      key: "date", sortKey: "date", sortFirst: "desc",
      header: "Date & Time",
      className: "whitespace-nowrap",
      cell: (log) => <span className="whitespace-nowrap">{formatDateTime(log.created_at)}</span>,
    },
    { key: "changer", sortKey: "changer", header: "User (Changer)", cell: (log) => <span className="font-medium">{log.changer.name}</span> },
    {
      key: "activity", sortKey: "activity",
      header: "Activity",
      cell: (log) => (
        <div className="flex flex-wrap items-center gap-1.5">
          {log.old_status && (
            <>
              <StatusBadge kind="ticket" status={log.old_status} hasTechnician={Boolean(log.ticket.technician_id)} size="sm" />
              <span aria-label="to" className="text-muted-foreground">→</span>
            </>
          )}
          <StatusBadge kind="ticket" status={log.new_status} hasTechnician={Boolean(log.ticket.technician_id)} size="sm" />
        </div>
      ),
    },
    {
      key: "reason",
      header: "Reason",
      className: "max-w-52",
      cell: (log) =>
        log.reason ? (
          <span title={log.reason} className="line-clamp-2">
            {log.reason}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ];

  return (
    // Built from components/app and shadcn only (the UI-1 reset rule).
    <div data-slot="admin-logs" className="flex flex-col gap-5">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Activity aria-hidden="true" className="size-6" /> System Logs
          </span>
        }
        description="Track all ticket status changes and activities across the platform."
      />

      <FilterBar action="/logs">
          <input type="hidden" name="jenis" value="tiket" />
        {take !== PAGE_SIZE && <input type="hidden" name="per" value={take} />}
        {sortParam && <input type="hidden" name="sort" value={sortParam} />}
        <FilterBarSearch label="Search logs" placeholder="Cari kode tiket, customer, nama barang, atau user…" defaultValue={q} />
        <div className="grid grid-cols-2 gap-2 md:contents">
          <FilterBarField label="Status" htmlFor="logs-status" className="md:w-44">
            <AutoSubmitSelect key={status} id="logs-status" name="status" defaultValue={status}>
              <option value="">Semua progres</option>
              {TICKET_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {ticketStatusDisplay(s).label} ({reached.get(s) ?? 0})
                </option>
              ))}
            </AutoSubmitSelect>
          </FilterBarField>
          <FilterBarField label="Date" htmlFor="logs-date" className="md:w-44">
            <Input id="logs-date" type="date" name="date" defaultValue={date} className="bg-card" />
          </FilterBarField>
        </div>
        <div className="flex gap-2 *:flex-1 md:*:flex-none">
          <Button type="submit">Filter</Button>
          {(q || status || date) && (
            <Link href="/logs?jenis=tiket" className={buttonVariants({ variant: "ghost" })}>
              Clear
            </Link>
          )}
        </div>
      </FilterBar>

      <DataTable
        caption="Ticket status changes"
        sort={{ state: sortState, href: (st) => hrefForPage(1, take, sortValue(st) === "date_desc" ? "" : sortValue(st)) }}
        columns={columns}
        rows={logs}
        getRowKey={(log) => log.id}
        rowHref={(log) => `/admin/tickets/${log.ticket_id}`}
        empty={<EmptyState icon={Activity} title="No logs found matching your criteria." />}
      />

      <div className="flex flex-col gap-2">
        {totalPages > 1 && (
          <Pagination
            page={page}
            pageCount={totalPages}
            hrefForPage={(p) => hrefForPage(p)}
            labels={{ previous: "Prev", next: "Next", pageOf: (p, n) => `Page ${p} of ${n}` }}
            className="sm:justify-center"
          />
        )}
        <PageSizePicker value={take} totalItems={total} hrefForSize={(n) => hrefForPage(1, n)} className="self-center sm:self-end" />
      </div>
    </div>
  );
}
