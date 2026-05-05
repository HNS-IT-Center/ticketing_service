import { requireRole } from "@/lib/session";
import { db } from "@/lib/db";
import { Trophy, Crown, Medal } from "lucide-react";

export const metadata = { title: "Leaderboard — HNS IT Center" };

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string }>;
}) {
  await requireRole("Technician", "Administrator");
  const params = await searchParams;

  const now = new Date();
  const monthParam = params.month || "";
  const year  = parseInt(params.year  || String(now.getFullYear()));
  const month = monthParam && monthParam !== "all" ? parseInt(monthParam) : null;

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  // Fetch all technicians
  const technicians = await db.user.findMany({
    where: { role: "Technician" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  // Period filter: if month specified, filter to that month; otherwise full year
  const startDate = month
    ? new Date(year, month - 1, 1)
    : new Date(year, 0, 1);
  const endDate = month
    ? new Date(year, month, 1)
    : new Date(year + 1, 0, 1);

  const periodLogs = await db.ticketStatusLog.findMany({
    where: {
      new_status: "done",
      created_at: { gte: startDate, lt: endDate },
    },
    include: {
      ticket: {
        select: {
          technician_id: true,
          ticket_type: true,
        },
      },
    },
  });

  // Point values per ticket type
  const TYPE_POINTS: Record<string, number> = { pc_build: 4, service: 3 };
  const getPoints = (type: string) => TYPE_POINTS[type] ?? 2;

  // Aggregate points per technician for the period
  const techMap: Record<string, { points: number; tickets: number }> = {};
  for (const log of periodLogs) {
    const techId = log.ticket.technician_id;
    if (!techId) continue;
    if (!techMap[techId]) techMap[techId] = { points: 0, tickets: 0 };
    techMap[techId].points  += getPoints(log.ticket.ticket_type);
    techMap[techId].tickets += 1;
  }

  // Build ranked list — include all technicians (0 pts if no activity)
  const ranked = technicians
    .map((t) => ({
      id: t.id,
      name: t.name,
      points: techMap[t.id]?.points  ?? 0,
      tickets: techMap[t.id]?.tickets ?? 0,
    }))
    .sort((a, b) => b.points - a.points || b.tickets - a.tickets);

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  const top5   = ranked.slice(0, 5);
  const rest   = ranked.slice(5);
  const first  = ranked[0];
  const second = ranked[1];
  const third  = ranked[2];
  const maxPts = first?.points || 1;

  const RANK_CONFIG = [
    { color: "#f59e0b", glow: "rgba(245,158,11,0.5)", bg: "rgba(245,158,11,0.18)", border: "rgba(245,158,11,0.6)", barH: 180, avatarSize: "4rem", fontSize: "1.125rem" },
    { color: "#9ca3af", glow: "transparent",           bg: "rgba(156,163,175,0.18)", border: "rgba(156,163,175,0.5)", barH: 130, avatarSize: "3.5rem", fontSize: "1rem" },
    { color: "#b45309", glow: "transparent",           bg: "rgba(180,83,9,0.18)",   border: "rgba(180,83,9,0.5)",   barH: 100, avatarSize: "3rem",   fontSize: "0.9rem" },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-800">
            <Trophy size={26} className="text-amber-500" />
            Leaderboard
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Live rankings for {month ? MONTHS[month - 1] : "All months"} {year} · Updates as tickets are completed
          </p>
        </div>

        <form className="flex gap-2 items-center">
          <select name="month" defaultValue={month ?? "all"} className="form-input" style={{ width: "auto" }}>
            <option value="all">All months</option>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <select name="year" defaultValue={year} className="form-input" style={{ width: "auto" }}>
            {[2024, 2025, 2026, 2027].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <button type="submit" className="btn btn-primary btn-sm">Filter</button>
        </form>
      </div>

      {ranked.every(r => r.points === 0) ? (
        <div className="card">
          <div className="empty-state">
            <Trophy size={48} className="opacity-20" />
            <p>No completed tickets for {month ? MONTHS[month - 1] : "this year"} {year}.</p>
            <p className="text-sm text-gray-500">Complete tickets to appear on the leaderboard.</p>
          </div>
        </div>
      ) : (
        <div className="leaderboard-layout">
          {/* ── LEFT: Podium + Bar Chart (70%) */}
          <div className="leaderboard-chart flex flex-col gap-4">
            {/* Podium */}
            <div
              className="card overflow-hidden"
              style={{ background: "linear-gradient(135deg, #1e3a5f 0%, #16469d 60%, #2557bb 100%)", border: "none", padding: "0" }}
            >
              {/* Title bar */}
              <div style={{ padding: "1rem 1.5rem 0", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Trophy size={18} style={{ color: "#f59e0b" }} />
                <span style={{ color: "rgba(255,255,255,0.9)", fontWeight: 700, fontSize: "0.9375rem" }}>Top Performers</span>
              </div>

              {/* Podium bars: 2nd — 1st — 3rd */}
              <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-end", gap: "0.75rem", padding: "1.5rem 1rem 0", minHeight: "280px" }}>
                {/* 2nd */}
                {second && (() => {
                  const cfg = RANK_CONFIG[1];
                  return (
                    <div style={{ flex: "0 0 100px", display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", marginBottom: "8px" }}>
                        <Crown size={18} style={{ color: cfg.color }} />
                        <div style={{
                          width: cfg.avatarSize, height: cfg.avatarSize, borderRadius: "50%",
                          background: cfg.bg, border: `2px solid ${cfg.border}`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: cfg.fontSize, fontWeight: 700, color: "#fff",
                        }}>
                          {getInitials(second.name)}
                        </div>
                        <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "rgba(255,255,255,0.9)", textAlign: "center", maxWidth: "90px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {second.name}
                        </span>
                        <span style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.6)" }}>{second.points} pts</span>
                      </div>
                      <div style={{
                        width: "100%", height: `${cfg.barH}px`, background: cfg.bg,
                        borderRadius: "6px 6px 0 0", border: `1px solid ${cfg.border}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transformOrigin: "bottom", animation: "growBar 0.8s 0.2s ease both",
                      }}>
                        <span style={{ fontSize: "2rem", fontWeight: 900, color: cfg.color }}>2</span>
                      </div>
                    </div>
                  );
                })()}

                {/* 1st */}
                {first && (() => {
                  const cfg = RANK_CONFIG[0];
                  return (
                    <div style={{ flex: "0 0 120px", display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", marginBottom: "8px" }}>
                        <Crown size={26} style={{ color: cfg.color, filter: `drop-shadow(0 0 8px ${cfg.glow})` }} />
                        <div style={{
                          width: cfg.avatarSize, height: cfg.avatarSize, borderRadius: "50%",
                          background: cfg.bg, border: `2px solid ${cfg.border}`,
                          boxShadow: `0 0 20px ${cfg.glow}`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: cfg.fontSize, fontWeight: 700, color: "#fff",
                        }}>
                          {getInitials(first.name)}
                        </div>
                        <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "#fff", textAlign: "center", maxWidth: "110px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {first.name}
                        </span>
                        <span style={{ fontSize: "0.75rem", color: "#fcd34d", fontWeight: 600 }}>{first.points} pts</span>
                      </div>
                      <div style={{
                        width: "100%", height: `${cfg.barH}px`, background: cfg.bg,
                        borderRadius: "6px 6px 0 0", border: `1px solid ${cfg.border}`,
                        boxShadow: `0 -6px 24px ${cfg.glow}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transformOrigin: "bottom", animation: "growBar 0.8s ease both",
                      }}>
                        <span style={{ fontSize: "2.5rem", fontWeight: 900, color: "#f59e0b" }}>1</span>
                      </div>
                    </div>
                  );
                })()}

                {/* 3rd */}
                {third && (() => {
                  const cfg = RANK_CONFIG[2];
                  return (
                    <div style={{ flex: "0 0 100px", display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", marginBottom: "8px" }}>
                        <Crown size={16} style={{ color: cfg.color }} />
                        <div style={{
                          width: cfg.avatarSize, height: cfg.avatarSize, borderRadius: "50%",
                          background: cfg.bg, border: `2px solid ${cfg.border}`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: cfg.fontSize, fontWeight: 700, color: "#fff",
                        }}>
                          {getInitials(third.name)}
                        </div>
                        <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "rgba(255,255,255,0.9)", textAlign: "center", maxWidth: "90px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {third.name}
                        </span>
                        <span style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.6)" }}>{third.points} pts</span>
                      </div>
                      <div style={{
                        width: "100%", height: `${cfg.barH}px`, background: cfg.bg,
                        borderRadius: "6px 6px 0 0", border: `1px solid ${cfg.border}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transformOrigin: "bottom", animation: "growBar 0.8s 0.4s ease both",
                      }}>
                        <span style={{ fontSize: "1.75rem", fontWeight: 900, color: "#b45309" }}>3</span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Podium base */}
              <div style={{ height: "8px", background: "rgba(255,255,255,0.12)", borderTop: "1px solid rgba(255,255,255,0.18)" }} />
            </div>

            {/* Bar chart: Top 5 relative bars */}
            {top5.length > 0 && (
              <div className="card" style={{ padding: "1.25rem" }}>
                <h3 style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "1rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Top 5 — Points Breakdown
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  {top5.map((t, i) => {
                    const pct = Math.round((t.points / maxPts) * 100);
                    const barColor = i === 0 ? "#f59e0b" : i === 1 ? "#9ca3af" : i === 2 ? "#b45309" : "var(--primary)";
                    return (
                      <div key={t.id} style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                        <span style={{ width: "1.5rem", textAlign: "right", fontWeight: 700, fontSize: "0.875rem", color: barColor, flexShrink: 0 }}>
                          #{i + 1}
                        </span>
                        <span style={{ width: "6rem", fontSize: "0.875rem", fontWeight: 500, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {t.name}
                        </span>
                        <div style={{ flex: 1, background: "var(--cream-dark)", borderRadius: "999px", height: "10px", overflow: "hidden" }}>
                          <div style={{
                            height: "100%", width: `${pct}%`, borderRadius: "999px",
                            background: barColor,
                            animation: `growBar 0.8s ${i * 0.1}s ease both`,
                            transformOrigin: "left",
                          }} />
                        </div>
                        <span style={{ width: "3.5rem", textAlign: "right", fontSize: "0.875rem", fontWeight: 700, color: barColor, flexShrink: 0 }}>
                          {t.points} pts
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ── RIGHT: Scrollable card list (30%) */}
          <div className="leaderboard-list">
            <div style={{ padding: "0.75rem 0", borderBottom: "1px solid var(--border-light)", marginBottom: "0.5rem" }}>
              <h3 style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                All Rankings
              </h3>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {ranked.map((t, i) => {
                const rank = i + 1;
                const isTop3 = rank <= 3;
                const medalColor = rank === 1 ? "#f59e0b" : rank === 2 ? "#9ca3af" : rank === 3 ? "#b45309" : "var(--text-muted)";
                return (
                  <div
                    key={t.id}
                    style={{
                      display: "flex", alignItems: "center", gap: "0.75rem",
                      padding: "0.75rem 0.875rem",
                      background: isTop3 ? `${medalColor}0d` : "var(--white)",
                      border: `1.5px solid ${isTop3 ? `${medalColor}40` : "var(--border-light)"}`,
                      borderRadius: "var(--radius-md)",
                      transition: "all 0.2s",
                      animation: `fadeIn 0.4s ${i * 0.05}s ease both`,
                    }}
                  >
                    {/* Rank badge */}
                    <div style={{
                      width: "2rem", height: "2rem", borderRadius: "50%", flexShrink: 0,
                      background: isTop3 ? `${medalColor}20` : "var(--cream)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {rank <= 3 ? (
                        <Medal size={14} style={{ color: medalColor }} />
                      ) : (
                        <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)" }}>{rank}</span>
                      )}
                    </div>

                    {/* Avatar */}
                    <div style={{
                      width: "2rem", height: "2rem", borderRadius: "50%", flexShrink: 0,
                      background: isTop3 ? `${medalColor}30` : "var(--primary)",
                      color: isTop3 ? medalColor : "white",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "0.6875rem", fontWeight: 700,
                      border: isTop3 ? `1.5px solid ${medalColor}60` : "none",
                    }}>
                      {getInitials(t.name)}
                    </div>

                    {/* Name + tickets */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: "0.875rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {t.name}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        {t.tickets} ticket{t.tickets !== 1 ? "s" : ""}
                      </div>
                    </div>

                    {/* Points */}
                    <span style={{ fontWeight: 800, fontSize: "0.9375rem", color: isTop3 ? medalColor : "var(--primary)", flexShrink: 0 }}>
                      {t.points}
                      <span style={{ fontSize: "0.7rem", fontWeight: 500, color: "var(--text-muted)", marginLeft: "2px" }}>pts</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
