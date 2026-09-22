import { db } from "@/lib/db";
import type { RmaStatus } from "@prisma/client";

/**
 * Queue data for the RMA dashboard.
 *
 * Loading lives here rather than in the page so the clock is read outside any
 * component render — `react-hooks/purity` flags `Date.now()` inside one, and it
 * is right to: a component that reads the clock is not a pure function of its
 * props. "Days at vendor" is derived once per request, here.
 */

/** Statuses that still need someone to act, in the order the desk works them. */
export const RMA_QUEUE_STATUSES: readonly RmaStatus[] = [
  "pending_verification",
  "on_hold",
  "verified",
  "submitted_to_vendor",
  "in_vendor_process",
  "vendor_decided",
  "unit_received",
];

export type RmaQueueRow = Awaited<ReturnType<typeof getRmaQueue>>["rows"][number];

export async function getRmaQueue() {
  const [cases, closedCount, cancelledCount] = await Promise.all([
    db.rmaCase.findMany({
      where: { status: { in: [...RMA_QUEUE_STATUSES] } },
      orderBy: { created_at: "asc" },
      select: {
        id: true,
        rma_code: true,
        status: true,
        vendor_name: true,
        decision: true,
        submitted_at: true,
        created_at: true,
        hold_reason: true,
        handler: { select: { id: true, name: true } },
        ticket: {
          select: {
            id: true,
            ticket_code: true,
            customer_name: true,
            device_name: true,
            device_sn: true,
            store_location: { select: { code: true } },
          },
        },
      },
    }),
    db.rmaCase.count({ where: { status: "closed" } }),
    db.rmaCase.count({ where: { status: "cancelled" } }),
  ]);

  // One clock read for the whole request, so every row is measured consistently.
  const now = Date.now();
  const days = (from: Date) => Math.floor((now - new Date(from).getTime()) / 86_400_000);

  const rows = cases.map((c) => ({
    ...c,
    daysAtVendor: c.submitted_at ? days(c.submitted_at) : null,
    daysOpen: days(c.created_at),
  }));

  return { rows, closedCount, cancelledCount };
}
