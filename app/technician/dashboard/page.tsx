import { requireRole } from "@/lib/session";
import { db } from "@/lib/db";
import Link from "next/link";
import Badge from "@/components/ui/Badge";
import TakeTicketButton from "./TakeTicketButton";
import AvailableTickets from "./AvailableTickets";
import { Ticket, CheckCircle, Trophy } from "lucide-react";
import { getTopTechnicianOfMonth } from "@/lib/performance";

export const metadata = { title: "Technician Dashboard — HNS IT Center" };

function getTicketPoints(type: string) {
  if (type === "pc_build") return 4;
  if (type === "service") return 3;
  return 2;
}

export default async function TechnicianDashboard() {
  const session = await requireRole("Technician");

  // Get technician's assigned stores
  const assignments = await db.technicianStoreAssignment.findMany({
    where: { technician_id: session.userId },
    select: { store_id: true },
  });
  const storeIds = assignments.map((a) => a.store_id);

  const [unassigned, myTickets, workload, performance] = await Promise.all([
    db.ticket.findMany({
      where: { 
        technician_id: null, 
        status: "waiting",
        OR: [
          { store_location_id: { in: storeIds } },
          { store_location_id: null }
        ]
      },
      orderBy: { created_at: "asc" },
      take: 10,
      include: { user: { select: { name: true } } },
    }),
    db.ticket.findMany({
      where: { technician_id: session.userId, status: { in: ["waiting", "on_progress"] } },
      orderBy: { updated_at: "desc" },
      take: 10,
      include: { user: { select: { name: true } } },
    }),
    db.technicianWorkload.findUnique({ where: { technician_id: session.userId } }),
    db.technicianPerformance.findUnique({ where: { technician_id: session.userId } }),
  ]);

  const currentPoints = workload?.current_points ?? 0;
  const maxPoints = workload?.max_points ?? 7;
  const pct = Math.min((currentPoints / maxPoints) * 100, 100);

  const now = new Date();
  const lastMonth = now.getMonth() === 0 ? 12 : now.getMonth();
  const lastMonthYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const topTechLastMonth = await getTopTechnicianOfMonth(lastMonth, lastMonthYear);
  const isTopTechLastMonth = topTechLastMonth === session.userId;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.75rem" }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <h1>Technician Dashboard</h1>
          {isTopTechLastMonth && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", background: "#fef3c7", color: "#b45309", padding: "0.25rem 0.75rem", borderRadius: "999px", fontSize: "0.75rem", fontWeight: 700, border: "1px solid #fde68a" }}>
              <Trophy size={14} /> Technician of the Month
            </span>
          )}
        </div>
        <p style={{ color: "var(--text-muted)", marginTop: "0.25rem" }}>
          Manage your assigned tickets and workload
        </p>
      </div>

      {/* Stats row */}
      <div className="tech-stats-grid">
        {/* Workload */}
        <div className="stat-card tech-workload-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
            <h3 style={{ fontSize: "1rem" }}>Current Workload</h3>
            <span style={{ fontWeight: 700, fontSize: "1.125rem", color: pct >= 100 ? "var(--accent)" : "var(--primary)" }}>
              {currentPoints} / {maxPoints} pts
            </span>
          </div>
          <div className="workload-bar">
            <div className={`workload-fill ${pct >= 100 ? "danger" : ""}`} style={{ width: `${pct}%` }} />
          </div>
          <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.5rem" }}>
            {pct >= 100 ? "⚠️ Workload full — complete tickets to take new ones" : `${maxPoints - currentPoints} pts remaining`}
          </p>
        </div>

        {/* Stat mini cards */}
        {[
          { label: "Handled", value: performance?.tickets_handled ?? 0, icon: <Ticket size={20} />, color: "var(--primary)" },
          { label: "Success", value: performance?.success_count ?? 0, icon: <CheckCircle size={20} />, color: "#16a34a" },
        ].map((s) => (
          <div key={s.label} className="stat-card">
            <div style={{ width: "2.25rem", height: "2.25rem", borderRadius: "0.75rem", background: `${s.color}18`, display: "flex", alignItems: "center", justifyContent: "center", color: s.color }}>
              {s.icon}
            </div>
            <div>
              <div style={{ fontSize: "1.75rem", fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* My Assigned Tickets */}
      <div className="card">
        <h3 style={{ marginBottom: "1rem" }}>My Active Tickets</h3>
        {myTickets.length === 0 ? (
          <div className="empty-state" style={{ padding: "2rem" }}>
            <Ticket size={32} style={{ opacity: 0.3 }} />
            <p>No active tickets assigned to you</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="admin-ticket-table">
              <div className="table-wrapper" style={{ border: "none", boxShadow: "none" }}>
                <table>
                  <thead><tr>
                    <th>Ticket Code</th><th>Type</th><th>Customer</th><th>Points</th><th>Status</th><th></th>
                  </tr></thead>
                  <tbody>
                    {myTickets.map((t) => (
                      <tr key={t.id}>
                        <td style={{ fontFamily: "monospace", fontWeight: 600, color: "var(--primary)" }}>{t.ticket_code}</td>
                        <td style={{ textTransform: "capitalize" }}>{t.ticket_type.replace("_", " ")}</td>
                        <td>{t.user.name}</td>
                        <td><span className="badge badge-technician">{getTicketPoints(t.ticket_type)} pts</span></td>
                        <td><Badge variant={t.status} technicianId={t.technician_id} /></td>
                        <td><Link href={`/technician/tickets/${t.id}`} className="btn btn-secondary btn-sm">Manage</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile cards */}
            <div className="admin-ticket-cards">
              {myTickets.map((t) => (
                <Link key={t.id} href={`/technician/tickets/${t.id}`} style={{ textDecoration: "none" }}>
                  <div className="mobile-ticket-card">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--primary)" }}>{t.ticket_code}</span>
                      <Badge variant={t.status} technicianId={t.technician_id} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                      <span style={{ textTransform: "capitalize" }}>{t.ticket_type.replace("_", " ")}</span>
                      <span>{t.user.name}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span className="badge badge-technician">{getTicketPoints(t.ticket_type)} pts</span>
                      <span style={{ fontSize: "0.8125rem", color: "var(--primary)", fontWeight: 500 }}>Manage →</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Unassigned Tickets */}
      <div className="card">
        <h3 style={{ marginBottom: "1rem" }}>
          Available Tickets <span style={{ fontSize: "0.875rem", color: "var(--text-muted)", fontWeight: 400 }}>({unassigned.length})</span>
        </h3>
        <AvailableTickets 
          tickets={unassigned} 
          currentPoints={currentPoints} 
          maxPoints={maxPoints} 
        />
      </div>
    </div>
  );
}
