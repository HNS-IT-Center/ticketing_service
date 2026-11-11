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
import { ticketBadgeChoice } from "@/lib/rma/ticket-status-badge";
import { FileSpreadsheet, Ticket, Plus } from "lucide-react";
import { getTicketPoints } from "@/lib/points";
import { ticketPartyName } from "@/lib/ticket-party";
import {
  CLAIM_OWNER_FILTERS,
  CLAIM_OWNER_LABELS,
  CLAIM_STATUS_FILTERS,
  claimListOrderBy,
  claimListWhere,
  readClaimOwner,
} from "@/lib/rma/claim-list";

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

const PAGE_SIZE = 10;

export default async function RmaTicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string; sort?: string; per?: string; owner?: string }>;
}) {
  await requireRole("RMA", "Administrator");
  const params = await searchParams;
  const statusFilter = params.status || "all";
  const query = params.q || "";
  const page = Math.max(1, parseInt(params.page || "1") || 1);
  const pageSize = parsePageSize(params.per, PAGE_SIZE);
  const skip = (page - 1) * pageSize;
  const sortParam = params.sort || "updated_desc";
  // Klaim User / Klaim Toko — whose unit it is (lib/rma/claim-list.ts).
  const owner = readClaimOwner(params.owner);

  // Which claims, what the search reaches, and the sort keys live in
  // lib/rma/claim-list.ts, shared with the spreadsheet export.
  const where = claimListWhere(statusFilter, query, owner);
  const orderBy = claimListOrderBy(sortParam);

  const [tickets, totalCount, ...ownerCounts] = await Promise.all([
    db.ticket.findMany({
      where,
      orderBy,
      take: pageSize,
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
        rma_case: { select: { id: true, rma_code: true, status: true, unit_ownership: true } },
        warranty_detail: { select: { unit_ownership: true } },
      },
    }),
    db.ticket.count({ where }),
    // What each ownership chip would show under the current status and search.
    ...CLAIM_OWNER_FILTERS.map((o) => db.ticket.count({ where: claimListWhere(statusFilter, query, o) })),
  ]);

  const totalPages = Math.ceil(totalCount / pageSize);

  const buildHref = (p: number, currentSort: string = sortParam, size: number = pageSize) => {
    const qs = new URLSearchParams();
    if (statusFilter !== "all") qs.set("status", statusFilter);
    if (query) qs.set("q", query);
    if (owner !== "all") qs.set("owner", owner);
    if (currentSort !== "updated_desc") qs.set("sort", currentSort);
    if (size !== PAGE_SIZE) qs.set("per", String(size));
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
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium">{ticketPartyName(t)}</span>
            {(t.rma_case?.unit_ownership ?? t.warranty_detail?.unit_ownership) === "store_stock" && (
              <span className="rounded-full border border-tone-violet-border bg-tone-violet-bg px-1.5 py-px text-[0.65rem] font-semibold whitespace-nowrap text-tone-violet-fg">
                Stok toko
              </span>
            )}
          </span>
          {/* The RMA desk works on units, not on who booked them.
              "(For Others)" told this table nothing it could act
              on; the device does. */}
          <span className="line-clamp-2 text-[0.7rem] text-muted-foreground">
            {t.device_brand ? `${t.device_brand} · ` : ""}
            {t.device_name?.trim() || t.device_type.replace(/_/g, " ")}
          </span>
          {/* The serial number is what the desk matches against the unit and
              the vendor's paperwork (owner, 2026-11-06). Searchable too. */}
          {t.device_sn?.trim() && (
            <span className="text-[0.7rem] text-muted-foreground">
              SN <span className="font-mono font-medium text-foreground">{t.device_sn.trim()}</span>
            </span>
          )}
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

  // The export carries the same filter, search and sort as the list, all pages.
  const exportQs = new URLSearchParams();
  if (statusFilter !== "all") exportQs.set("status", statusFilter);
  if (query) exportQs.set("q", query);
  if (owner !== "all") exportQs.set("owner", owner);
  if (sortParam !== "updated_desc") exportQs.set("sort", sortParam);
  const exportHref = `/rma/tickets/export${exportQs.size ? `?${exportQs}` : ""}`;

  // "Clear" drops the search and keeps the chip and the sort.
  const clearQs = new URLSearchParams();
  if (statusFilter !== "all") clearQs.set("status", statusFilter);
  if (owner !== "all") clearQs.set("owner", owner);
  if (sortParam !== "updated_desc") clearQs.set("sort", sortParam);
  if (pageSize !== PAGE_SIZE) clearQs.set("per", String(pageSize));
  const clearHref = `/rma/tickets${clearQs.size ? `?${clearQs}` : ""}`;

  const chips = CLAIM_STATUS_FILTERS.map((s) => {
    const qs = new URLSearchParams();
    if (s !== "all") qs.set("status", s);
    if (query) qs.set("q", query);
    if (owner !== "all") qs.set("owner", owner);
    if (sortParam !== "updated_desc") qs.set("sort", sortParam);
    if (pageSize !== PAGE_SIZE) qs.set("per", String(pageSize));
    const str = qs.toString();
    const label = s === "all" ? "All" : s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    return { key: s, label, href: `/rma/tickets${str ? `?${str}` : ""}` };
  });

  const ownerChips = CLAIM_OWNER_FILTERS.map((o, i) => {
    const qs = new URLSearchParams();
    if (statusFilter !== "all") qs.set("status", statusFilter);
    if (query) qs.set("q", query);
    if (o !== "all") qs.set("owner", o);
    if (sortParam !== "updated_desc") qs.set("sort", sortParam);
    if (pageSize !== PAGE_SIZE) qs.set("per", String(pageSize));
    const str = qs.toString();
    return { key: o, label: `${CLAIM_OWNER_LABELS[o]} (${ownerCounts[i]})`, href: `/rma/tickets${str ? `?${str}` : ""}` };
  });

  return (
    // Built from components/app and shadcn only (the UI-1 reset rule).
    <div data-slot="rma-tickets" className="flex flex-col gap-5">
      <PageHeader
        title="Klaim Garansi"
        description={`${totalCount} klaim`}
        actions={
          <>
            {/* A plain <a>: a file download, not a page for the router to prefetch. */}
            <a
              href={exportHref}
              download
              className={buttonVariants({ variant: "outline" })}
              title="Semua klaim yang cocok dengan filter dan pencarian ini, bukan hanya halaman ini"
            >
              <FileSpreadsheet aria-hidden="true" /> Export Excel
            </a>
            <Link href="/rma/tickets/create" className={buttonVariants()}>
              <Plus aria-hidden="true" /> New Ticket
            </Link>
          </>
        }
      />

      <div className="flex flex-col gap-3">
        <FilterBar action="/rma/tickets">
          {statusFilter !== "all" && <input type="hidden" name="status" value={statusFilter} />}
          {owner !== "all" && <input type="hidden" name="owner" value={owner} />}
          {sortParam !== "updated_desc" && <input type="hidden" name="sort" value={sortParam} />}
          {pageSize !== PAGE_SIZE && <input type="hidden" name="per" value={pageSize} />}
          <FilterBarSearch label="Search claims" placeholder="Cari kode, customer, nama barang, SN…" defaultValue={query} />
          <div className="flex gap-2 *:flex-1 md:*:flex-none">
            <Button type="submit">Search</Button>
            {query && (
              <Link href={clearHref} className={buttonVariants({ variant: "ghost" })}>
                Clear
              </Link>
            )}
          </div>
        </FilterBar>
        <FilterChips label="Milik unit" chips={ownerChips} active={owner} />
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
