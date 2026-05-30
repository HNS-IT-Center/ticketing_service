import { requireRole } from "@/lib/session";
import { db } from "@/lib/db";
import { unstable_cache } from "next/cache";
import Link from "next/link";
import Badge from "@/components/ui/Badge";
import TakeTicketButton from "./TakeTicketButton";
import AvailableTickets from "./AvailableTickets";
import { Ticket, CheckCircle, Trophy } from "lucide-react";

export const metadata = { title: "Technician Dashboard — HNS IT Center" };

function getTicketPoints(type: string) {
  if (type === "pc_build") return 4;
  if (type === "service") return 3;
  return 2;
}

export default async function TechnicianDashboard() {
  const session = await requireRole("Technician");

  const now = new Date();
  const lastMonth = now.getMonth() === 0 ? 12 : now.getMonth();
  const lastMonthYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const lastMonthStart = new Date(lastMonthYear, lastMonth - 1, 1);
  const lastMonthEnd   = new Date(lastMonthYear, lastMonth, 1);

  // All fetches in ONE parallel batch — no sequential round-trips
  const [assignments, myTickets, performance, topTechRow] = await Promise.all([
    db.technicianStoreAssignment.findMany({
      where: { technician_id: session.userId },
      select: { store_id: true },
    }),
    db.ticket.findMany({
      where: { technician_id: session.userId, status: { in: ["waiting", "on_progress"] } },
      orderBy: { updated_at: "desc" },
      take: 10,
      select: { id: true, ticket_code: true, ticket_type: true, device_type: true, status: true, technician_id: true, is_for_self: true, customer_name: true, user: { select: { name: true } } },
    }),
    db.technicianPerformance.findUnique({ where: { technician_id: session.userId }, select: { tickets_handled: true, success_count: true } }),
    // Top technician: use groupBy to avoid loading all ticket rows
    db.ticketStatusLog.groupBy({
      by: ["changed_by"],
      where: { new_status: "done", created_at: { gte: lastMonthStart, lt: lastMonthEnd } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 1,
    }),
  ]);

  const storeIds = assignments.map((a) => a.store_id);
  const topTechId = topTechRow[0]?.changed_by ?? null;
  const isTopTechLastMonth = topTechId === session.userId;

  // Unassigned tickets for this technician's stores — fetched after we know storeIds
  const unassigned = await db.ticket.findMany({
    where: {
      technician_id: null,
      status: "waiting",
      assignment_requests: { none: { status: "pending" } },
      OR: [
        { store_location_id: { in: storeIds } },
        { store_location_id: null },
      ],
    },
    orderBy: { created_at: "asc" },
    take: 10,
    select: { id: true, ticket_code: true, ticket_type: true, device_type: true, created_at: true, is_for_self: true, customer_name: true, user: { select: { name: true } } },
  });

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
                        <td>{t.is_for_self ? (t.user?.name || "Guest") : (t.customer_name || "Guest")}</td>
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
                      <span>{t.is_for_self ? (t.user?.name || "Guest") : (t.customer_name || "Guest")}</span>
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
          tickets={unassigned.map(t => ({
            id: t.id,
            ticket_code: t.ticket_code,
            ticket_type: t.ticket_type,
            device_type: t.device_type,
            created_at: t.created_at,
            user: { name: t.is_for_self ? (t.user?.name || "Guest") : (t.customer_name || "Guest") }
          }))} 
        />
      </div>
    </div>
  );
}
