import type { Prisma } from "@prisma/client";
import { actionsInArea, isActivityArea } from "./activity-catalog";

/** What the activity page filters on, as it arrives in the URL. */
export type ActivityFilter = {
  q?: string;
  area?: string;
  actor?: string;
  from?: string;
  to?: string;
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const WIB_OFFSET_MS = 7 * 3600_000;

/** Midnight of a YYYY-MM-DD day in Batam (WIB), as an instant; null when unreadable. */
export function wibDayStart(day: string | undefined): Date | null {
  if (!day || !DAY.test(day)) return null;
  const t = Date.parse(`${day}T00:00:00Z`);
  return Number.isNaN(t) ? null : new Date(t - WIB_OFFSET_MS);
}

/**
 * The Prisma filter for the activity page. Each part is ignored when it cannot
 * be read — an unknown area, a malformed date — rather than reaching the
 * database or emptying the page; `isFiltered` says whether anything applied.
 */
export function activityWhere(filter: ActivityFilter): { where: Prisma.ActivityLogWhereInput; isFiltered: boolean } {
  const and: Prisma.ActivityLogWhereInput[] = [];

  const q = (filter.q ?? "").trim();
  if (q) {
    and.push({
      OR: [{ summary: { contains: q } }, { entity_label: { contains: q } }, { actor_name: { contains: q } }],
    });
  }
  if (filter.area && isActivityArea(filter.area)) {
    and.push({ action: { in: actionsInArea(filter.area) } });
  }
  const actor = (filter.actor ?? "").trim();
  if (actor) and.push({ actor_id: actor });

  const from = wibDayStart(filter.from);
  const toStart = wibDayStart(filter.to);
  // "to" is inclusive: up to the end of that day.
  const to = toStart ? new Date(toStart.getTime() + 24 * 3600_000) : null;
  if (from || to) {
    and.push({ created_at: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } });
  }

  return { where: and.length ? { AND: and } : {}, isFiltered: and.length > 0 };
}
