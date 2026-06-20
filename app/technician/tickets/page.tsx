import { requireRole } from "@/lib/session";
import { db } from "@/lib/db";
import Link from "next/link";
import Badge from "@/components/ui/Badge";
import { Ticket, ChevronLeft, ChevronRight } from "lucide-react";

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

export default async function TechnicianTicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string; sort?: string }>;
}) {
  const session = await requireRole("Technician");
  const params = await searchParams;
  const statusFilter = params.status || "all";
  const query = params.q || "";
  const page = Math.max(1, parseInt(params.page || "1") || 1);
  const skip = (page - 1) * PAGE_SIZE;
  const sortParam = params.sort || "priority";

  // If coordinator, show all tickets in their stores; otherwise own tickets only
  const currentUser = await db.user.findUnique({
    where: { id: session.userId },
    select: { is_team_leader: true },
  });
  const isCoordinator = currentUser?.is_team_leader ?? false;

  let technicianWhere: object = { technician_id: session.userId };
  if (isCoordinator) {
    const assignments = await db.technicianStoreAssignment.findMany({
      where: { technician_id: session.userId },
      select: { store_id: true },
    });
    const storeIds = assignments.map((a) => a.store_id);
    technicianWhere = storeIds.length > 0
      ? { store_location_id: { in: storeIds } }
      : {}; // no store → empty fallback
  }

  const where = {
    ...technicianWhere,
    ...(statusFilter !== "all" ? { status: statusFilter as any } : {}),
    ...(query
      ? {
          OR: [
            { ticket_code: { contains: query, mode: "insensitive" as const } },
            { user: { name: { contains: query, mode: "insensitive" as const } } },
            { customer_name: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : {}),
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
  const tickets = allTickets.slice(skip, skip + PAGE_SIZE);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const buildHref = (p: number, currentSort: string = sortParam) => {
    const qs = new URLSearchParams();
    if (statusFilter !== "all") qs.set("status", statusFilter);
    if (query) qs.set("q", query);
    if (currentSort !== "priority") qs.set("sort", currentSort);
    if (p > 1) qs.set("page", String(p));
    const str = qs.toString();
    return `/technician/tickets${str ? `?${str}` : ""}`;
  };

  const renderSortableHeader = (label: string, ascKey: string, descKey: string) => {
    const isActive = sortParam === ascKey || sortParam === descKey;
    const isAsc = sortParam === ascKey;
    const nextSort = isAsc ? descKey : ascKey;
    return (
      <Link href={buildHref(1, nextSort)} style={{ color: "inherit", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
        {label}
        {isActive ? (isAsc ? " ↑" : " ↓") : <span style={{ opacity: 0.3 }}> ↕</span>}
      </Link>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1>{isCoordinator ? "Store Tickets" : "My Tickets"}</h1>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-gray-500">
              {isCoordinator ? "All tickets in your assigned stores" : "Manage tickets assigned to you"}
            </p>
            <Link href="/technician/tickets/create" className="btn btn-primary btn-sm flex items-center gap-1.5" style={{ padding: "0.25rem 0.75rem" }}>
              <span style={{ fontSize: "1rem", lineHeight: 1 }}>+</span> New Ticket
            </Link>
          </div>
        </div>
        <form style={{ display: "flex", gap: "0.5rem" }}>
          {statusFilter !== "all" && <input type="hidden" name="status" value={statusFilter} />}
          {sortParam !== "priority" && <input type="hidden" name="sort" value={sortParam} />}
          <input
            name="q"
            defaultValue={query}
            className="form-input"
            placeholder="Search code or customer..."
            style={{ width: "200px" }}
          />
          <button type="submit" className="btn btn-primary btn-sm">Search</button>
          {query && (
            <Link href={buildHref(1, sortParam).replace(`q=${encodeURIComponent(query)}`, "").replace("&&", "&").replace("?&", "?")} className="btn btn-ghost btn-sm">
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
          if (sortParam !== "priority") qs.set("sort", sortParam);
          const str = qs.toString();
          const href = `/technician/tickets${str ? `?${str}` : ""}`;
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
              {s === "all" ? "All" : s.replace("_", " ")}
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
              <p>No tickets found</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>{renderSortableHeader("Code", "code_asc", "code_desc")}</th>
                  <th>Type</th>
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
                  const pts = getTicketPoints(t.ticket_type, t.device_type, t.extra_services as string[]);
                  const hasExtra = (t.extra_services as string[])?.length > 0;
                  return (
                    <tr key={t.id}>
                      <td style={{ fontFamily: "monospace", fontWeight: 600, color: "var(--primary)" }}>{t.ticket_code}</td>
                      <td style={{ textTransform: "capitalize" }}>{t.ticket_type.replace("_", " ")}</td>
                      <td>
                        <div style={{ fontWeight: 500 }}>{actualName}</div>
                        {!t.is_for_self && <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.1rem" }}>(For Others)</div>}
                      </td>
                      <td>
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: "0.25rem",
                          padding: "0.2rem 0.55rem", borderRadius: "999px",
                          fontSize: "0.75rem", fontWeight: 700,
                          background: pts >= 5 ? "rgba(234,179,8,0.12)" : pts >= 4 ? "rgba(124,58,237,0.1)" : "rgba(22,70,157,0.1)",
                          color: pts >= 5 ? "#92400e" : pts >= 4 ? "#6d28d9" : "var(--primary)",
                          border: `1px solid ${pts >= 5 ? "rgba(234,179,8,0.3)" : pts >= 4 ? "rgba(124,58,237,0.25)" : "rgba(22,70,157,0.25)"}`,
                          whiteSpace: "nowrap",
                        }}>
                          ⭐ {pts} pts{hasExtra && <span style={{ opacity: 0.65, fontWeight: 400, fontSize: "0.68rem" }}> (+extra)</span>}
                        </span>
                      </td>
                      <td><Badge variant={t.status} technicianId={t.technician_id} /></td>
                      <td style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>{new Date(t.updated_at).toLocaleDateString("id-ID")}</td>
                      <td><Link href={`/technician/tickets/${t.id}`} className="btn btn-secondary btn-sm">Manage</Link></td>
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
            <p>No tickets found</p>
          </div>
        ) : tickets.map((t) => {
          const actualName = t.is_for_self ? t.user?.name : t.customer_name;
          const pts = getTicketPoints(t.ticket_type, t.device_type, t.extra_services as string[]);
          const hasExtra = (t.extra_services as string[])?.length > 0;
          return (
            <Link key={t.id} href={`/technician/tickets/${t.id}`} style={{ textDecoration: "none" }}>
              <div className="mobile-ticket-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--primary)" }}>
                    {t.ticket_code}
                  </span>
                  <Badge variant={t.status} technicianId={t.technician_id} />
                </div>
                <div style={{ fontWeight: 500, fontSize: "0.875rem", margin: "0.25rem 0", color: "var(--text-primary)" }}>
                  Customer: {actualName} {!t.is_for_self && <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(For Others)</span>}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                  <span style={{ textTransform: "capitalize" }}>{t.ticket_type.replace("_", " ")}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span style={{
                      display: "inline-flex", alignItems: "center",
                      padding: "0.15rem 0.5rem", borderRadius: "999px",
                      fontSize: "0.7rem", fontWeight: 700,
                      background: pts >= 4 ? "rgba(124,58,237,0.1)" : pts === 3 ? "rgba(22,70,157,0.1)" : "rgba(22,163,74,0.1)",
                      color: pts >= 4 ? "#6d28d9" : pts === 3 ? "var(--primary)" : "#15803d",
                    }}>
                      ⭐ {pts} pts
                    </span>
                    <span>{new Date(t.updated_at).toLocaleDateString("id-ID")}</span>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", paddingTop: "0.5rem" }}>
          {page > 1 ? (
            <Link href={buildHref(page - 1)} className="btn btn-secondary btn-sm">
              <ChevronLeft size={14} /> Prev
            </Link>
          ) : (
            <button className="btn btn-secondary btn-sm" disabled><ChevronLeft size={14} /> Prev</button>
          )}
          <span style={{ fontSize: "0.875rem", color: "var(--text-muted)", padding: "0 0.5rem" }}>
            Page {page} of {totalPages}
          </span>
          {page < totalPages ? (
            <Link href={buildHref(page + 1)} className="btn btn-secondary btn-sm">
              Next <ChevronRight size={14} />
            </Link>
          ) : (
            <button className="btn btn-secondary btn-sm" disabled>Next <ChevronRight size={14} /></button>
          )}
        </div>
      )}
      <div style={{ textAlign: "center", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
        Showing {tickets.length > 0 ? skip + 1 : 0}–{Math.min(skip + tickets.length, totalCount)} of {totalCount} tickets
      </div>
    </div>
  );
}
