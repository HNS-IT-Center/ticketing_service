/**
 * The ticket point table — the only one (unified 2026-11-12, owner's call).
 *
 * What is credited (`app/actions/tickets.ts`, `technician.ts`, `rma.ts`), what
 * the leaderboard and performance report add up, what the dashboards, the
 * ticket lists and the requests bell show, and what deleting a ticket takes
 * back all read this. Before, the leaderboard, the badges and the reports each
 * carried their own copy, so a cleaning showed 2 and was credited 5, and an
 * "Other device" service showed 5 and was credited 3.
 *
 * The old "Extra Services" ticks are not counted anywhere. The list badges used
 * to add +3 per tick ("+extra"), which made a warranty claim with six ticks read
 * 20 points while it earned 2. Ticks already stored stay in `extra_services`;
 * nothing reads or writes them.
 */

export function getTicketPoints(
  type: string,
  deviceType?: string | null,
  cleaningPackage?: string | null,
): number {
  if (type === "service") {
    if (deviceType === "Other_Device") return 3;
    return 5;
  }
  if (type === "cleaning") {
    if (
      cleaningPackage === "Full_Repaste" ||
      cleaningPackage === "Full_Repaste_CPU_GPU"
    ) {
      return 5;
    }
    return 3;
  }
  if (type === "pc_build") return 4;
  return 2;
}

/** A bill line, as far as points go: a Daftar Jasa job keeps its points on the line. */
export type JobPointLine = { job_points: number | null; quantity: number };

/**
 * Prisma `select` for a ticket's job lines — every query that scores a ticket
 * includes it as `charges`. Only "Jasa service" lines carry points.
 */
export const JOB_POINT_CHARGES = {
  where: { kind: "service_fee" },
  select: { job_points: true, quantity: true },
} as const;

/** The Daftar Jasa points recorded on a ticket's bill (owner, 2026-11-12). */
export function jobPoints(lines?: readonly JobPointLine[] | null): number {
  return (lines ?? []).reduce((sum, l) => sum + (l.job_points ?? 0) * l.quantity, 0);
}

/**
 * A ticket's points: its type (the table above) plus the Daftar Jasa jobs on
 * its bill — the same job points the Target Teknisi report counts. What the
 * old "Extra Services" ticks meant is now recorded as those jobs.
 */
export function ticketTotalPoints(t: {
  ticket_type: string;
  device_type?: string | null;
  cleaning_detail?: { service_package: string | null } | null;
  charges?: readonly JobPointLine[] | null;
}): number {
  return getTicketPoints(t.ticket_type, t.device_type, t.cleaning_detail?.service_package) + jobPoints(t.charges);
}
