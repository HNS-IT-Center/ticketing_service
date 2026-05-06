import { requireRole } from "@/lib/session";
import { db } from "@/lib/db";
import Link from "next/link";
import Badge from "@/components/ui/Badge";
import { Ticket, PlusCircle, ChevronLeft, ChevronRight } from "lucide-react";

export const metadata = { title: "My Tickets — HNS IT Center" };

const STATUS_FILTERS = ["all", "waiting", "on_progress", "done", "cancelled", "rejected"] as const;
const PAGE_SIZE = 10;

export default async function CustomerTicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string; sort?: string }>;
}) {
  const session = await requireRole("Customer", "Sales");
  const params = await searchParams;
  const statusFilter = params.status || "all";
  const query = params.q || "";
  const page = Math.max(1, parseInt(params.page || "1") || 1);
  const skip = (page - 1) * PAGE_SIZE;
  const sortParam = params.sort || "created_desc";

  const where = {
    user_id: session.userId,
    ...(statusFilter !== "all" ? { status: statusFilter as any } : {}),
    ...(query
      ? {
          OR: [
            { ticket_code: { contains: query, mode: "insensitive" as const } },
            { customer_name: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  let orderBy: any = { created_at: "desc" };
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
        technician: { select: { name: true } },
        messages: { where: { is_read: false, sender_id: { not: session.userId } }, select: { id: true } },
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
    return `/customer/tickets${str ? `?${str}` : ""}`;
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1>My Tickets</h1>
          <p style={{ color: "var(--text-muted)", marginTop: "0.25rem" }}>
            Track and manage all your service requests
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
          <form style={{ display: "flex", gap: "0.5rem" }}>
            {statusFilter !== "all" && <input type="hidden" name="status" value={statusFilter} />}
            {sortParam !== "created_desc" && <input type="hidden" name="sort" value={sortParam} />}
            <input
              name="q"
              defaultValue={query}
              className="form-input"
              placeholder="Search code or recipient..."
              style={{ width: "200px" }}
            />
            <button type="submit" className="btn btn-primary btn-sm">Search</button>
            {query && (
              <Link href={buildHref(1, sortParam).replace(`q=${encodeURIComponent(query)}`, "").replace("&&", "&").replace("?&", "?")} className="btn btn-ghost btn-sm">
                Clear
              </Link>
            )}
          </form>
          <Link href="/customer/tickets/create" className="btn btn-primary btn-sm" style={{ padding: "0.5rem 0.75rem" }}>
            <PlusCircle size={16} /> New
          </Link>
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {STATUS_FILTERS.map((s) => {
          const qs = new URLSearchParams();
          if (s !== "all") qs.set("status", s);
          if (query) qs.set("q", query);
          if (sortParam !== "created_desc") qs.set("sort", sortParam);
          const str = qs.toString();
          const href = `/customer/tickets${str ? `?${str}` : ""}`;
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
              <Ticket size={40} style={{ opacity: 0.3 }} />
              <p>No tickets found</p>
              {statusFilter === "all" && !query && (
                <Link href="/customer/tickets/create" className="btn btn-primary btn-sm">
                  Create your first ticket
                </Link>
              )}
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>{renderSortableHeader("Code", "code_asc", "code_desc")}</th>
                  <th>Recipient</th>
                  <th>Type</th>
                  <th>Device</th>
                  <th>{renderSortableHeader("Status", "status_asc", "status_desc")}</th>
                  <th>Technician</th>
                  <th>{renderSortableHeader("Date", "created_asc", "created_desc")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => {
                  const actualName = t.is_for_self ? session.name : t.customer_name;
                  return (
                    <tr key={t.id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <span style={{ fontFamily: "monospace", fontWeight: 600, color: "var(--primary)" }}>
                            {t.ticket_code}
                          </span>
                          {t.messages.length > 0 && (
                            <span style={{ background: "var(--accent)", color: "#fff", borderRadius: "999px", fontSize: "0.7rem", padding: "0.1rem 0.45rem", fontWeight: 700 }}>
                              {t.messages.length}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 500 }}>{actualName}</div>
                        {!t.is_for_self && <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.1rem" }}>(For Others)</div>}
                      </td>
                      <td style={{ textTransform: "capitalize" }}>{t.ticket_type.replace("_", " ")}</td>
                      <td style={{ color: "var(--text-muted)" }}>{t.device_type.replace("_", " ")}</td>
                      <td><Badge variant={t.status} /></td>
                      <td style={{ color: "var(--text-muted)" }}>{t.technician?.name ?? "—"}</td>
                      <td style={{ color: "var(--text-muted)", whiteSpace: "nowrap" }}>{new Date(t.created_at).toLocaleDateString("id-ID")}</td>
                      <td><Link href={`/customer/tickets/${t.id}`} className="btn btn-secondary btn-sm">Open</Link></td>
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
            <Ticket size={40} style={{ opacity: 0.3 }} />
            <p>No tickets found</p>
          </div>
        ) : tickets.map((t) => {
          const actualName = t.is_for_self ? session.name : t.customer_name;
          return (
            <Link key={t.id} href={`/customer/tickets/${t.id}`} style={{ textDecoration: "none" }}>
              <div className="mobile-ticket-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--primary)" }}>
                      {t.ticket_code}
                    </span>
                    {t.messages.length > 0 && (
                      <span style={{ background: "var(--accent)", color: "#fff", borderRadius: "999px", fontSize: "0.7rem", padding: "0.1rem 0.45rem", fontWeight: 700 }}>
                        {t.messages.length}
                      </span>
                    )}
                  </div>
                  <Badge variant={t.status} />
                </div>
                <div style={{ fontWeight: 500, fontSize: "0.875rem", margin: "0.25rem 0", color: "var(--text-primary)" }}>
                  Recipient: {actualName} {!t.is_for_self && <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(For Others)</span>}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                  <span style={{ textTransform: "capitalize" }}>{t.ticket_type.replace("_", " ")}</span>
                  <span>{t.device_type.replace("_", " ")}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem" }}>
                  <span style={{ color: "var(--text-secondary)" }}>🔧 {t.technician?.name ?? "Unassigned"}</span>
                  <span style={{ color: "var(--text-muted)" }}>{new Date(t.created_at).toLocaleDateString("id-ID")}</span>
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
