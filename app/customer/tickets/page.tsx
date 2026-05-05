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
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const session = await requireRole("Customer", "Sales");
  const params = await searchParams;
  const statusFilter = params.status || "all";
  const page = Math.max(1, parseInt(params.page || "1") || 1);
  const skip = (page - 1) * PAGE_SIZE;

  const where = {
    user_id: session.userId,
    ...(statusFilter !== "all" ? { status: statusFilter as any } : {}),
  };

  const [tickets, totalCount] = await Promise.all([
    db.ticket.findMany({
      where,
      orderBy: { created_at: "desc" },
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

  const buildHref = (p: number) => {
    const base = statusFilter === "all" ? "/customer/tickets" : `/customer/tickets?status=${statusFilter}`;
    return p === 1 ? (statusFilter === "all" ? "/customer/tickets" : base) : `${base}${statusFilter === "all" ? "?" : "&"}page=${p}`;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1>My Tickets</h1>
          <p style={{ color: "var(--text-muted)", marginTop: "0.25rem" }}>
            Track and manage all your service requests
          </p>
        </div>
        <Link href="/customer/tickets/create" className="btn btn-primary">
          <PlusCircle size={16} />
          New Ticket
        </Link>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {STATUS_FILTERS.map((s) => (
          <Link
            key={s}
            href={s === "all" ? "/customer/tickets" : `/customer/tickets?status=${s}`}
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
        ))}
      </div>

      {/* Desktop table */}
      <div className="admin-ticket-table">
        <div className="table-wrapper">
          {tickets.length === 0 ? (
            <div className="empty-state">
              <Ticket size={40} style={{ opacity: 0.3 }} />
              <p>No tickets found</p>
              {statusFilter === "all" && (
                <Link href="/customer/tickets/create" className="btn btn-primary btn-sm">
                  Create your first ticket
                </Link>
              )}
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Ticket Code</th>
                  <th>Type</th>
                  <th>Device</th>
                  <th>Status</th>
                  <th>Technician</th>
                  <th>Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => (
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
                    <td style={{ textTransform: "capitalize" }}>{t.ticket_type.replace("_", " ")}</td>
                    <td style={{ color: "var(--text-muted)" }}>{t.device_type.replace("_", " ")}</td>
                    <td><Badge variant={t.status} /></td>
                    <td style={{ color: "var(--text-muted)" }}>{t.technician?.name ?? "—"}</td>
                    <td style={{ color: "var(--text-muted)", whiteSpace: "nowrap" }}>{new Date(t.created_at).toLocaleDateString("id-ID")}</td>
                    <td><Link href={`/customer/tickets/${t.id}`} className="btn btn-secondary btn-sm">Open</Link></td>
                  </tr>
                ))}
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
            {statusFilter === "all" && (
              <Link href="/customer/tickets/create" className="btn btn-primary btn-sm">Create your first ticket</Link>
            )}
          </div>
        ) : tickets.map((t) => (
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
        ))}
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
