import { requireRole } from "@/lib/session";
import { urlSort } from "@/lib/table-sort";
import { TICKET_STATUSES } from "@/lib/ticket-list-filter";
import { db } from "@/lib/db";
import Link from "next/link";
import { DataTable, type DataTableColumn } from "@/components/app/DataTable";
import { EmptyState } from "@/components/app/EmptyState";
import { PageHeader } from "@/components/app/PageHeader";
import { StatCard } from "@/components/app/StatCard";
import { StatusBadge } from "@/components/app/StatusBadge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Ticket, CheckCircle, Clock, AlertCircle, ArrowRight, Store, Plus, ChevronDown } from "lucide-react";
import { ticketPartyName } from "@/lib/ticket-party";
import PartCodeAlertCard from "@/components/service/PartCodeAlertCard";

export const metadata = { title: "Dashboard — HNS IT Center" };

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const session = await requireRole("Administrator");
  const isSales = session.role === "Sales";
  const salesFilter = isSales ? { sales_id: session.userId } : {};

  // Fire all queries in parallel
  const [userGroups, totalTickets, assignedTickets, closedTickets, totalStores, recentTickets, topTechnicians] =
    await Promise.all([
      isSales
        ? Promise.resolve([] as { role: string; _count: { role: number } }[])
        : db.user.groupBy({ by: ["role"], _count: { role: true } }),
      db.ticket.count({ where: salesFilter }),
      db.ticket.count({ where: { ...salesFilter, technician_id: { not: null } } }),
      db.ticket.count({ where: { ...salesFilter, status: { in: ["done", "cancelled", "rejected"] } } }),
      db.storeLocation.count(),
      db.ticket.findMany({
        where: salesFilter,
        orderBy: { created_at: "desc" },
        take: 8,
        select: {
          id: true, ticket_code: true, ticket_type: true, status: true,
          technician_id: true, is_for_self: true, customer_name: true,
          user: { select: { name: true } },
          technician: { select: { name: true } },
        },
      }),
      db.technicianPerformance.findMany({
        orderBy: { total_points_completed: "desc" },
        take: 5,
        select: { id: true, tickets_handled: true, total_points_completed: true, technician: { select: { id: true, name: true } } },
      }),
    ]);

  const totalUsersRaw = userGroups;
  const countByRole = Object.fromEntries(
    (totalUsersRaw as { role: string; _count: { role: number } }[]).map((u) => [u.role, u._count.role])
  );

  // What needs a hand first: the ticket numbers, Unassigned leading.
  const ticketStats = [
    { label: "Unassigned", value: totalTickets - assignedTickets, icon: Clock, tone: "attention" as const, href: "/admin/tickets?assigned=false" },
    { label: "Assigned", value: assignedTickets, icon: CheckCircle, tone: "success" as const, href: "/admin/tickets?assigned=true" },
    { label: "Total Tickets", value: totalTickets, icon: Ticket, tone: "default" as const, href: "/admin/tickets" },
    { label: "Closed", value: closedTickets, icon: AlertCircle, tone: "default" as const, href: "/admin/tickets?status=done" },
  ];
  // Who and where: worth knowing, rarely what the day starts with.
  const orgStats = [
    { label: "Technicians", value: countByRole.Technician ?? 0, icon: Users, href: "/admin/users?role=Technician" },
    { label: "Stores", value: totalStores ?? 0, icon: Store, href: "/admin/stores" },
    { label: "Sales", value: countByRole.Sales ?? 0, icon: Users, href: "/admin/users?role=Sales" },
  ];

  type RecentTicket = (typeof recentTickets)[number];
  const recentColumns: DataTableColumn<RecentTicket>[] = [
    { key: "code", sortValue: (t) => t.ticket_code, header: "Code", cell: (t) => <span title={t.ticket_code} className="block max-w-32 truncate font-mono">{t.ticket_code}</span>, mobile: "title" },
    { key: "type", sortValue: (t) => t.ticket_type, header: "Type", cell: (t) => <span className="capitalize">{t.ticket_type.replace("_", " ")}</span> },
    { key: "customer", sortValue: (t) => ticketPartyName(t), header: "Customer", cell: (t) => ticketPartyName(t) || "Guest" },
    {
      key: "status", sortValue: (t) => TICKET_STATUSES.indexOf(t.status),
      header: "Status",
      cell: (t) => <StatusBadge kind="ticket" status={t.status} hasTechnician={Boolean(t.technician_id)} size="sm" />,
      mobile: "badge",
    },
    {
      key: "technician", sortValue: (t) => t.technician?.name,
      header: "Technician",
      cell: (t) => t.technician?.name ?? "—",
      className: "text-muted-foreground",
    },
  ];

  const orgAndTop = (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="grid grid-cols-3 content-start gap-3">
        {orgStats.map((s) => (
          <StatCard key={s.label} label={s.label} value={s.value} icon={s.icon} href={s.href} />
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="font-bold">Top Technicians</CardTitle>
          <CardAction>
            <Link href="/admin/performance" className="text-sm font-medium text-primary hover:underline">All →</Link>
          </CardAction>
        </CardHeader>
        <CardContent>
          {topTechnicians.length === 0 ? (
            <p className="py-4 text-center text-muted-foreground">No data yet</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {topTechnicians.map((t, i) => (
                <li key={t.id} className="flex items-center gap-3">
                  <span className={i === 0 ? "w-6 font-extrabold text-amber-600" : "w-6 font-extrabold text-muted-foreground"}>
                    {i === 0 ? "🥇" : `#${i + 1}`}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.9rem] font-semibold">{t.technician?.name ?? "Unknown"}</p>
                    <p className="text-xs text-muted-foreground">{t.tickets_handled} tickets</p>
                  </div>
                  <span className="font-bold text-primary tabular-nums">{t.total_points_completed} pts</span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );

  return (
    // Built from components/app and shadcn only, so the page opts into
    // Tailwind spacing with a data-slot (the UI-1 reset rule).
    <div data-slot="admin-dashboard" className="flex flex-col gap-6">
      <PageHeader
        title="Admin Dashboard"
        description="System overview and management"
        actions={
          <Link href="/admin/tickets/create" className={buttonVariants()}>
            <Plus aria-hidden="true" /> Create Ticket
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {ticketStats.map((s) => (
          <StatCard key={s.label} label={s.label} value={s.value} icon={s.icon} tone={s.tone} href={s.href} />
        ))}
      </div>

      {/* Finished service tickets whose parts still lack an Accurate code. */}
      <PartCodeAlertCard scope={{}} portal="admin" showTechnician />

      <section aria-labelledby="recent-tickets" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="recent-tickets" className="text-lg font-bold text-foreground">Recent Tickets</h2>
          <Link href="/admin/tickets" className="flex min-h-11 items-center gap-1 text-sm font-medium text-primary hover:underline md:min-h-0">
            View all <ArrowRight aria-hidden="true" className="size-3.5" />
          </Link>
        </div>
        <DataTable
          caption="Recent Tickets"
          sort={urlSort("/admin/dashboard", params)}
          columns={recentColumns}
          rows={recentTickets}
          getRowKey={(t) => t.id}
          rowHref={(t) => `/admin/tickets/${t.id}`}
          empty={<EmptyState icon={Ticket} title="No tickets yet" />}
        />
      </section>

      {!isSales && (
        <>
          {/* On a phone this folds away; on a wider screen there is room for it. */}
          <details className="group rounded-xl border border-border bg-card md:hidden">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-foreground outline-none select-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
              Organisasi &amp; Top Technicians
              <ChevronDown aria-hidden="true" className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <div className="border-t border-border p-4">{orgAndTop}</div>
          </details>
          <section aria-label="Organisasi & Top Technicians" className="hidden md:block">
            {orgAndTop}
          </section>
        </>
      )}
    </div>
  );
}
