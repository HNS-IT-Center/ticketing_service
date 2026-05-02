import { requireRole } from "@/lib/session";
import { db } from "@/lib/db";
import Link from "next/link";
import Badge from "@/components/ui/Badge";
import { Ticket, PlusCircle, Clock, CheckCircle, XCircle } from "lucide-react";

export const metadata = {
  title: "Dashboard — TechServe",
};

export default async function CustomerDashboard() {
  const session = await requireRole("Customer", "Sales");

  const [tickets, unreadCount] = await Promise.all([
    db.ticket.findMany({
      where: { user_id: session.userId },
      orderBy: { created_at: "desc" },
      take: 5,
      include: {
        technician: { select: { name: true } },
      },
    }),
    db.notification.count({
      where: { user_id: session.userId, is_read: false },
    }),
  ]);

  const stats = await db.ticket.groupBy({
    by: ["status"],
    where: { user_id: session.userId },
    _count: { status: true },
  });

  const countByStatus = Object.fromEntries(
    stats.map((s) => [s.status, s._count.status])
  );
  const total = Object.values(countByStatus).reduce((a, b) => a + b, 0);

  const statCards = [
    { label: "Total Tickets", value: total, icon: <Ticket size={22} />, color: "var(--primary)" },
    { label: "Waiting", value: countByStatus.waiting ?? 0, icon: <Clock size={22} />, color: "#ca8a04" },
    { label: "Completed", value: countByStatus.done ?? 0, icon: <CheckCircle size={22} />, color: "#16a34a" },
    { label: "Cancelled", value: (countByStatus.cancelled ?? 0) + (countByStatus.rejected ?? 0), icon: <XCircle size={22} />, color: "var(--accent)" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1>Welcome back, {session.name.split(" ")[0]}! 👋</h1>
          <p style={{ color: "var(--text-muted)", marginTop: "0.25rem" }}>
            Here&apos;s an overview of your service tickets
          </p>
        </div>
        <Link href="/customer/tickets/create" className="btn btn-primary">
          <PlusCircle size={16} />
          New Ticket
        </Link>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "1rem" }}>
        {statCards.map((s) => (
          <div key={s.label} className="stat-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{
                width: "2.5rem", height: "2.5rem", borderRadius: "0.75rem",
                background: `${s.color}18`, display: "flex",
                alignItems: "center", justifyContent: "center", color: s.color,
              }}>
                {s.icon}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "1.875rem", fontWeight: 800, color: s.color, lineHeight: 1 }}>
                {s.value}
              </div>
              <div style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                {s.label}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Tickets */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
          <h3>Recent Tickets</h3>
          <Link href="/customer/tickets" style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--primary)" }}>
            View all →
          </Link>
        </div>

        {tickets.length === 0 ? (
          <div className="empty-state">
            <Ticket size={40} style={{ opacity: 0.3 }} />
            <p>No tickets yet. Create your first one!</p>
            <Link href="/customer/tickets/create" className="btn btn-primary btn-sm">
              Create Ticket
            </Link>
          </div>
        ) : (
          <div className="table-wrapper" style={{ border: "none", boxShadow: "none" }}>
            <table>
              <thead>
                <tr>
                  <th>Ticket Code</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Technician</th>
                  <th>Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => (
                  <tr key={t.id}>
                    <td style={{ fontFamily: "monospace", fontWeight: 600, color: "var(--primary)" }}>
                      {t.ticket_code}
                    </td>
                    <td style={{ textTransform: "capitalize" }}>
                      {t.ticket_type.replace("_", " ")}
                    </td>
                    <td><Badge variant={t.status} /></td>
                    <td style={{ color: "var(--text-muted)" }}>
                      {t.technician?.name ?? "—"}
                    </td>
                    <td style={{ color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                      {new Date(t.created_at).toLocaleDateString("id-ID")}
                    </td>
                    <td>
                      <Link href={`/customer/tickets/${t.id}`} className="btn btn-ghost btn-sm">
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
