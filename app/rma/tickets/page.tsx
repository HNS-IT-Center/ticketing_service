import { requireRole } from "@/lib/session";
import { db } from "@/lib/db";
import Link from "next/link";
import { DataTable, type DataTableColumn } from "@/components/app/DataTable";
import { EmptyState } from "@/components/app/EmptyState";
import { FilterBar, FilterBarSearch } from "@/components/app/FilterBar";
import { FilterChips } from "@/components/app/FilterChips";
import { PageHeader } from "@/components/app/PageHeader";
import { Pagination } from "@/components/app/Pagination";
import { StatusBadge } from "@/components/app/StatusBadge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ticketBadgeChoice } from "@/lib/rma/ticket-status-badge";
import { Ticket, Plus } from "lucide-react";
import { getTicketPoints } from "@/lib/points";
import { ticketPartyName } from "@/lib/ticket-party";

/**
 * Warranty claims, for the RMA desk.
 *
 * Every other portal had this page; RMA did not, so `/rma/tickets` was a 404 —
 * which is also where `createTicketAction` landed the desk after a successful
 * creation, since its redirect chain named no route for this role.
 *
 * Laid out to match the technician's My Tickets page rather than the admin one:
 * points pill, sortable Updated column, icon empty state, Manage button.
 *
 * Filtered to `warranty_claim` and nothing else: this desk handles claims, and
 * every other ticket type belongs to the technician and admin portals.
 *
 * Not filtered by owner, though. Sales lists what it sold and a technician
 * lists what they hold; the RMA desk owns nothing and needs to see every claim,
 * including the ones still sitting with a technician before handover. Those
 * have no RmaCase yet, so their RMA column reads "belum diserahkan" — which is
 * useful in itself: it is the queue of work heading this way.
 *
 * ⚠ The points shown here come from `lib/points.ts`, which CLAUDE.md requires
 * for anything new. That is the table the writers actually credit, and it is
 * NOT the table the technician and sales lists render — those carry their own
 * copies. So this page can disagree with them: cleaning is 3/5 here against
 * 2/4 there, `service` on `Other_Device` is 3 here against 5 there, and the
 * +3-per-extra-service those badges add is absent because no writer has ever
 * credited it. Reconciling the tables is BL3, its own branch.
 */
export const metadata = { title: "Klaim Garansi — HNS IT Center" };

const STATUS_FILTERS = [
  "all",
  "waiting",
  "on_progress",
  "rma_process",
  "done",
  "completed",
  "cancelled",
] as const;
const PAGE_SIZE = 10;

