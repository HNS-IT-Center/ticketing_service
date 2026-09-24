import { db } from "@/lib/db";
import { unstable_cache } from "next/cache";
import { EARNING_STATUS_LOG_FILTER } from "@/lib/kpi";
import { getTicketPoints } from "@/lib/points";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

// ─── Top Technician of a Month ──────────────────────────────────────────────
// Excludes coordinators (is_team_leader: true). Cached per month+year.
export const getTopTechnicianOfMonth = unstable_cache(
  async (month: number, year: number): Promise<string | null> => {
    const startDate = new Date(year, month - 1, 1);
    const endDate   = new Date(year, month, 1);

    // Only regular technicians are eligible
    const eligibleTechs = await db.user.findMany({
      where: { role: "Technician", is_team_leader: false },
      select: { id: true },
    });
    const eligibleIds = new Set(eligibleTechs.map((t) => t.id));

    // Driven by the status log, not by the ticket's current status. Reading
    // `status: "done"` dropped a ticket out of the month the moment the
    // customer picked it up, and it credited a warranty claim on the `done`
    // that rma.ts writes when the case closes. Same filter the leaderboard
    // uses -- see lib/kpi.ts.
    const earningLogs = await db.ticketStatusLog.findMany({
      where: {
        ...EARNING_STATUS_LOG_FILTER,
        created_at: { gte: startDate, lt: endDate },
        ticket: { technician_id: { in: Array.from(eligibleIds) } },
      },
      select: {
        ticket: {
          select: {
            ticket_type: true,
            device_type: true,
            technician_id: true,
            cleaning_detail: { select: { service_package: true } },
          },
        },
      },
    });

    const pointsMap = new Map<string, number>();
    for (const { ticket: t } of earningLogs) {
      if (!t.technician_id || !eligibleIds.has(t.technician_id)) continue;
      const pts = getTicketPoints(
        t.ticket_type,
        t.device_type,
        t.cleaning_detail?.service_package,
      );
      pointsMap.set(t.technician_id, (pointsMap.get(t.technician_id) ?? 0) + pts);
    }

    let topId: string | null = null;
    let maxPts = -1;
    for (const [id, pts] of pointsMap.entries()) {
      if (pts > maxPts) { maxPts = pts; topId = id; }
    }
    return maxPts > 0 ? topId : null;
  },
  ["tech-month-winner"],
  { tags: ["tech-month-winner"], revalidate: 3600 }
);

// ─── Top Winning Store of a Month ───────────────────────────────────────────
// Returns the store_id with the highest combined technician points that month.
export const getTopStoreOfMonth = unstable_cache(
  async (month: number, year: number): Promise<string | null> => {
    const startDate = new Date(year, month - 1, 1);
    const endDate   = new Date(year, month, 1);

    const earningLogs = await db.ticketStatusLog.findMany({
      where: {
        ...EARNING_STATUS_LOG_FILTER,
        created_at: { gte: startDate, lt: endDate },
        ticket: { technician_id: { not: null } },
      },
      select: {
        ticket: {
          select: {
            ticket_type: true,
            device_type: true,
            technician_id: true,
            cleaning_detail: { select: { service_package: true } },
          },
        },
      },
    });

    // Build techId → points map
    const techPoints = new Map<string, number>();
    for (const { ticket: t } of earningLogs) {
      if (!t.technician_id) continue;
      const pts = getTicketPoints(
        t.ticket_type,
        t.device_type,
        t.cleaning_detail?.service_package,
      );
      techPoints.set(t.technician_id, (techPoints.get(t.technician_id) ?? 0) + pts);
    }

    // Fetch store assignments
    const assignments = await db.technicianStoreAssignment.findMany({
      select: { technician_id: true, store_id: true },
    });

    const storePoints = new Map<string, number>();
    for (const a of assignments) {
      const pts = techPoints.get(a.technician_id) ?? 0;
      storePoints.set(a.store_id, (storePoints.get(a.store_id) ?? 0) + pts);
    }

    let topStoreId: string | null = null;
    let maxPts = -1;
    for (const [id, pts] of storePoints.entries()) {
      if (pts > maxPts) { maxPts = pts; topStoreId = id; }
    }
    return maxPts > 0 ? topStoreId : null;
  },
  ["leaderboard-stores-winner"],
  { tags: ["leaderboard-stores"], revalidate: 3600 }
);

// ─── Award Monthly Titles (lazy, called on profile load) ────────────────────
// Checks last completed month. If the user earned a title, upserts it into
// their UserTitle inventory. Safe to call on every profile load — upsert
// is a no-op if the title already exists.
export async function awardMonthlyTitles(
  userId: string,
  isCoordinator: boolean
): Promise<void> {
  const now = new Date();
  // "Last completed month" = the month before the current one
  const month = now.getMonth() === 0 ? 12 : now.getMonth();
  const year  = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

  const monthName = MONTHS[month - 1];
  let awarded = false;

  if (!isCoordinator) {
    // --- Technician of the Month ---
    const topTechId = await getTopTechnicianOfMonth(month, year);
    if (topTechId === userId) {
      const titleKey   = `technician_${year}_${String(month).padStart(2, "0")}`;
      const titleLabel = `Technician of ${monthName} ${year}`;
      await db.userTitle.upsert({
        where: { user_id_title_key: { user_id: userId, title_key: titleKey } },
        create: { user_id: userId, title_key: titleKey, title_label: titleLabel, title_type: "technician", emoji: "🏆" },
        update: {},
      });
      awarded = true;
    }
  } else {
    // --- Coordinator of the Month ---
    const topStoreId = await getTopStoreOfMonth(month, year);
    if (topStoreId) {
      // Check if this coordinator is assigned to the winning store
      const assignment = await db.technicianStoreAssignment.findFirst({
        where: { technician_id: userId, store_id: topStoreId },
      });
      if (assignment) {
        const titleKey   = `coordinator_${year}_${String(month).padStart(2, "0")}`;
        const titleLabel = `Coordinator of ${monthName} ${year}`;
        await db.userTitle.upsert({
          where: { user_id_title_key: { user_id: userId, title_key: titleKey } },
          create: { user_id: userId, title_key: titleKey, title_label: titleLabel, title_type: "coordinator", emoji: "🛡️" },
          update: {},
        });
      }
    }
  }
  // NOTE: revalidateTag must NOT be called here — this function runs during render.
  // getUserTitles below is uncached so it always reads fresh data from the DB.
}

// ─── Get User Title Inventory (uncached — always fresh after awardMonthlyTitles) ──
// Must NOT be cached here: awardMonthlyTitles writes to DB during render,
// so we need a direct DB hit to see the newly inserted title immediately.
export async function getUserTitles(userId: string) {
  return db.userTitle.findMany({
    where: { user_id: userId },
    orderBy: { awarded_at: "desc" },
  });
}

// ─── Get Technician Profile Data (cached) ──────────────────────────────────
export function getTechnicianProfile(userId: string) {
  return unstable_cache(
    async () => {
      return Promise.all([
        db.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            name: true,
            email: true,
            phone_number: true,
            address: true,
            created_at: true,
            shift: true,
            is_team_leader: true,
            active_title: true,
            password: true,
          },
        }),
        db.technicianPerformance.findUnique({
          where: { technician_id: userId },
        }),
        db.ticket.count({
          where: { technician_id: userId, status: { in: ["waiting", "on_progress"] } },
        }),
      ]);
    },
    [`user-profile-${userId}`],
    { tags: [`user-profile:${userId}`] }
  )();
}
