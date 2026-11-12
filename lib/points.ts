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
