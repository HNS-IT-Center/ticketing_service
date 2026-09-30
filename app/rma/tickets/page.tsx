import { requireRole } from "@/lib/session";
import { db } from "@/lib/db";
import Link from "next/link";
import Badge from "@/components/ui/Badge";
import { Ticket, ChevronLeft, ChevronRight } from "lucide-react";
import { getTicketPoints } from "@/lib/points";

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
        rma_case: { select: { id: true, rma_code: true } },
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
        style={{ color: "inherit", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
      >
        {label}
        {isActive ? (isAsc ? " ↑" : " ↓") : <span style={{ opacity: 0.3 }}> ↕</span>}
      </Link>
    );
  };

  const pointsPill = (pts: number) => (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.25rem",
        padding: "0.2rem 0.55rem",
        borderRadius: "999px",
        fontSize: "0.75rem",
        fontWeight: 700,
        background: pts >= 5 ? "rgba(234,179,8,0.12)" : pts >= 4 ? "rgba(124,58,237,0.1)" : "rgba(22,70,157,0.1)",
        color: pts >= 5 ? "#92400e" : pts >= 4 ? "#6d28d9" : "var(--primary)",
        border: `1px solid ${pts >= 5 ? "rgba(234,179,8,0.3)" : pts >= 4 ? "rgba(124,58,237,0.25)" : "rgba(22,70,157,0.25)"}`,
        whiteSpace: "nowrap",
      }}
    >
      ⭐ {pts} pts
    </span>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1>Klaim Garansi</h1>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-gray-500">
              {totalCount} klaim
            </p>
            <Link
              href="/rma/tickets/create"
              className="btn btn-primary btn-sm flex items-center gap-1.5"
              style={{ padding: "0.25rem 0.75rem" }}
            >
              <span style={{ fontSize: "1rem", lineHeight: 1 }}>+</span> New Ticket
            </Link>
          </div>
        </div>
        <form style={{ display: "flex", gap: "0.5rem" }}>
          {statusFilter !== "all" && <input type="hidden" name="status" value={statusFilter} />}
          {sortParam !== "updated_desc" && <input type="hidden" name="sort" value={sortParam} />}
          <input
            name="q"
            defaultValue={query}
            className="form-input"
            placeholder="Search code or customer..."
            style={{ width: "200px" }}
          />
          <button type="submit" className="btn btn-primary btn-sm">Search</button>
          {query && (
            <Link href={buildHref(1, sortParam)} className="btn btn-ghost btn-sm">
              Clear
            </Link>
          )}
        </form>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {STATUS_FILTERS.map((s) => {
          const qs = new URLSearchParams();
          if (s !== "all") qs.set("status", s);
          if (query) qs.set("q", query);
          if (sortParam !== "updated_desc") qs.set("sort", sortParam);
          const str = qs.toString();
          const href = `/rma/tickets${str ? `?${str}` : ""}`;
          return (
            <Link
              key={s}
              href={href}
              className="btn btn-sm"
              style={{
                background: statusFilter === s ? "var(--primary)" : "var(--white)",
                color: statusFilter === s ? "var(--white)" : "var(--text-secondary)",
                border: "1.5px solid",
                borderColor: statusFilter === s ? "var(--primary)" : "var(--border)",
                textTransform: "capitalize",
              }}
            >
              {s === "all" ? "All" : s.replace(/_/g, " ")}
            </Link>
          );
        })}
      </div>

      {/* Desktop table */}
      <div className="admin-ticket-table">
        <div className="table-wrapper">
          {tickets.length === 0 ? (
            <div className="empty-state">
              <Ticket size={36} style={{ opacity: 0.3 }} />
              <p>Tidak ada klaim</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>{renderSortableHeader("Code", "code_asc", "code_desc")}</th>
                  <th>RMA</th>
                  <th>Customer</th>
                  <th>Points</th>
                  <th>{renderSortableHeader("Status", "status_asc", "status_desc")}</th>
                  <th>{renderSortableHeader("Updated", "updated_asc", "updated_desc")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => {
                  const actualName = t.is_for_self ? t.user?.name : t.customer_name;
                  const pts = getTicketPoints(
                    t.ticket_type,
                    t.device_type,
                    t.cleaning_detail?.service_package,
                  );
                  return (
                    <tr key={t.id}>
                      <td style={{ fontFamily: "monospace", fontWeight: 600, color: "var(--primary)" }}>{t.ticket_code}</td>
                      <td style={{ fontFamily: "monospace", fontSize: "0.8125rem" }}>
                        {t.rma_case ? (
                          <span style={{ color: "var(--primary)" }}>{t.rma_case.rma_code}</span>
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>belum diserahkan</span>
                        )}
                      </td>
                      <td>
                        <div style={{ fontWeight: 500 }}>{actualName}</div>
                        {!t.is_for_self && (
                          <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.1rem" }}>(For Others)</div>
                        )}
                      </td>
                      <td>{pointsPill(pts)}</td>
                      <td><Badge variant={t.status} technicianId={t.technician_id} /></td>
                      <td style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
                        {new Date(t.updated_at).toLocaleDateString("id-ID")}
                      </td>
                      <td>
                        {t.rma_case ? (
                          <Link href={`/rma/cases/${t.rma_case.id}`} className="btn btn-secondary btn-sm">
                            Manage
                          </Link>
                        ) : (
                          // No RMA page exists for a ticket without a case, so
                          // nothing is offered rather than a link that 404s.
                          <span style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Mobile card list */}
      <div className="admin-ticket-cards">
        {tickets.length === 0 ? (
          <div className="empty-state">
            <Ticket size={36} style={{ opacity: 0.3 }} />
            <p>Tidak ada klaim</p>
          </div>
        ) : (
          tickets.map((t) => {
            const pts = getTicketPoints(
              t.ticket_type,
              t.device_type,
              t.cleaning_detail?.service_package,
            );
            const card = (
              <div className="mobile-ticket-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--primary)", fontSize: "0.9375rem" }}>
                    {t.ticket_code}
                  </span>
                  <Badge variant={t.status} technicianId={t.technician_id} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                  <span style={{ fontFamily: "monospace" }}>
                    {t.rma_case ? t.rma_case.rma_code : "belum diserahkan"}
                  </span>
                  {pointsPill(pts)}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem" }}>
                  <span style={{ color: "var(--text-secondary)" }}>👤 {t.user?.name || "Guest"}</span>
                  <span>{new Date(t.updated_at).toLocaleDateString("id-ID")}</span>
                </div>
              </div>
            );
            return t.rma_case ? (
              <Link key={t.id} href={`/rma/cases/${t.rma_case.id}`} style={{ textDecoration: "none" }}>
                {card}
              </Link>
            ) : (
              <div key={t.id}>{card}</div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", paddingTop: "0.5rem" }}>
          {page > 1 ? (
            <Link href={buildHref(page - 1)} className="btn btn-secondary btn-sm">
              <ChevronLeft size={14} /> Prev
            </Link>
          ) : (
            <button className="btn btn-secondary btn-sm" disabled>
              <ChevronLeft size={14} /> Prev
            </button>
          )}
          <span style={{ fontSize: "0.875rem", color: "var(--text-muted)", padding: "0 0.5rem" }}>
            Page {page} of {totalPages}
          </span>
          {page < totalPages ? (
            <Link href={buildHref(page + 1)} className="btn btn-secondary btn-sm">
              Next <ChevronRight size={14} />
            </Link>
          ) : (
            <button className="btn btn-secondary btn-sm" disabled>
              Next <ChevronRight size={14} />
            </button>
          )}
        </div>
      )}
      <div style={{ textAlign: "center", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
        Showing {tickets.length > 0 ? skip + 1 : 0}–{Math.min(skip + tickets.length, totalCount)} of {totalCount} tickets
      </div>
    </div>
  );
}
