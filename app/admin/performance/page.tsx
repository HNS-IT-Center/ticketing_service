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
  currentLoad: number;
  maxLoad: number;
  details?: Record<string, TicketDetails>;
};

export default async function AdminPerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string }>;
}) {
  await requireRole("Administrator");
  const params = await searchParams;

  const now = new Date();
  const filterMonth = params.month ? parseInt(params.month) : null;
  const filterYear  = params.year  ? parseInt(params.year)  : null;

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
          currentLoad: 0, maxLoad: 7,
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

    // Fetch workload separately for display
    const workloads = await db.technicianWorkload.findMany({
      where: { technician_id: { in: Array.from(techMap.keys()) } },
      select: { technician_id: true, current_points: true, max_points: true },
    });
    for (const wl of workloads) {
      const row = techMap.get(wl.technician_id);
      if (row) { row.currentLoad = wl.current_points; row.maxLoad = wl.max_points; }
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
    const workloads = await db.technicianWorkload.findMany({
      where: { technician_id: { in: techIds } },
      select: { technician_id: true, current_points: true, max_points: true },
    });

    const userMap  = new Map(users.map((u) => [u.id, u]));
    const loadMap  = new Map(workloads.map((w) => [w.technician_id, w]));

    rows = performance.map((p) => {
      const u  = userMap.get(p.technician_id);
      const wl = loadMap.get(p.technician_id);
      return {
        id: p.technician_id,
        name: u?.name ?? "Unknown",
        shift: u?.shift ?? null,
        workDays: Array.isArray(u?.work_days) ? (u!.work_days as string[]) : [],
        tickets: p.tickets_handled,
        success: p.success_count,
        failed: p.failed_count,
        points: p.total_points_completed,
        currentLoad: wl?.current_points ?? 0,
        maxLoad: wl?.max_points ?? 7,
      };
    });
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
      status_logs: { select: { new_status: true, created_at: true } }
    }
  });

  const rowMap = new Map(rows.map(r => [r.id, r]));

  for (const t of completedTickets) {
    if (!t.technician_id) continue;
    const row = rowMap.get(t.technician_id);
    if (!row) continue;

    if (!row.details) row.details = {};
    if (!row.details[t.ticket_type]) row.details[t.ticket_type] = { count: 0, totalHours: 0, timedCount: 0 };
    
    const det = row.details[t.ticket_type];
    det.count++;

    const onProgressLog = t.status_logs.find(l => l.new_status === "on_progress");
    const doneLog = t.status_logs.find(l => l.new_status === "done");
    if (onProgressLog && doneLog) {
      const ms = doneLog.created_at.getTime() - onProgressLog.created_at.getTime();
      if (ms > 0) {
        det.totalHours += ms / (1000 * 60 * 60);
        det.timedCount++;
      }
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
            <select name="month" defaultValue={filterMonth ?? ""} className="form-input" style={{ width: "auto" }}>
              <option value="">All months</option>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <select name="year" defaultValue={filterYear ?? now.getFullYear()} className="form-input" style={{ width: "auto" }}>
              {[2024, 2025, 2026].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <button type="submit" className="btn btn-primary btn-sm">Apply</button>
            {(filterMonth || filterYear) && (
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
                <th>Workload</th><th>Tickets</th>
                <th>Success</th><th>Failed</th><th>Points</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p, i) => {
                const pct = p.maxLoad ? Math.round((p.currentLoad / p.maxLoad) * 100) : 0;
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
                      <div style={{ minWidth: "100px" }}>
                        <div style={{ fontSize: "0.8rem", marginBottom: "0.2rem" }}>
                          {p.currentLoad}/{p.maxLoad} pts
                        </div>
                        <div className="workload-bar">
                          <div className={`workload-fill ${pct >= 100 ? "danger" : ""}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
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
