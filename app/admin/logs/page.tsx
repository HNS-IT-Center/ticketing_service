import { requireRole } from "@/lib/session";
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
import { NativeSelect } from "@/components/ui/native-select";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Logs — HNS IT Center" };

const PAGE_SIZE = 25;

export default async function AdminLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; date?: string; page?: string; per?: string }>;
}) {
  await requireRole("Administrator");
  const params = await searchParams;

  const q = params.q || "";
  const status = params.status || "";
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
    where.new_status = status as TicketStatus;
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
      orderBy: { created_at: "desc" },
      take,
      skip,
      include: {
        ticket: { select: { ticket_code: true, technician_id: true } },
        changer: { select: { name: true } },
      },
    }),
    db.ticketStatusLog.count({ where }),
  ]);

  const totalPages = Math.ceil(total / take) || 1;

  const STATUSES = [
    "waiting",
    "on_progress",
    "done",
    "cancelled",
    "rejected",
  ];

  const hrefForPage = (p: number, size: number = take) => {
    const qs = new URLSearchParams();
    if (q) qs.set("q", q);
    if (status) qs.set("status", status);
    if (date) qs.set("date", date);
    if (size !== PAGE_SIZE) qs.set("per", String(size));
    if (p > 1) qs.set("page", p.toString());
    const str = qs.toString();
    return `/admin/logs${str ? `?${str}` : ""}`;
  };

  type Log = (typeof logs)[number];
  const columns: DataTableColumn<Log>[] = [
    {
      key: "ticket",
      header: "Ticket",
      mobile: "title",
      cell: (log) => (
        <span title={log.ticket.ticket_code} className="block max-w-32 truncate font-mono font-semibold text-primary">
          {log.ticket.ticket_code}
        </span>
      ),
    },
    {
      key: "date",
      header: "Date & Time",
      className: "whitespace-nowrap",
      cell: (log) => <span className="whitespace-nowrap">{formatDateTime(log.created_at)}</span>,
    },
    { key: "changer", header: "User (Changer)", cell: (log) => <span className="font-medium">{log.changer.name}</span> },
    {
      key: "activity",
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

      <FilterBar action="/admin/logs">
        {take !== PAGE_SIZE && <input type="hidden" name="per" value={take} />}
        <FilterBarSearch label="Search logs" placeholder="Cari kode tiket, customer, nama barang, atau user…" defaultValue={q} />
        <div className="grid grid-cols-2 gap-2 md:contents">
          <FilterBarField label="Status" htmlFor="logs-status" className="md:w-44">
            <NativeSelect id="logs-status" name="status" defaultValue={status}>
              <option value="">All Statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s.replace("_", " ").toUpperCase()}</option>
              ))}
            </NativeSelect>
          </FilterBarField>
          <FilterBarField label="Date" htmlFor="logs-date" className="md:w-44">
            <Input id="logs-date" type="date" name="date" defaultValue={date} className="bg-card" />
          </FilterBarField>
        </div>
        <div className="flex gap-2 *:flex-1 md:*:flex-none">
          <Button type="submit">Filter</Button>
          {(q || status || date) && (
            <Link href="/admin/logs" className={buttonVariants({ variant: "ghost" })}>
              Clear
            </Link>
          )}
        </div>
      </FilterBar>

      <DataTable
        caption="Ticket status changes"
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
