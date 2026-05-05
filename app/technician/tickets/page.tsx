import { requireRole } from "@/lib/session";
import { db } from "@/lib/db";
import Link from "next/link";
import Badge from "@/components/ui/Badge";
import { Ticket, ChevronLeft, ChevronRight } from "lucide-react";

export const metadata = { title: "My Tickets — HNS IT Center" };

const STATUS_FILTERS = ["all", "waiting", "on_progress", "done", "cancelled"] as const;
const PAGE_SIZE = 10;

export default async function TechnicianTicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const session = await requireRole("Technician");
  const params = await searchParams;
  const statusFilter = params.status || "all";
  const page = Math.max(1, parseInt(params.page || "1") || 1);
  const skip = (page - 1) * PAGE_SIZE;

  const where = {
    technician_id: session.userId,
    ...(statusFilter !== "all" ? { status: statusFilter as any } : {}),
  };

  const [tickets, totalCount] = await Promise.all([
    db.ticket.findMany({
      where,
      orderBy: { updated_at: "desc" },
      take: PAGE_SIZE,
      skip,
      include: { user: { select: { name: true } } },
    }),
    db.ticket.count({ where }),
  ]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const buildHref = (p: number) => {
    const base = statusFilter === "all" ? "/technician/tickets" : `/technician/tickets?status=${statusFilter}`;
    return p === 1 ? base : `${base}${statusFilter === "all" ? "?" : "&"}page=${p}`;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div>
        <h1>My Tickets</h1>
        <p style={{ color: "var(--text-muted)", marginTop: "0.25rem" }}>
          Manage tickets assigned to you
        </p>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {STATUS_FILTERS.map((s) => (
          <Link
            key={s}
            href={s === "all" ? "/technician/tickets" : `/technician/tickets?status=${s}`}
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
              <Ticket size={36} style={{ opacity: 0.3 }} />
              <p>No tickets found</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Ticket Code</th><th>Type</th><th>Customer</th><th>Status</th><th>Updated</th><th></th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => (
                  <tr key={t.id}>
                    <td style={{ fontFamily: "monospace", fontWeight: 600, color: "var(--primary)" }}>{t.ticket_code}</td>
                    <td style={{ textTransform: "capitalize" }}>{t.ticket_type.replace("_", " ")}</td>
                    <td>{t.user.name}</td>
                    <td><Badge variant={t.status} /></td>
                    <td style={{ color: "var(--text-muted)" }}>{new Date(t.updated_at).toLocaleDateString("id-ID")}</td>
                    <td><Link href={`/technician/tickets/${t.id}`} className="btn btn-secondary btn-sm">Manage</Link></td>
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
            <Ticket size={36} style={{ opacity: 0.3 }} />
            <p>No tickets found</p>
          </div>
        ) : tickets.map((t) => (
          <Link key={t.id} href={`/technician/tickets/${t.id}`} style={{ textDecoration: "none" }}>
            <div className="mobile-ticket-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--primary)", fontSize: "0.875rem" }}>
                  {t.ticket_code}
                </span>
                <Badge variant={t.status} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                <span style={{ textTransform: "capitalize" }}>{t.ticket_type.replace("_", " ")}</span>
                <span>👤 {t.user.name}</span>
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                Updated {new Date(t.updated_at).toLocaleDateString("id-ID")}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}>
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
      {totalCount > 0 && (
        <div style={{ textAlign: "center", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
          Showing {skip + 1}–{Math.min(skip + tickets.length, totalCount)} of {totalCount} tickets
        </div>
      )}
    </div>
  );
}
