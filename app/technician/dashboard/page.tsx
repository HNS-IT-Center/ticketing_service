import { requireRole } from "@/lib/session";
import { db } from "@/lib/db";
import Link from "next/link";
import Badge from "@/components/ui/Badge";
import AvailableTickets from "./AvailableTickets";
import { Ticket, CheckCircle, Trophy, ShieldCheck } from "lucide-react";
import { getTopTechnicianOfMonth, getTopStoreOfMonth, getUserTitles } from "@/lib/performance";

export const metadata = { title: "Technician Dashboard — HNS IT Center" };

function getTicketPoints(type: string, deviceType?: string | null): number {
  if (type === "pc_build") return 4;
  if (type === "service") return 5;
  if (type === "cleaning" && deviceType === "PC_Gaming") return 4;
  return 2;
}

export default async function TechnicianDashboard() {
  const session = await requireRole("Technician");

  const now = new Date();
  const lastMonth     = now.getMonth() === 0 ? 12 : now.getMonth();
  const lastMonthYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

  // ── STEP 1: Fire all queries that don't depend on each other simultaneously.
  // The only dependency is: unassigned tickets need storeIds (from assignments).
  // We resolve that by chaining unassigned off assignments via .then() — it fires
  // as soon as assignments resolves without blocking any other parallel queries.

  const assignmentsPromise = db.technicianStoreAssignment.findMany({
    where: { technician_id: session.userId },
    select: { store_id: true },
  });

  // Chain unassigned + pending requests off assignments (they need storeIds).
  // All three fire as one group the moment assignmentsPromise resolves.
  const storeRelatedPromise = assignmentsPromise.then((assignments) => {
    const storeIds = assignments.map((a) => a.store_id);
    return Promise.all([
      db.ticket.findMany({
        where: {
          technician_id: null,
          status: "waiting",
          OR: [
            { store_location_id: { in: storeIds } },
            { store_location_id: null },
          ],
        },
        orderBy: { created_at: "asc" },
        take: 20,
        select: { id: true, ticket_code: true, ticket_type: true, device_type: true, created_at: true, is_for_self: true, customer_name: true, user: { select: { name: true } } },
      }),
      db.ticketAssignmentRequest.findMany({
        where: { technician_id: session.userId, status: "pending" },
        select: { ticket_id: true },
      }),
      db.ticketAssignmentRequest.findMany({
        where: { status: "pending" },
        select: { ticket_id: true, technician_id: true },
      }),
    ] as const);
  });

  // All other queries fire immediately in parallel — no waiting
  const [
    [userInfo, myTickets, performance, topTechId, topStoreId, titles],
    assignments,
    [unassigned, myPendingRequests, allPendingRequests],
  ] = await Promise.all([
    Promise.all([
      db.user.findUnique({
        where: { id: session.userId },
        select: { is_team_leader: true, active_title: true },
      }),
      db.ticket.findMany({
        where: { technician_id: session.userId, status: { in: ["waiting", "on_progress"] } },
        orderBy: { updated_at: "desc" },
        take: 10,
        select: { id: true, ticket_code: true, ticket_type: true, device_type: true, status: true, technician_id: true, is_for_self: true, customer_name: true, user: { select: { name: true } } },
      }),
      db.technicianPerformance.findUnique({ where: { technician_id: session.userId }, select: { tickets_handled: true, success_count: true } }),
      getTopTechnicianOfMonth(lastMonth, lastMonthYear),
      getTopStoreOfMonth(lastMonth, lastMonthYear),
      getUserTitles(session.userId),
    ] as const),
    assignmentsPromise,
    storeRelatedPromise,
  ]);

  const isCoordinator  = userInfo?.is_team_leader ?? false;
  const storeIds       = assignments.map((a) => a.store_id);

  // Check coordinator's store win
  const isTopTechLastMonth = !isCoordinator && topTechId === session.userId;
  const isCoordWinner      = isCoordinator && topStoreId !== null && storeIds.includes(topStoreId);

  // Find equipped title
  const activeTitle = titles.find((t) => t.title_key === userInfo?.active_title) ?? null;

  // IDs where I have the pending request (show amber + Cancel)
  const myRequestedIds = new Set(myPendingRequests.map((r) => r.ticket_id));
  // IDs where SOMEONE ELSE has the pending request (show gray "Requested by other")
  const otherRequestedIds = new Set(
    allPendingRequests
      .filter((r) => r.technician_id !== session.userId)
      .map((r) => r.ticket_id)
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.75rem" }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
          <h1>{isCoordinator ? "Store Coordinator Dashboard" : "Technician Dashboard"}</h1>

          {/* Technician of the Month badge */}
          {isTopTechLastMonth && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", background: "#fef3c7", color: "#b45309", padding: "0.25rem 0.75rem", borderRadius: "999px", fontSize: "0.75rem", fontWeight: 700, border: "1px solid #fde68a" }}>
              <Trophy size={14} /> Technician of the Month
            </span>
          )}

          {/* Coordinator of the Month badge */}
          {isCoordWinner && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", background: "#f3e8ff", color: "#6b21a8", padding: "0.25rem 0.75rem", borderRadius: "999px", fontSize: "0.75rem", fontWeight: 700, border: "1px solid #e9d5ff" }}>
              <ShieldCheck size={14} /> Coordinator of the Month
            </span>
          )}

          {/* Equipped title badge */}
          {activeTitle && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", background: "rgba(22,70,157,0.1)", color: "var(--primary)", padding: "0.25rem 0.75rem", borderRadius: "999px", fontSize: "0.75rem", fontWeight: 700, border: "1px solid rgba(22,70,157,0.25)" }}>
              {activeTitle.emoji} {activeTitle.title_label}
            </span>
          )}
        </div>
        <p style={{ color: "var(--text-muted)", marginTop: "0.25rem" }}>
          {isCoordinator ? "Manage your store and assigned tickets" : "Manage your assigned tickets and workload"}
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
                        <td><span className="badge badge-technician">{getTicketPoints(t.ticket_type, t.device_type)} pts</span></td>
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
                      <span className="badge badge-technician">{getTicketPoints(t.ticket_type, t.device_type)} pts</span>
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
          myRequestedIds={Array.from(myRequestedIds)}
          otherRequestedIds={Array.from(otherRequestedIds)}
        />
      </div>
    </div>
  );
}
