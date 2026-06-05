// Shared leaderboard data fetcher & helpers — used by both technician and admin leaderboard pages

import { db } from "@/lib/db";
import { unstable_cache } from "next/cache";

export function getTicketPointsLocal(type: string, deviceType?: string | null): number {
  if (type === "pc_build") return 4;
  if (type === "service") return 5;
  if (type === "cleaning" && deviceType === "PC_Gaming") return 4;
  return 2;
}

export const MONTH_COLORS: Record<number, { bg: string; text: string }> = {
  1:  { bg: "#dbeafe", text: "#1e40af" },
  2:  { bg: "#fce7f3", text: "#9d174d" },
  3:  { bg: "#d1fae5", text: "#065f46" },
  4:  { bg: "#bbf7d0", text: "#14532d" },
  5:  { bg: "#fef9c3", text: "#713f12" },
  6:  { bg: "#fed7aa", text: "#7c2d12" },
  7:  { bg: "#fecaca", text: "#991b1b" },
  8:  { bg: "#ffedd5", text: "#7c2d12" },
  9:  { bg: "#e0e7ff", text: "#3730a3" },
  10: { bg: "#fef3c7", text: "#78350f" },
  11: { bg: "#f3e8ff", text: "#6b21a8" },
  12: { bg: "#fee2e2", text: "#991b1b" },
};

export function getMonthFromKey(titleKey: string): number {
  const parts = titleKey.split("_");
  return parseInt(parts[parts.length - 1]);
}

export function getShortLabel(titleLabel: string, emoji: string): string {
  // "Technician of April 2026" → "🏆 #1 April 2026"
  // "Coordinator of May 2026" → "🛡️ #1 May 2026"
  const match = titleLabel.match(/of (.+)$/);
  return match ? `${emoji} #1 ${match[1]}` : titleLabel;
}

// ─── Cached leaderboard data ────────────────────────────────────────────────
export function getLeaderboardData(month: number | null, year: number) {
  const cacheKey = `leaderboard-${month ?? "all"}-${year}`;
  return unstable_cache(
    async () => {
      const startDate = month ? new Date(year, month - 1, 1) : new Date(year, 0, 1);
      const endDate   = month ? new Date(year, month, 1)     : new Date(year + 1, 0, 1);

      const [technicians, stores, periodLogs] = await Promise.all([
        db.user.findMany({
          where: { role: "Technician", is_team_leader: false },
          select: { id: true, name: true, active_title: true },
          orderBy: { name: "asc" },
        }),
        db.storeLocation.findMany({
          where: { is_active: true },
          include: { technician_stores: { select: { technician_id: true } } },
        }),
        db.ticketStatusLog.findMany({
          where: {
            new_status: "done",
            created_at: { gte: startDate, lt: endDate },
          },
          include: {
            ticket: { select: { technician_id: true, ticket_type: true, device_type: true } },
          },
        }),
      ]);

      // Build points map
      const techMap: Record<string, { points: number; tickets: number }> = {};
      for (const log of periodLogs) {
        const techId = log.ticket.technician_id;
        if (!techId) continue;
        if (!techMap[techId]) techMap[techId] = { points: 0, tickets: 0 };
        techMap[techId].points  += getTicketPointsLocal(log.ticket.ticket_type, log.ticket.device_type);
        techMap[techId].tickets += 1;
      }

      // Fetch active title labels for equipped titles
      const activeTitleKeys = technicians
        .map((t) => t.active_title)
        .filter((k): k is string => k !== null && k !== undefined);

      const titleRecords = activeTitleKeys.length > 0
        ? await db.userTitle.findMany({
            where: { title_key: { in: activeTitleKeys } },
            select: { user_id: true, title_key: true, title_label: true, emoji: true },
          })
        : [];

      const titleByUserId = new Map(titleRecords.map((r) => [r.user_id, r]));

      const getLevel = (tickets: number) => {
        if (tickets <= 100) return Math.floor(tickets / 10) + 1;
        return 11 + Math.floor((tickets - 100) / 15);
      };

      const rankedTechs = technicians
        .map((t) => {
          const stats = techMap[t.id];
          const tickets = stats?.tickets ?? 0;
          const titleRecord = t.active_title ? titleByUserId.get(t.id) : undefined;
          return {
            id: t.id,
            name: t.name,
            points: stats?.points ?? 0,
            tickets,
            level: getLevel(tickets),
            activeTitle: t.active_title ?? null,
            activeTitleLabel: titleRecord?.title_label ?? null,
            activeTitleEmoji: titleRecord?.emoji ?? null,
          };
        })
        .sort((a, b) => b.points - a.points || b.tickets - a.tickets);

      const rankedStores = stores
        .map((s) => {
          let storePoints = 0, storeTickets = 0;
          for (const m of s.technician_stores) {
            const stats = techMap[m.technician_id];
            if (stats) { storePoints += stats.points; storeTickets += stats.tickets; }
          }
          return {
            id: s.id, name: s.name, code: s.code,
            points: storePoints, tickets: storeTickets,
            level: getLevel(storeTickets),
            techCount: s.technician_stores.length,
          };
        })
        .sort((a, b) => b.points - a.points || b.tickets - a.tickets);

      return { rankedTechs, rankedStores };
    },
    [cacheKey],
    { tags: ["leaderboard-techs", "leaderboard-stores"], revalidate: 60 }
  )();
}
