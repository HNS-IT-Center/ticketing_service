import { requireRole } from "@/lib/session";
import { db } from "@/lib/db";
import Link from "next/link";
import Badge from "@/components/ui/Badge";
import { TrendingUp, Trophy } from "lucide-react";
import LeaderboardSnapshot from "./LeaderboardSnapshot";

export const metadata = { title: "Performance — TechServe" };

export default async function AdminPerformancePage() {
  await requireRole("Administrator");

  const performance = await db.technicianPerformance.findMany({
    orderBy: { total_points_completed: "desc" },
    include: {
      technician: { select: { name: true, shift: true, work_days: true } },
      workload: { select: { current_points: true, max_points: true } },
    },
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <TrendingUp size={24} /> Performance Tracking
          </h1>
          <p style={{ color: "var(--text-muted)", marginTop: "0.25rem" }}>All-time technician statistics</p>
        </div>
        <LeaderboardSnapshot />
      </div>

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
            {performance.map((p, i) => {
              const pct = p.workload ? Math.round((p.workload.current_points / p.workload.max_points) * 100) : 0;
              return (
                <tr key={p.id}>
                  <td style={{ fontWeight: 800, color: i === 0 ? "#ca8a04" : "var(--text-muted)" }}>
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{p.technician.name}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      {Array.isArray(p.technician.work_days) ? (p.technician.work_days as string[]).join(", ") : "—"}
                    </div>
                  </td>
                  <td style={{ textTransform: "capitalize" }}>{p.technician.shift ?? "—"}</td>
                  <td>
                    {p.workload ? (
                      <div style={{ minWidth: "100px" }}>
                        <div style={{ fontSize: "0.8rem", marginBottom: "0.2rem" }}>
                          {p.workload.current_points}/{p.workload.max_points} pts
                        </div>
                        <div className="workload-bar">
                          <div className={`workload-fill ${pct >= 100 ? "danger" : ""}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    ) : "—"}
                  </td>
                  <td style={{ fontWeight: 600 }}>{p.tickets_handled}</td>
                  <td style={{ color: "#16a34a", fontWeight: 600 }}>{p.success_count}</td>
                  <td style={{ color: "var(--accent)", fontWeight: 600 }}>{p.failed_count}</td>
                  <td style={{ fontWeight: 700, color: "var(--primary)" }}>{p.total_points_completed}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
