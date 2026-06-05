import { requireRole } from "@/lib/session";
import { db } from "@/lib/db";
import { unstable_cache } from "next/cache";
import Link from "next/link";
import Badge from "@/components/ui/Badge";
import { Users, Ticket, CheckCircle, Clock, AlertCircle, TrendingUp, ArrowRight, Store } from "lucide-react";

export const metadata = { title: "Dashboard — HNS IT Center" };

export default async function AdminDashboard() {
  const session = await requireRole("Administrator", "Sales");
  const isSales = session.role === "Sales";
  const salesFilter = isSales ? { sales_id: session.userId } : {};

  // Cache semi-static counts for 30 seconds to avoid repeated DB hits
  const getCounts = unstable_cache(
    async () => Promise.all([
      isSales ? Promise.resolve([]) : db.user.groupBy({ by: ["role"], _count: { role: true } }),
      db.ticket.count({ where: salesFilter }),
      db.ticket.count({ where: { ...salesFilter, technician_id: { not: null } } }),
      db.ticket.count({ where: { ...salesFilter, status: { in: ["done", "cancelled", "rejected"] } } }),
      db.storeLocation.count(),
    ]),
    ["admin-dashboard-counts", session.userId],
    { revalidate: 30 }
  );

  // Fire counts + recent tickets + top technicians all in parallel
  const [counts, recentTickets, topTechnicians] = await Promise.all([
    getCounts(),
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

  const [totalUsersRaw, totalTickets, assignedTickets, closedTickets, totalStores] = counts;
  const totalUsers = totalUsersRaw as Awaited<ReturnType<typeof db.user.groupBy>>;


  const countByRole = Object.fromEntries(
    (totalUsers as { role: string; _count: { role: number } }[]).map((u) => [u.role, u._count.role])
  );

  const statCards = [
    ...(!isSales ? [
      { label: "Technicians", value: countByRole.Technician ?? 0, icon: <Users size={20} />, color: "var(--primary)", href: "/admin/users?role=Technician" },
      { label: "Stores", value: totalStores ?? 0, icon: <Store size={20} />, color: "#7c3aed", href: "/admin/stores" },
      { label: "Sales", value: countByRole.Sales ?? 0, icon: <Users size={20} />, color: "#0891b2", href: "/admin/users?role=Sales" },
    ] : []),
    { label: "Total Tickets", value: totalTickets, icon: <Ticket size={20} />, color: "#ca8a04", href: "/admin/tickets" },
    { label: "Assigned", value: assignedTickets, icon: <CheckCircle size={20} />, color: "#16a34a", href: "/admin/tickets?assigned=true" },
    { label: "Unassigned", value: totalTickets - assignedTickets, icon: <Clock size={20} />, color: "#dc2626", href: "/admin/tickets?assigned=false" },
    { label: "Closed", value: closedTickets, icon: <AlertCircle size={20} />, color: "var(--text-muted)", href: "/admin/tickets?status=done" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.75rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1>Admin Dashboard</h1>
          <p style={{ color: "var(--text-muted)", marginTop: "0.25rem" }}>System overview and management</p>
        </div>
        <Link href="/admin/tickets/create" className="btn btn-primary btn-sm flex items-center gap-1.5" style={{ padding: "0.5rem 1rem" }}>
          <span style={{ fontSize: "1.2rem", lineHeight: 1 }}>+</span> New Ticket
        </Link>
      </div>

      {/* Stats grid — auto-fill, collapses to 2-col on mobile */}
      <div className="admin-stats-grid">
        {statCards.map((s) => (
          <Link key={s.label} href={s.href} className="stat-card" style={{ textDecoration: "none" }}>
            <div style={{ width: "2.25rem", height: "2.25rem", borderRadius: "0.75rem", background: `${s.color}18`, display: "flex", alignItems: "center", justifyContent: "center", color: s.color }}>
              {s.icon}
            </div>
            <div>
              <div style={{ fontSize: "1.75rem", fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>{s.label}</div>
            </div>
          </Link>
        ))}
      </div>

      {/* Recent Tickets */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h3>Recent Tickets</h3>
          <Link href="/admin/tickets" style={{ fontSize: "0.875rem", color: "var(--primary)", fontWeight: 500, display: "flex", alignItems: "center", gap: "0.25rem" }}>
            View all <ArrowRight size={14} />
          </Link>
        </div>

        {/* Desktop table */}
        <div className="admin-ticket-table">
          <div className="table-wrapper" style={{ border: "none", boxShadow: "none" }}>
            <table>
              <thead><tr><th>Code</th><th>Type</th><th>Customer</th><th>Status</th><th>Technician</th></tr></thead>
              <tbody>
                {recentTickets.map((t) => (
                  <tr key={t.id}>
                    <td><Link href={`/admin/tickets/${t.id}`} style={{ fontFamily: "monospace", fontWeight: 600, color: "var(--primary)" }}>{t.ticket_code}</Link></td>
                    <td style={{ textTransform: "capitalize", fontSize: "0.875rem" }}>{t.ticket_type.replace("_", " ")}</td>
                    <td style={{ fontSize: "0.875rem" }}>{t.is_for_self ? (t.user?.name || "Guest") : (t.customer_name || "Guest")}</td>
                    <td><Badge variant={t.status} technicianId={t.technician_id} /></td>
                    <td style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>{t.technician?.name ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mobile card list */}
        <div className="admin-ticket-cards">
          {recentTickets.map((t) => (
            <Link
              key={t.id}
              href={`/admin/tickets/${t.id}`}
              style={{ textDecoration: "none" }}
            >
              <div style={{
                padding: "0.875rem",
                border: "1px solid var(--border-light)",
                borderRadius: "var(--radius-md)",
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
                marginBottom: "0.5rem",
                background: "var(--white)",
                transition: "box-shadow 0.15s",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--primary)", fontSize: "0.9375rem" }}>
                    {t.ticket_code}
                  </span>
                  <Badge variant={t.status} technicianId={t.technician_id} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                  <span style={{ textTransform: "capitalize" }}>{t.ticket_type.replace("_", " ")}</span>
                  <span>{t.is_for_self ? (t.user?.name || "Guest") : (t.customer_name || "Guest")}</span>
                </div>
                {t.technician && (
                  <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                    🔧 {t.technician.name}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Top Technicians */}
      {!isSales && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h3>Top Technicians</h3>
            <Link href="/admin/performance" style={{ fontSize: "0.875rem", color: "var(--primary)", fontWeight: 500 }}>All →</Link>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {topTechnicians.length === 0 ? (
              <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "1rem" }}>No data yet</p>
            ) : topTechnicians.map((t, i) => (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <span style={{ fontWeight: 800, color: i === 0 ? "#ca8a04" : "var(--text-muted)", fontSize: "1rem", width: "1.5rem" }}>
                  {i === 0 ? "🥇" : `#${i + 1}`}
                </span>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 600, fontSize: "0.9rem" }}>{t.technician?.name ?? "Unknown"}</p>
                  <p style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{t.tickets_handled} tickets</p>
                </div>
                <span style={{ fontWeight: 700, color: "var(--primary)" }}>{t.total_points_completed} pts</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
