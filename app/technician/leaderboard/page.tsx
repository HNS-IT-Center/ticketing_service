import { requireRole } from "@/lib/session";
import { db } from "@/lib/db";
import { Trophy } from "lucide-react";

export const metadata = { title: "Leaderboard — TechServe" };

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string }>;
}) {
  await requireRole("Technician", "Administrator");
  const params = await searchParams;

  const now = new Date();
  const month = parseInt(params.month || String(now.getMonth() + 1));
  const year = parseInt(params.year || String(now.getFullYear()));

  const entries = await db.leaderboard.findMany({
    where: { month, year },
    orderBy: { total_points: "desc" },
    include: { technician: { select: { name: true } } },
  });

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Trophy size={24} style={{ color: "#ca8a04" }} />
            Leaderboard
          </h1>
          <p style={{ color: "var(--text-muted)", marginTop: "0.25rem" }}>
            Ranking based on completed ticket points
          </p>
        </div>

        <form style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <select name="month" defaultValue={month} className="form-input" style={{ width: "auto" }}>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <select name="year" defaultValue={year} className="form-input" style={{ width: "auto" }}>
            {[2024, 2025, 2026].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <button type="submit" className="btn btn-primary btn-sm">Filter</button>
        </form>
      </div>

      <div className="card">
        {entries.length === 0 ? (
          <div className="empty-state">
            <Trophy size={40} style={{ opacity: 0.3 }} />
            <p>No leaderboard data for {MONTHS[month - 1]} {year}</p>
          </div>
        ) : (
          <div className="table-wrapper" style={{ border: "none", boxShadow: "none" }}>
            <table>
              <thead>
                <tr><th>Rank</th><th>Technician</th><th>Tickets Handled</th><th>Total Points</th></tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={e.id}>
                    <td>
                      <span style={{
                        fontWeight: 800,
                        fontSize: "1.125rem",
                        color: i === 0 ? "#ca8a04" : i === 1 ? "#9ca3af" : i === 2 ? "#b45309" : "var(--text-muted)",
                      }}>
                        {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600 }}>{e.technician.name}</td>
                    <td>{e.tickets_handled}</td>
                    <td>
                      <span style={{ fontWeight: 700, color: "var(--primary)", fontSize: "1.125rem" }}>
                        {e.total_points} pts
                      </span>
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
