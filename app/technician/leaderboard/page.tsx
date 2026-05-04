import { requireRole } from "@/lib/session";
import { db } from "@/lib/db";
import { Trophy, Crown } from "lucide-react";

export const metadata = { title: "Leaderboard — HNS IT Center" };

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

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  // Podium order: 2nd, 1st, 3rd
  const first  = entries[0];
  const second = entries[1];
  const third  = entries[2];
  const rest   = entries.slice(3);

  const CROWN_COLORS = ["#f59e0b", "#9ca3af", "#b45309"];
  const BAR_HEIGHTS  = [160, 120, 100]; // px heights for 1st, 2nd, 3rd

  return (
    <div className="flex flex-col gap-6">
      {/* Header + filter */}
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-800">
            <Trophy size={26} className="text-amber-500" />
            Leaderboard
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Ranking for {MONTHS[month - 1]} {year}
          </p>
        </div>

        <form className="flex gap-2 items-center">
          <select name="month" defaultValue={month} className="form-input" style={{ width: "auto" }}>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <select name="year" defaultValue={year} className="form-input" style={{ width: "auto" }}>
            {[2024, 2025, 2026].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <button type="submit" className="btn btn-primary btn-sm">Filter</button>
        </form>
      </div>

      {entries.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <Trophy size={48} className="opacity-20" />
            <p>No leaderboard data for {MONTHS[month - 1]} {year}.</p>
            <p className="text-sm text-gray-500">Create a snapshot from Admin &rarr; Performance page.</p>
          </div>
        </div>
      ) : (
        <>
          {/* ── PODIUM ─────────────────────────────────────────────── */}
          <div className="card overflow-hidden" style={{ background: "linear-gradient(135deg, #1e3a5f 0%, #16469d 60%, #2557bb 100%)", border: "none" }}>
            <div className="flex justify-center items-end gap-4 pt-8 pb-6 px-4"
              style={{ minHeight: "280px" }}>

              {/* 2nd place */}
              {second && (
                <div className="flex flex-col items-center" style={{ flex: "0 0 120px" }}>
                  {/* Avatar + crown */}
                  <div className="flex flex-col items-center gap-1 mb-2">
                    <Crown size={20} style={{ color: CROWN_COLORS[1] }} />
                    <div style={{
                      width: "3rem", height: "3rem", borderRadius: "50%",
                      background: "rgba(156,163,175,0.3)", border: "2px solid #9ca3af",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "1rem", fontWeight: 700, color: "#fff",
                    }}>
                      {getInitials(second.technician.name)}
                    </div>
                    <span className="text-xs font-semibold text-white/90 text-center leading-tight max-w-[100px] truncate">
                      {second.technician.name}
                    </span>
                    <span className="text-xs text-white/60">{second.total_points} pts</span>
                  </div>
                  {/* Bar */}
                  <div style={{
                    width: "100%", height: `${BAR_HEIGHTS[1]}px`,
                    background: "rgba(156,163,175,0.25)",
                    borderRadius: "0.5rem 0.5rem 0 0",
                    border: "1px solid rgba(156,163,175,0.4)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <span className="text-2xl font-black text-gray-300">2</span>
                  </div>
                </div>
              )}

              {/* 1st place */}
              {first && (
                <div className="flex flex-col items-center" style={{ flex: "0 0 140px" }}>
                  <div className="flex flex-col items-center gap-1 mb-2">
                    {/* Animated glow ring for 1st */}
                    <Crown size={26} style={{ color: CROWN_COLORS[0], filter: "drop-shadow(0 0 8px #f59e0b)" }} />
                    <div style={{
                      width: "3.5rem", height: "3.5rem", borderRadius: "50%",
                      background: "rgba(245,158,11,0.25)", border: "2px solid #f59e0b",
                      boxShadow: "0 0 16px rgba(245,158,11,0.4)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "1.125rem", fontWeight: 700, color: "#fff",
                    }}>
                      {getInitials(first.technician.name)}
                    </div>
                    <span className="text-sm font-bold text-white text-center leading-tight max-w-[120px] truncate">
                      {first.technician.name}
                    </span>
                    <span className="text-xs text-amber-300 font-semibold">{first.total_points} pts</span>
                  </div>
                  {/* Tallest bar */}
                  <div style={{
                    width: "100%", height: `${BAR_HEIGHTS[0]}px`,
                    background: "rgba(245,158,11,0.2)",
                    borderRadius: "0.5rem 0.5rem 0 0",
                    border: "1px solid rgba(245,158,11,0.5)",
                    boxShadow: "0 -4px 20px rgba(245,158,11,0.25)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <span className="text-3xl font-black text-amber-400">1</span>
                  </div>
                </div>
              )}

              {/* 3rd place */}
              {third && (
                <div className="flex flex-col items-center" style={{ flex: "0 0 120px" }}>
                  <div className="flex flex-col items-center gap-1 mb-2">
                    <Crown size={18} style={{ color: CROWN_COLORS[2] }} />
                    <div style={{
                      width: "3rem", height: "3rem", borderRadius: "50%",
                      background: "rgba(180,83,9,0.25)", border: "2px solid #b45309",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "1rem", fontWeight: 700, color: "#fff",
                    }}>
                      {getInitials(third.technician.name)}
                    </div>
                    <span className="text-xs font-semibold text-white/90 text-center leading-tight max-w-[100px] truncate">
                      {third.technician.name}
                    </span>
                    <span className="text-xs text-white/60">{third.total_points} pts</span>
                  </div>
                  {/* Shortest bar */}
                  <div style={{
                    width: "100%", height: `${BAR_HEIGHTS[2]}px`,
                    background: "rgba(180,83,9,0.2)",
                    borderRadius: "0.5rem 0.5rem 0 0",
                    border: "1px solid rgba(180,83,9,0.4)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <span className="text-2xl font-black text-amber-800">3</span>
                  </div>
                </div>
              )}
            </div>

            {/* Podium base */}
            <div style={{
              height: "8px",
              background: "rgba(255,255,255,0.15)",
              borderTop: "1px solid rgba(255,255,255,0.2)",
            }} />
          </div>

          {/* ── REMAINING RANKS ─────────────────────────────────────── */}
          {rest.length > 0 && (
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid var(--border-light)" }}>
                <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
                  Other Rankings
                </h3>
              </div>
              <div>
                {rest.map((e, i) => {
                  const rank = i + 4;
                  const pct = first ? Math.round((e.total_points / first.total_points) * 100) : 0;
                  return (
                    <div key={e.id} style={{
                      display: "flex", alignItems: "center", gap: "1rem",
                      padding: "0.875rem 1.25rem",
                      borderBottom: i < rest.length - 1 ? "1px solid var(--border-light)" : "none",
                    }}>
                      <span style={{ width: "2rem", textAlign: "center", fontWeight: 700, color: "var(--text-muted)", fontSize: "0.875rem" }}>
                        #{rank}
                      </span>
                      <div style={{
                        width: "2.25rem", height: "2.25rem", borderRadius: "50%",
                        background: "var(--primary)", color: "white",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "0.75rem", fontWeight: 700, flexShrink: 0,
                      }}>
                        {getInitials(e.technician.name)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: "0.9375rem", marginBottom: "0.25rem" }}>
                          {e.technician.name}
                        </div>
                        <div className="workload-bar" style={{ maxWidth: "200px" }}>
                          <div className="workload-fill" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <span style={{ fontWeight: 700, color: "var(--primary)", fontSize: "1rem", flexShrink: 0 }}>
                        {e.total_points} pts
                      </span>
                      <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", flexShrink: 0 }}>
                        {e.tickets_handled} tickets
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
