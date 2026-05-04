import { requireRole } from "@/lib/session";
import { db } from "@/lib/db";
import Link from "next/link";
import Badge from "@/components/ui/Badge";

export const metadata = { title: "All Tickets — HNS IT Center" };

const STATUS_FILTERS = ["all", "waiting", "on_progress", "done", "cancelled", "rejected"] as const;

export default async function AdminTicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  await requireRole("Administrator");
  const params = await searchParams;
  const statusFilter = params.status || "all";
  const query = params.q || "";

  const tickets = await db.ticket.findMany({
    where: {
      ...(statusFilter !== "all" ? { status: statusFilter as any } : {}),
      ...(query ? {
        OR: [
          { ticket_code: { contains: query, mode: "insensitive" } },
          { user: { name: { contains: query, mode: "insensitive" } } },
        ],
      } : {}),
    },
    orderBy: { created_at: "desc" },
    include: {
      user: { select: { name: true } },
      technician: { select: { name: true } },
    },
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1>All Tickets</h1>
          <p style={{ color: "var(--text-muted)", marginTop: "0.25rem" }}>{tickets.length} tickets</p>
        </div>
        <form style={{ display: "flex", gap: "0.5rem" }}>
          <input
            name="q"
            defaultValue={query}
            className="form-input"
            placeholder="Search by code or customer..."
            style={{ width: "220px" }}
          />
          <button type="submit" className="btn btn-primary btn-sm">Search</button>
        </form>
      </div>

      {/* Status tabs */}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {STATUS_FILTERS.map((s) => (
          <Link
            key={s}
            href={s === "all" ? "/admin/tickets" : `/admin/tickets?status=${s}`}
            className="btn btn-sm"
            style={{
              background: statusFilter === s ? "var(--primary)" : "var(--white)",
              color: statusFilter === s ? "#fff" : "var(--text-secondary)",
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
          <table>
            <thead>
              <tr><th>Code</th><th>Type</th><th>Customer</th><th>Technician</th><th>Status</th><th>Date</th><th></th></tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id}>
                  <td style={{ fontFamily: "monospace", fontWeight: 600, color: "var(--primary)" }}>{t.ticket_code}</td>
                  <td style={{ textTransform: "capitalize", fontSize: "0.875rem" }}>{t.ticket_type.replace("_", " ")}</td>
                  <td>{t.user.name}</td>
                  <td style={{ color: "var(--text-muted)" }}>{t.technician?.name ?? <span style={{ color: "var(--accent)", fontSize: "0.875rem" }}>Unassigned</span>}</td>
                  <td><Badge variant={t.status} /></td>
                  <td style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>{new Date(t.created_at).toLocaleDateString("id-ID")}</td>
                  <td><Link href={`/admin/tickets/${t.id}`} className="btn btn-secondary btn-sm">View</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile card list */}
      <div className="admin-ticket-cards">
        {tickets.length === 0 ? (
          <p style={{ textAlign: "center", color: "var(--text-muted)", padding: "2rem" }}>No tickets found</p>
        ) : tickets.map((t) => (
          <Link key={t.id} href={`/admin/tickets/${t.id}`} style={{ textDecoration: "none" }}>
            <div className="mobile-ticket-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--primary)", fontSize: "0.9375rem" }}>
                  {t.ticket_code}
                </span>
                <Badge variant={t.status} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                <span style={{ textTransform: "capitalize" }}>{t.ticket_type.replace("_", " ")}</span>
                <span>{new Date(t.created_at).toLocaleDateString("id-ID")}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem" }}>
                <span style={{ color: "var(--text-secondary)" }}>👤 {t.user.name}</span>
                <span style={{ color: t.technician ? "var(--text-secondary)" : "var(--accent)" }}>
                  {t.technician ? `🔧 ${t.technician.name}` : "Unassigned"}
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
