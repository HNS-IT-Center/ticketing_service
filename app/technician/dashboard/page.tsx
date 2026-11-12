import { requireRole } from "@/lib/session";
import { urlSort } from "@/lib/table-sort";
import { TICKET_STATUSES } from "@/lib/ticket-list-filter";
import { db } from "@/lib/db";
import Link from "next/link";
import { DataTable, type DataTableColumn } from "@/components/app/DataTable";
import { EmptyState } from "@/components/app/EmptyState";
import { PageHeader } from "@/components/app/PageHeader";
import { PointsBadge } from "@/components/app/PointsBadge";
import { StatCard } from "@/components/app/StatCard";
import { StatusBadge } from "@/components/app/StatusBadge";
import { buttonVariants } from "@/components/ui/button";
import AvailableTickets from "./AvailableTickets";
import RefreshButton from "./RefreshButton";
import TargetCard from "./TargetCard";
import PartCodeAlertCard from "@/components/service/PartCodeAlertCard";
import { Ticket, CheckCircle, Trophy, PlusCircle, ChevronDown } from "lucide-react";
import { getUserTitles } from "@/lib/performance";
import { ticketPartyName } from "@/lib/ticket-party";

export const metadata = { title: "Technician Dashboard — HNS IT Center" };

function getTicketPoints(type: string, deviceType?: string | null): number {
  if (type === "pc_build") return 4;
  if (type === "service") return 5;
  if (type === "cleaning" && deviceType === "PC_Gaming") return 4;
  return 2;
}

