import { db } from "@/lib/db";
import type { Prisma, RmaStatus } from "@prisma/client";
import {
  daysBetween,
  formatGap,
  formatStageAge,
  groupByDay,
  parseDateRange,
} from "./log-grouping";

/**
 * Loading the RMA activity log, in the two shapes the page offers.
 *
 * Loading lives here rather than in the page for the same reason as
 * lib/rma/queue.ts: the stage age is clock-derived, and a component that reads
 * the clock is not a pure function of its props. One instant is read per
 * request, here, and passed down as data.
 */

/** Stages offered in the filter, in the order the desk works them. */
export const LOG_FILTER_STATUSES: readonly RmaStatus[] = [
  "pending_verification",
  "on_hold",
  "verified",
  "submitted_to_vendor",
  "in_vendor_process",
  "vendor_decided",
  "unit_received",
  "ineligible",
  "closed",
  "cancelled",
];

/**
 * Cases per page in the grouped view, events per page in the chronological one.
 *
 * They differ on purpose. Paging the grouped view by events would cut a case's
 * timeline across a page break, which is the exact fault this page was rebuilt
 * to remove.
 */
export const CASES_PER_PAGE = 10;
export const EVENTS_PER_PAGE = 50;

export type RmaLogView = "case" | "time";

export function isRmaLogView(value: string | undefined): value is RmaLogView {
  return value === "case" || value === "time";
}

export type RmaLogFilters = {
  q: string;
  status: string;
  from: string;
  to: string;
};

/**
 * Whether the filter actually narrows anything.
 *
 * Deliberately not "is any box filled in": an unparseable date or a status
 * that is not a status is dropped when the query is built, and a page that
 * then says "cocok dengan filter" over the complete list is lying about what
 * the reader is looking at. Asking the built query is true by construction.
 */
export function hasAnyFilter(f: RmaLogFilters): boolean {
  return Object.keys(buildEventWhere(f)).length > 0;
}

/** The filter, as a query over events. Both views start from this. */
export function buildEventWhere(f: RmaLogFilters): Prisma.RmaEventWhereInput {
  const where: Prisma.RmaEventWhereInput = {};

  if (f.q) {
    where.OR = [
      { rma_case: { rma_code: { contains: f.q } } },
      { rma_case: { ticket: { ticket_code: { contains: f.q } } } },
      { rma_case: { ticket: { customer_name: { contains: f.q } } } },
      { actor: { name: { contains: f.q } } },
      { note: { contains: f.q } },
    ];
  }

  if (f.status && (LOG_FILTER_STATUSES as readonly string[]).includes(f.status)) {
    where.to_status = f.status as RmaStatus;
  }

  const range = parseDateRange(f.from, f.to);
  if (range) where.created_at = range;

  return where;
}

const EVENT_SELECT = {
  id: true,
  from_status: true,
  to_status: true,
  note: true,
  created_at: true,
  actor: { select: { name: true, role: true } },
} satisfies Prisma.RmaEventSelect;

export type RmaLogCase = Awaited<ReturnType<typeof getRmaLogCases>>["cases"][number];
export type RmaLogEventRow = Awaited<ReturnType<typeof getRmaLogEvents>>["days"][number]["items"][number];

/**
 * The grouped view: one entry per case, each carrying its whole timeline.
 *
 * The filter picks the CASES — a case qualifies when any of its events match —
 * and then the full history is shown, because the point of this view is to read
 * one case's story from beginning to end. The chronological view is where a
 * filter means "show me exactly these rows".
 */
export async function getRmaLogCases(f: RmaLogFilters, page: number) {
  const where = buildEventWhere(f);

  // Which cases match, how many of their events did, and when they last moved.
  // Grouped in full rather than paged in SQL: the slice has to be taken after
  // sorting on _max, and the row count here is one per case, not per event.
  const matches = await db.rmaEvent.groupBy({
    by: ["rma_case_id"],
    where,
    _count: { _all: true },
    _max: { created_at: true },
  });

  matches.sort(
    (a, b) => (b._max.created_at?.getTime() ?? 0) - (a._max.created_at?.getTime() ?? 0)
  );

  const total = matches.length;
  const slice = matches.slice((page - 1) * CASES_PER_PAGE, page * CASES_PER_PAGE);
  const matchCount = new Map(slice.map((m) => [m.rma_case_id, m._count._all]));

  const rows = slice.length
    ? await db.rmaCase.findMany({
        where: { id: { in: slice.map((m) => m.rma_case_id) } },
        select: {
          id: true,
          rma_code: true,
          status: true,
          created_at: true,
          handler: { select: { name: true } },
          ticket: {
            select: {
              ticket_code: true,
              customer_name: true,
              device_name: true,
              device_sn: true,
              store_location: { select: { code: true } },
              technician: { select: { name: true } },
            },
          },
          events: { orderBy: { created_at: "asc" }, select: EVENT_SELECT },
        },
      })
    : [];

  // findMany does not honour the order of an `in` list, so put it back.
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = slice.map((m) => byId.get(m.rma_case_id)).filter((c) => c !== undefined);

  const now = new Date();

  const cases = ordered.map((c) => {
    const events = c.events.map((e, i) => {
      const previous = c.events[i - 1];
      return {
        ...e,
        // Between this step and the one before it, within the same case.
        gap: previous ? formatGap(previous.created_at, e.created_at) : null,
        isLast: i === c.events.length - 1,
      };
    });

    // When the case entered its current stage: the newest event, exactly as
    // the dashboard measures it. A case whose events were pruned falls back to
    // its own creation.
    const stageSince = c.events[c.events.length - 1]?.created_at ?? c.created_at;

    return {
      ...c,
      events,
      stageSince,
      stageAge: formatStageAge(stageSince, now),
      daysInStage: daysBetween(stageSince, now),
      totalEvents: c.events.length,
      matchedEvents: matchCount.get(c.id) ?? 0,
    };
  });

  return { cases, total, lastPage: Math.max(1, Math.ceil(total / CASES_PER_PAGE)) };
}

/**
 * The chronological view: the matching events themselves, newest first, split
 * into one group per calendar day in the shop's time zone.
 */
export async function getRmaLogEvents(f: RmaLogFilters, page: number) {
  const where = buildEventWhere(f);

  const [events, total] = await Promise.all([
    db.rmaEvent.findMany({
      where,
      orderBy: { created_at: "desc" },
      take: EVENTS_PER_PAGE,
      skip: (page - 1) * EVENTS_PER_PAGE,
      select: {
        ...EVENT_SELECT,
        rma_case: {
          select: {
            id: true,
            rma_code: true,
            ticket: { select: { ticket_code: true, customer_name: true } },
          },
        },
      },
    }),
    db.rmaEvent.count({ where }),
  ]);

  const days = groupByDay(events, (e) => e.created_at).map((group) => ({
    ...group,
    caseCount: new Set(group.items.map((e) => e.rma_case.id)).size,
  }));

  return { days, total, lastPage: Math.max(1, Math.ceil(total / EVENTS_PER_PAGE)) };
}
