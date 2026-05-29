import { requireRole } from "@/lib/session";
import { db } from "@/lib/db";
import { TrendingUp } from "lucide-react";
import ExportToPDF from "./ExportToPDF";
import SharePerformance from "./SharePerformance";

export const metadata = { title: "Performance — HNS IT Center" };

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function getTicketPoints(type: string): number {
  if (type === "pc_build") return 4;
  if (type === "service") return 3;
  return 2;
}

type TicketDetails = { count: number; totalHours: number; timedCount: number; };

type Row = {
  id: string;
  name: string;
  shift: string | null;
  workDays: string[];
  tickets: number;
  success: number;
  failed: number;
  points: number;
  activeTickets: number;
  details?: Record<string, TicketDetails>;
};

export default async function AdminPerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string; store?: string }>;
}) {
  await requireRole("Administrator");
  const params = await searchParams;

  const now = new Date();
  const filterMonth = params.month ? parseInt(params.month) : null;
  const filterYear  = params.year  ? parseInt(params.year)  : null;
  const filterStore = params.store || null;

  const stores = await db.storeLocation.findMany({
    where: { is_active: true },
    select: { id: true, name: true, code: true },
    orderBy: { name: "asc" },
  });

  let allowedTechIds: Set<string> | null = null;
  if (filterStore) {
    const assignments = await db.technicianStoreAssignment.findMany({
      where: { store_id: filterStore },
      select: { technician_id: true },
    });
    allowedTechIds = new Set(assignments.map((a) => a.technician_id));
  }

  let rows: Row[] = [];

  if (filterMonth && filterYear) {
    // Period mode: join via tickets completed in the period
    const startDate = new Date(filterYear, filterMonth - 1, 1);
    const endDate   = new Date(filterYear, filterMonth, 1);

    // Fetch done + failed tickets in parallel, then batch-resolve users
    // Collect all unique technician IDs from both done and failed tickets in parallel
    const [doneTickets, failedTickets] = await Promise.all([
      db.ticket.findMany({
        where: {
          status: "done",
          technician_id: { not: null },
          status_logs: {
            some: {
              new_status: "done",
              created_at: { gte: startDate, lt: endDate },
            },
          },
        },
        select: { id: true, ticket_type: true, technician_id: true },
      }),
      db.ticket.findMany({
        where: {
          status: { in: ["cancelled", "rejected"] },
          technician_id: { not: null },
          status_logs: {
            some: {
              new_status: { in: ["cancelled", "rejected"] },
              created_at: { gte: startDate, lt: endDate },
            },
          },
        },
        select: { technician_id: true },
      }),
    ]);

    // Batch-fetch all relevant users in ONE query (eliminates N+1)
    const allTechIds = [...new Set([
      ...doneTickets.map((t) => t.technician_id!),
      ...failedTickets.map((t) => t.technician_id!),
    ].filter(Boolean))];

    const allUsers = await db.user.findMany({
      where: { id: { in: allTechIds } },
      select: { id: true, name: true, shift: true, work_days: true },
    });
    const allUserMap = new Map(allUsers.map((u) => [u.id, u]));

    const techMap = new Map<string, Row>();

    const getOrCreate = (techId: string): Row => {
      if (!techMap.has(techId)) {
        const u = allUserMap.get(techId);
        techMap.set(techId, {
          id: techId,
          name: u?.name ?? "Unknown",
          shift: u?.shift ?? null,
          workDays: Array.isArray(u?.work_days) ? (u!.work_days as string[]) : [],
          tickets: 0, success: 0, failed: 0, points: 0,
          activeTickets: 0,
        });
      }
      return techMap.get(techId)!;
    };

    for (const t of doneTickets) {
      if (!t.technician_id) continue;
      const row = getOrCreate(t.technician_id);
      row.tickets++;
      row.success++;
      row.points += getTicketPoints(t.ticket_type);
    }
    for (const t of failedTickets) {
      if (!t.technician_id) continue;
      const row = getOrCreate(t.technician_id);
      row.tickets++;
      row.failed++;
    }

    // Fetch active tickets for display
    const activeTicketsData = await db.ticket.groupBy({
      by: ["technician_id"],
      where: { technician_id: { in: Array.from(techMap.keys()) }, status: { in: ["waiting", "on_progress"] } },
      _count: { id: true },
    });
    for (const data of activeTicketsData) {
      if (!data.technician_id) continue;
      const row = techMap.get(data.technician_id);
      if (row) { row.activeTickets = data._count.id; }
    }

    rows = Array.from(techMap.values()).sort((a, b) => b.points - a.points);

  } else {
    // All-time mode: use TechnicianPerformance + join technician and workload separately
    const performance = await db.technicianPerformance.findMany({
      orderBy: { total_points_completed: "desc" },
    });

    const techIds = performance.map((p) => p.technician_id);

    const users = await db.user.findMany({
      where: { id: { in: techIds } },
      select: { id: true, name: true, shift: true, work_days: true },
    });
    const activeTicketsData = await db.ticket.groupBy({
      by: ["technician_id"],
      where: { technician_id: { in: techIds }, status: { in: ["waiting", "on_progress"] } },
      _count: { id: true },
    });

    const userMap  = new Map(users.map((u) => [u.id, u]));
    const activeMap = new Map(activeTicketsData.map((d) => [d.technician_id, d._count.id]));

    rows = performance.map((p) => {
      const u  = userMap.get(p.technician_id);
      return {
        id: p.technician_id,
        name: u?.name ?? "Unknown",
        shift: u?.shift ?? null,
        workDays: Array.isArray(u?.work_days) ? (u!.work_days as string[]) : [],
        tickets: p.tickets_handled,
        success: p.success_count,
        failed: p.failed_count,
        points: p.total_points_completed,
        activeTickets: activeMap.get(p.technician_id) ?? 0,
      };
    });
  }

  if (allowedTechIds) {
    rows = rows.filter((r) => allowedTechIds!.has(r.id));
  }

  // Fetch detailed tickets for all displayed technicians to compute average times
  const techIds = rows.map(r => r.id);
  const startDate = filterMonth && filterYear ? new Date(filterYear, filterMonth - 1, 1) : null;
  const endDate   = filterMonth && filterYear ? new Date(filterYear, filterMonth, 1) : null;

  const completedTickets = await db.ticket.findMany({
    where: {
      technician_id: { in: techIds },
      status: "done",
      ...(startDate && endDate ? {
        status_logs: {
          some: {
            new_status: "done",
            created_at: { gte: startDate, lt: endDate },
          }
        }
      } : {})
    },
    select: {
      technician_id: true,
      ticket_type: true,
      time_logs: { select: { event: true, created_at: true }, orderBy: { created_at: "asc" } }
    }
  });

  const rowMap = new Map(rows.map(r => [r.id, r]));

  // We need calculateWorkingTimeMs, let's just copy the logic here or import it.
  // Actually, wait, calculateWorkingTimeMs is in @/lib/utils, let's use it.
  // Since we are doing a replace, let's make sure it's imported at the top.
  // Or better yet, just inline it for safety if we can't easily add the import.
  // We can just calculate the time logs directly here.

  for (const t of completedTickets) {
    if (!t.technician_id) continue;
    const row = rowMap.get(t.technician_id);
    if (!row) continue;

    if (!row.details) row.details = {};
    if (!row.details[t.ticket_type]) row.details[t.ticket_type] = { count: 0, totalHours: 0, timedCount: 0 };
    
    const det = row.details[t.ticket_type];
    det.count++;

    let totalMs = 0;
    let lastStart: number | null = null;
    for (const log of t.time_logs) {
      if (log.event === "START" || log.event === "RESUME") {
        lastStart = log.created_at.getTime();
      } else if (log.event === "PAUSE" || log.event === "DONE") {
        if (lastStart) {
          totalMs += log.created_at.getTime() - lastStart;
          lastStart = null;
        }
      }
    }
    // If it never recorded a DONE for some reason, we do not add Date.now() because it's a completed ticket.
    
    if (totalMs > 0) {
      det.totalHours += totalMs / (1000 * 60 * 60);
      det.timedCount++;
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <TrendingUp size={24} /> Performance Tracking
          </h1>
          <p style={{ color: "var(--text-muted)", marginTop: "0.25rem" }}>
            {filterMonth && filterYear
              ? `${MONTHS[filterMonth - 1]} ${filterYear} — filtered period`
              : "All-time technician statistics"}
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
          <form style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <select name="store" defaultValue={filterStore ?? ""} className="form-input" style={{ width: "auto" }}>
              <option value="">All stores</option>
              {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select name="month" defaultValue={filterMonth ?? ""} className="form-input" style={{ width: "auto" }}>
              <option value="">All months</option>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <select name="year" defaultValue={filterYear ?? now.getFullYear()} className="form-input" style={{ width: "auto" }}>
              {[2024, 2025, 2026].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <button type="submit" className="btn btn-primary btn-sm">Apply</button>
            {(filterMonth || filterYear || filterStore) && (
              <a href="/admin/performance" className="btn btn-ghost btn-sm">Clear</a>
            )}
          </form>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            {rows.length > 0 && (
              <SharePerformance 
                topTechnician={rows[0]} 
                monthLabel={filterMonth && filterYear ? `${MONTHS[filterMonth - 1]} ${filterYear}` : "All Time"} 
              />
            )}
            <ExportToPDF
              rows={rows}
              filterMonth={filterMonth}
              filterYear={filterYear}
              monthLabel={filterMonth && filterYear ? `${MONTHS[filterMonth - 1]} ${filterYear}` : "All Time"}
            />
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <TrendingUp size={48} style={{ opacity: 0.2 }} />
            <p>No performance data for the selected period.</p>
          </div>
        </div>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Rank</th><th>Technician</th><th>Shift</th>
                <th>Active Tickets</th><th>Tickets Completed</th>
                <th>Success</th><th>Cancelled</th><th>Points</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p, i) => {
                return (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 800, color: i === 0 ? "#ca8a04" : "var(--text-muted)" }}>
                      {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{p.name}</div>
                      {p.details && (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.25rem", marginTop: "0.5rem", minWidth: "220px" }}>
                          {Object.entries(p.details).map(([type, stats]) => {
                            const avg = stats.timedCount > 0 ? (stats.totalHours / stats.timedCount).toFixed(1) : null;
                            const typeLabel = type.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
                            return (
                              <div key={type} style={{ fontSize: "0.7rem", color: "var(--text-secondary)", background: "var(--bg-light)", padding: "0.35rem 0.5rem", borderRadius: "0.375rem", border: "1px solid var(--border-light)" }}>
                                <div style={{ fontWeight: 600, color: "var(--text-primary)", marginBottom: "0.1rem" }}>{typeLabel}: {stats.count}</div>
                                <div style={{ opacity: 0.8, fontSize: "0.65rem" }}>
                                  {avg ? `Avg: ${avg} H` : "No tracked time"}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </td>
                    <td style={{ textTransform: "capitalize" }}>{p.shift ?? "—"}</td>
                    <td>
                      <span className="badge badge-technician">
                        {p.activeTickets} active
                      </span>
                    </td>
                    <td style={{ fontWeight: 600 }}>{p.tickets}</td>
                    <td style={{ color: "#16a34a", fontWeight: 600 }}>{p.success}</td>
                    <td style={{ color: "var(--accent)", fontWeight: 600 }}>{p.failed}</td>
                    <td style={{ fontWeight: 700, color: "var(--primary)" }}>{p.points}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
