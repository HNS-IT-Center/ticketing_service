import { requireRole } from "@/lib/session";
import { db } from "@/lib/db";
import Link from "next/link";
import Badge from "@/components/ui/Badge";
import { Users, Ticket, CheckCircle, Clock, AlertCircle, TrendingUp } from "lucide-react";

export const metadata = { title: "Admin Dashboard — TechServe" };

export default async function AdminDashboard() {
  await requireRole("Administrator");

  const [
    totalUsers,
    totalTickets,
    assignedTickets,
    closedTickets,
    recentTickets,
    topTechnicians,
  ] = await Promise.all([
    db.user.groupBy({ by: ["role"], _count: { role: true } }),
    db.ticket.count(),
    db.ticket.count({ where: { technician_id: { not: null } } }),
    db.ticket.count({ where: { status: { in: ["done", "cancelled", "rejected"] } } }),
    db.ticket.findMany({
      orderBy: { created_at: "desc" },
      take: 8,
      include: {
        user: { select: { name: true } },
        technician: { select: { name: true } },
      },
    }),
    db.technicianPerformance.findMany({
      orderBy: { total_points_completed: "desc" },
      take: 5,
      include: { technician: { select: { name: true } } },
    }),
  ]);

  const countByRole = Object.fromEntries(
    totalUsers.map((u) => [u.role, u._count.role])
  );

  const statCards = [
    { label: "Technicians", value: countByRole.Technician ?? 0, icon: <Users size={20} />, color: "var(--primary)", href: "/admin/users?role=Technician" },
    { label: "Customers", value: countByRole.Customer ?? 0, icon: <Users size={20} />, color: "#7c3aed", href: "/admin/users?role=Customer" },
    { label: "Sales", value: countByRole.Sales ?? 0, icon: <Users size={20} />, color: "#0891b2", href: "/admin/users?role=Sales" },
    { label: "Total Tickets", value: totalTickets, icon: <Ticket size={20} />, color: "#ca8a04", href: "/admin/tickets" },
    { label: "Assigned", value: assignedTickets, icon: <CheckCircle size={20} />, color: "#16a34a", href: "/admin/tickets?assigned=true" },
    { label: "Unassigned", value: totalTickets - assignedTickets, icon: <Clock size={20} />, color: "#dc2626", href: "/admin/tickets?assigned=false" },
    { label: "Closed", value: closedTickets, icon: <AlertCircle size={20} />, color: "var(--text-muted)", href: "/admin/tickets?closed=true" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      <div>
        <h1>Admin Dashboard</h1>
        <p style={{ color: "var(--text-muted)", marginTop: "0.25rem" }}>System overview and management</p>
      </div>

      {/* Stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "1rem" }}>
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

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "1.5rem" }}>
        {/* Recent Tickets */}
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h3>Recent Tickets</h3>
            <Link href="/admin/tickets" style={{ fontSize: "0.875rem", color: "var(--primary)", fontWeight: 500 }}>View all →</Link>
          </div>
          <div className="table-wrapper" style={{ border: "none", boxShadow: "none" }}>
            <table>
              <thead><tr><th>Code</th><th>Type</th><th>Customer</th><th>Status</th><th>Technician</th></tr></thead>
              <tbody>
                {recentTickets.map((t) => (
                  <tr key={t.id}>
                    <td><Link href={`/admin/tickets/${t.id}`} style={{ fontFamily: "monospace", fontWeight: 600, color: "var(--primary)" }}>{t.ticket_code}</Link></td>
                    <td style={{ textTransform: "capitalize", fontSize: "0.875rem" }}>{t.ticket_type.replace("_", " ")}</td>
                    <td style={{ fontSize: "0.875rem" }}>{t.user.name}</td>
                    <td><Badge variant={t.status} /></td>
                    <td style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>{t.technician?.name ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Technicians */}
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
                  <p style={{ fontWeight: 600, fontSize: "0.9rem" }}>{t.technician.name}</p>
                  <p style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{t.tickets_handled} tickets</p>
                </div>
                <span style={{ fontWeight: 700, color: "var(--primary)" }}>{t.total_points_completed} pts</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