export default async function RmaTicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string; sort?: string }>;
}) {
  await requireRole("RMA", "Administrator");
  const params = await searchParams;
  const statusFilter = params.status || "all";
  const query = params.q || "";
  const page = Math.max(1, parseInt(params.page || "1") || 1);
  const skip = (page - 1) * PAGE_SIZE;
  const sortParam = params.sort || "updated_desc";

  // Claims only, and of those only the ones this desk has a stake in:
  //
  //   has an RmaCase        → always, whatever the ticket status. This is the
  //                           desk's own work, including cases already closed.
  //   no case, still open   → the queue heading this way; a technician may hand
  //                           it over at any moment.
  //   no case, finished     → hidden. A claim a technician resolved without
  //                           ever involving RMA is not this desk's history,
  //                           and three of the nine on record are exactly that.
  //
  // Combined with AND because the search below also uses OR, and two OR keys in
  // one object would overwrite each other rather than both apply.
  const OPEN_BEFORE_HANDOVER = ["waiting", "on_progress"] as const;

  const where = {
    ticket_type: "warranty_claim" as const,
    AND: [
      {
        OR: [
          { rma_case: { isNot: null } },
          { status: { in: OPEN_BEFORE_HANDOVER as unknown as never } },
        ],
      },
      ...(statusFilter !== "all" ? [{ status: statusFilter as never }] : []),
      ...(query
        ? [
            {
              OR: [
                { ticket_code: { contains: query } },
                { user: { name: { contains: query } } },
                { customer_name: { contains: query } },
              ],
            },
          ]
        : []),
    ],
  };

  let orderBy: Record<string, "asc" | "desc"> = { updated_at: "desc" };
  if (sortParam === "updated_asc") orderBy = { updated_at: "asc" };
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
        // getTicketPoints scores cleaning by its package, so the row cannot be
        // priced without it.
        cleaning_detail: { select: { service_package: true } },
        // Only a claim that reached this desk has a case, and only a case has a
        // page in this portal. Without this the Manage link would point at
        // /rma/tickets/{id}, which resolves a case and 404s when there is none.
        rma_case: { select: { id: true, rma_code: true, status: true } },
      },
    }),
    db.ticket.count({ where }),
  ]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const buildHref = (p: number, currentSort: string = sortParam) => {
    const qs = new URLSearchParams();
    if (statusFilter !== "all") qs.set("status", statusFilter);
    if (query) qs.set("q", query);
    if (currentSort !== "updated_desc") qs.set("sort", currentSort);
    if (p > 1) qs.set("page", String(p));
    const str = qs.toString();
    return `/rma/tickets${str ? `?${str}` : ""}`;
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

  const pointsPill = (pts: number) => (
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
      ⭐ {pts} pts
    </span>
  );

  type ClaimRow = (typeof tickets)[number];
  const columns: DataTableColumn<ClaimRow>[] = [
    {
      key: "code",
      header: renderSortableHeader("Code", "code_asc", "code_desc"),
      mobileLabel: "Code",
      cell: (t) => <span title={t.ticket_code} className="block max-w-32 truncate font-mono">{t.ticket_code}</span>,
      mobile: "title",
    },
    {
      key: "rma",
      header: "RMA",
      cell: (t) =>
        t.rma_case ? (
          <span className="font-mono text-[0.8125rem] whitespace-nowrap text-primary">{t.rma_case.rma_code}</span>
        ) : (
          <span className="text-[0.8125rem] whitespace-nowrap text-muted-foreground">belum diserahkan</span>
        ),
    },
    {
      key: "customer",
      header: "Customer",
      cell: (t) => (
        <span className="flex flex-col">
          <span className="font-medium">{ticketPartyName(t)}</span>
          {/* The RMA desk works on units, not on who booked them.
              "(For Others)" told this table nothing it could act
              on; the device does. */}
          <span className="line-clamp-2 text-[0.7rem] text-muted-foreground">
            {t.device_name?.trim() || t.device_type.replace(/_/g, " ")}
          </span>
        </span>
      ),
    },
    {
      key: "points",
      header: "Points",
      // Gives way first beside the sidebar at 1024px; phone cards keep it.
      className: "hidden xl:table-cell",
      cell: (t) => pointsPill(getTicketPoints(t.ticket_type, t.device_type, t.cleaning_detail?.service_package)),
    },
    {
      key: "status",
      header: renderSortableHeader("Status", "status_asc", "status_desc"),
      mobileLabel: "Status",
      // Before handover the ticket status says where the claim is; after it,
      // the case status does. See lib/rma/ticket-status-badge.ts.
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
      // No RMA page exists for a ticket without a case, so nothing is offered
      // rather than a link that 404s.
      cell: (t) =>
        t.rma_case ? (
          <span className="text-sm font-medium text-primary">Manage →</span>
        ) : (
          <span className="text-[0.8125rem] text-muted-foreground">—</span>
        ),
      className: "hidden text-right xl:table-cell",
      mobile: "hidden",
    },
  ];

  const chips = STATUS_FILTERS.map((s) => {
    const qs = new URLSearchParams();
    if (s !== "all") qs.set("status", s);
    if (query) qs.set("q", query);
    if (sortParam !== "updated_desc") qs.set("sort", sortParam);
    const str = qs.toString();
    const label = s === "all" ? "All" : s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    return { key: s, label, href: `/rma/tickets${str ? `?${str}` : ""}` };
  });

  return (
    // Built from components/app and shadcn only (the UI-1 reset rule).
    <div data-slot="rma-tickets" className="flex flex-col gap-5">
      <PageHeader
        title="Klaim Garansi"
        description={`${totalCount} klaim`}
        actions={
          <Link href="/rma/tickets/create" className={buttonVariants()}>
            <Plus aria-hidden="true" /> New Ticket
          </Link>
        }
      />

      <div className="flex flex-col gap-3">
        <FilterBar action="/rma/tickets">
          {statusFilter !== "all" && <input type="hidden" name="status" value={statusFilter} />}
          {sortParam !== "updated_desc" && <input type="hidden" name="sort" value={sortParam} />}
          <FilterBarSearch label="Search claims" placeholder="Search code or customer..." defaultValue={query} />
          <div className="flex gap-2 *:flex-1 md:*:flex-none">
            <Button type="submit">Search</Button>
            {query && (
              <Link href={buildHref(1, sortParam)} className={buttonVariants({ variant: "ghost" })}>
                Clear
              </Link>
            )}
          </div>
        </FilterBar>
        <FilterChips label="Status" chips={chips} active={statusFilter} />
      </div>

      <DataTable
        caption="Klaim Garansi"
        columns={columns}
        rows={tickets}
        getRowKey={(t) => t.id}
        // Only a claim that reached the desk has a case page.
        rowHref={(t) => (t.rma_case ? `/rma/cases/${t.rma_case.id}` : undefined)}
        empty={<EmptyState icon={Ticket} title="Tidak ada klaim" />}
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