export default async function TechnicianDashboard({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const session = await requireRole("Technician");

  // ── STEP 1: Fire all queries that don't depend on each other simultaneously.
  // The only dependency is: unassigned tickets need storeIds (from assignments).
  // We resolve that by chaining unassigned off assignments via .then() — it fires
  // as soon as assignments resolves without blocking any other parallel queries.

  const assignmentsPromise = db.technicianStoreAssignment.findMany({
    where: { technician_id: session.userId },
    select: { store_id: true },
  });

  // Chain unassigned + pending requests off assignments (they need storeIds).
  // All three fire as one group the moment assignmentsPromise resolves.
  const storeRelatedPromise = assignmentsPromise.then((assignments) => {
    const storeIds = assignments.map((a) => a.store_id);
    return Promise.all([
      db.ticket.findMany({
        where: {
          technician_id: null,
          status: "waiting",
          OR: [
            { store_location_id: { in: storeIds } },
            { store_location_id: null },
          ],
        },
        orderBy: { created_at: "asc" },
        take: 20,
        select: { id: true, ticket_code: true, ticket_type: true, device_type: true, created_at: true, is_for_self: true, customer_name: true, user: { select: { name: true } } },
      }),
      db.ticketAssignmentRequest.findMany({
        where: { technician_id: session.userId, status: "pending" },
        select: { ticket_id: true },
      }),
      db.ticketAssignmentRequest.findMany({
        where: { status: "pending" },
        select: { ticket_id: true, technician_id: true },
      }),
    ] as const);
  });

  // All other queries fire immediately in parallel — no waiting
  const [
    [userInfo, performance, titles],
    assignments,
    [unassigned, myPendingRequests, allPendingRequests],
  ] = await Promise.all([
    Promise.all([
      db.user.findUnique({
        where: { id: session.userId },
        select: { is_team_leader: true, active_title: true },
      }),
      db.technicianPerformance.findUnique({ where: { technician_id: session.userId }, select: { tickets_handled: true, success_count: true } }),
      getUserTitles(session.userId),
    ] as const),
    assignmentsPromise,
    storeRelatedPromise,
  ]);

  const isCoordinator  = userInfo?.is_team_leader ?? false;
  const storeIds       = assignments.map((a) => a.store_id);

  // Fetch active tickets after we know isCoordinator & storeIds
  // Coordinator sees all store tickets; regular tech sees only own
  const activeTickets = await db.ticket.findMany({
    where: isCoordinator && storeIds.length > 0
      ? { store_location_id: { in: storeIds }, status: { notIn: ["completed", "cancelled", "rejected"] } }
      : { technician_id: session.userId, status: { notIn: ["completed", "cancelled", "rejected"] } },
    orderBy: { updated_at: "desc" },
    take: 10,
    select: {
      id: true, ticket_code: true, ticket_type: true, device_type: true,
      status: true, technician_id: true, is_for_self: true, customer_name: true,
      user: { select: { name: true } },
      technician: { select: { name: true } },
    },
  });

  // Find equipped title
  const activeTitle = titles.find((t) => t.title_key === userInfo?.active_title) ?? null;

  // IDs where I have the pending request (show amber + Cancel)
  const myRequestedIds = new Set(myPendingRequests.map((r) => r.ticket_id));
  // IDs where SOMEONE ELSE has the pending request (show gray "Requested by other")
  const otherRequestedIds = new Set(
    allPendingRequests
      .filter((r) => r.technician_id !== session.userId)
      .map((r) => r.ticket_id)
  );


  type ActiveTicket = (typeof activeTickets)[number];
  const activeColumns: DataTableColumn<ActiveTicket>[] = [
    { key: "code", sortValue: (t) => t.ticket_code, header: "Ticket Code", cell: (t) => <span title={t.ticket_code} className="block max-w-32 truncate font-mono">{t.ticket_code}</span>, mobile: "title" },
    { key: "type", sortValue: (t) => t.ticket_type, header: "Type", cell: (t) => <span className="capitalize">{t.ticket_type.replace("_", " ")}</span> },
    { key: "customer", sortValue: (t) => ticketPartyName(t), header: "Customer", cell: (t) => ticketPartyName(t) || "Guest" },
    ...(isCoordinator
      ? [
          {
            key: "technician", sortValue: (t: ActiveTicket) => t.technician?.name,
            header: "Technician",
            cell: (t: ActiveTicket) => t.technician?.name || <span className="text-muted-foreground">Unassigned</span>,
            className: "text-muted-foreground",
          },
        ]
      : []),
    { key: "points", sortValue: (t) => getTicketPoints(t.ticket_type, t.device_type), sortFirst: "desc", header: "Points", cell: (t) => <PointsBadge points={getTicketPoints(t.ticket_type, t.device_type)} /> },
    {
      key: "status", sortValue: (t) => TICKET_STATUSES.indexOf(t.status),
      header: "Status",
      cell: (t) => <StatusBadge kind="ticket" status={t.status} hasTechnician={Boolean(t.technician_id)} size="sm" />,
      mobile: "badge",
    },
    {
      key: "manage",
      header: "",
      cell: () => <span className="text-sm font-medium text-primary">Manage →</span>,
      className: "text-right",
      mobile: "footer",
    },
  ];

  return (
    // Every section here is built from components/app and shadcn, so the page
    // opts into Tailwind spacing with a data-slot (see the UI-1 reset rule).
    <div data-slot="technician-dashboard" className="flex flex-col gap-6">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {isCoordinator ? "Store Coordinator Dashboard" : "Technician Dashboard"}
            {/* Equipped title badge — only show if user has one equipped */}
            {activeTitle && (
              <span className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-secondary px-3 py-1 text-xs font-bold text-primary">
                {activeTitle.emoji} {activeTitle.title_label}
              </span>
            )}
          </span>
        }
        description={isCoordinator ? "Manage your store and assigned tickets" : "Manage your assigned tickets and workload"}
        actions={
          <>
            <RefreshButton />
            <Link href="/technician/tickets/create" className={buttonVariants()}>
              <PlusCircle aria-hidden="true" /> Create Ticket
            </Link>
          </>
        }
      />

      {/* Finished work still missing an Accurate code — only the tickets this
          technician holds (owner's call: the one who fitted the part picks its
          code). Coordinators and head technicians see the store-wide list on
          no dashboard; the admin dashboard has every ticket. */}
      <PartCodeAlertCard scope={{ technician_id: session.userId }} portal="technician" />

      {/* What to work on now: the tickets already in hand come first. */}
      <section aria-labelledby="active-tickets" className="flex flex-col gap-3">
        <h2 id="active-tickets" className="text-lg font-bold text-foreground">
          {isCoordinator ? "Store Active Tickets" : "My Active Tickets"}
        </h2>
        <DataTable
          caption={isCoordinator ? "Store Active Tickets" : "My Active Tickets"}
          sort={urlSort("/technician/dashboard", params)}
          columns={activeColumns}
          rows={activeTickets}
          getRowKey={(t) => t.id}
          rowHref={(t) => `/technician/tickets/${t.id}`}
          empty={
            <EmptyState
              icon={Ticket}
              title={isCoordinator ? "No active tickets in your store" : "No active tickets assigned to you"}
            />
          }
        />
      </section>

      {/* Then the ones that can be picked up. */}
      <section aria-labelledby="available-tickets" className="flex flex-col gap-3">
        <h2 id="available-tickets" className="text-lg font-bold text-foreground">
          Available Tickets <span className="text-sm font-normal text-muted-foreground">({unassigned.length})</span>
        </h2>
        <AvailableTickets
          tickets={unassigned.map(t => ({
            id: t.id,
            ticket_code: t.ticket_code,
            ticket_type: t.ticket_type,
            device_type: t.device_type,
            created_at: t.created_at,
            user: { name: (ticketPartyName(t) || "Guest") }
          }))}
          myRequestedIds={Array.from(myRequestedIds)}
          otherRequestedIds={Array.from(otherRequestedIds)}
        />
      </section>

      {/* Personal numbers last, folded: worth a look, not what the day starts with. */}
      <details className="group rounded-xl border border-border bg-card">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-foreground outline-none select-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2">
            <Trophy aria-hidden="true" className="size-4 text-primary" /> Statistik &amp; Target
          </span>
          <ChevronDown aria-hidden="true" className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="flex flex-col gap-4 border-t border-border p-4">
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Handled" value={performance?.tickets_handled ?? 0} icon={Ticket} />
            <StatCard label="Success" value={performance?.success_count ?? 0} icon={CheckCircle} tone="success" />
          </div>
          {/* This month against the target set in Target Teknisi. */}
          <TargetCard technicianId={session.userId} />
        </div>
      </details>
    </div>
  );
}
