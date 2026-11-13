import "server-only";
import { db } from "@/lib/db";
import { monthRange } from "./parts";
import type { TargetLine, TechnicianRef } from "./technicians";

/**
 * A month of service work, ready for summarizeTargets.
 *
 * A service ticket counts in the month it FIRST reached `done`, ever — a ticket
 * sent back to work and finished again (BL7) is not counted twice, and does
 * not move to the later month. The credit goes to the technician holding the
 * ticket; a ticket with nobody on it is left out.
 *
 * A ticket whose points an administrator took off still counts as work and
 * takings; its job points are 0.
 *
 * Technicians listed: every active one (of the store, when one is chosen), so
 * a month with no work shows as a zero rather than as an absence — plus anyone
 * who did work in the month and has since been deactivated or moved.
 */
export async function loadTargetData(
  month: string,
  storeId: string | null,
  /** Only this technician's work — the dashboard's own-progress card. */
  technicianId: string | null = null
): Promise<{ technicians: TechnicianRef[]; doneTickets: { ticketId: string; technicianId: string }[]; lines: TargetLine[] } | null> {
  const range = monthRange(month);
  if (!range) return null;
  const ticketFilter = {
    ...(storeId ? { store_location_id: storeId } : {}),
    ...(technicianId ? { technician_id: technicianId } : {}),
  };

  const firstDone = await db.ticketStatusLog.groupBy({
    by: ["ticket_id"],
    where: { new_status: "done", created_at: { lt: range.end }, ticket: { ticket_type: "service", ...ticketFilter } },
    _min: { created_at: true },
  });
  const ticketIds = firstDone
    .filter((g) => g._min.created_at !== null && g._min.created_at >= range.start)
    .map((g) => g.ticket_id);

  const [tickets, staff] = await Promise.all([
    ticketIds.length === 0
      ? Promise.resolve([])
      : db.ticket.findMany({
          where: { id: { in: ticketIds }, technician_id: { not: null } },
          select: {
            id: true,
            points_excluded_at: true,
            technician: { select: { id: true, name: true } },
            charges: {
              where: { kind: "service_fee" },
              select: { service_job_id: true, description: true, quantity: true, unit_price: true, job_points: true },
            },
          },
        }),
    db.user.findMany({
      where: {
        role: "Technician",
        is_active: true,
        ...(storeId ? { store_assignments: { some: { store_id: storeId } } } : {}),
        ...(technicianId ? { id: technicianId } : {}),
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const technicians = new Map(staff.map((s) => [s.id, s]));
  const doneTickets: { ticketId: string; technicianId: string }[] = [];
  const lines: TargetLine[] = [];
  for (const t of tickets) {
    if (!t.technician) continue;
    technicians.set(t.technician.id, t.technician);
    doneTickets.push({ ticketId: t.id, technicianId: t.technician.id });
    for (const c of t.charges) {
      lines.push({
        ticketId: t.id,
        technicianId: t.technician.id,
        jobId: c.service_job_id,
        jobName: c.description,
        quantity: c.quantity,
        unitPrice: c.unit_price,
        // An administrator took this ticket's points off (Hapus poin): the work
        // and takings still count, the points do not — as on the leaderboard.
        points: t.points_excluded_at ? 0 : c.job_points,
      });
    }
  }

  return { technicians: [...technicians.values()], doneTickets, lines };
}
