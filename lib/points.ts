/**
 * The ticket point table used by the writers.
 *
 * This is the table `app/actions/tickets.ts` and `app/actions/technician.ts`
 * have credited since 2026-07-27 (`0fed3b9`) — the only one that knows the
 * `Other_Device` and `Full_Repaste*` enum values, and the one the stored
 * `TechnicianPerformance` totals were built from. `app/actions/rma.ts` credits
 * the handover of a warranty claim from here, so that the claim is worth the
 * same as any other credited ticket of its type.
 *
 * It is NOT yet the only copy. The leaderboard, the performance report and the
 * ticket-list badges each still carry their own table, which disagrees with
 * this one for cleaning and for `Other_Device` service. Unifying them changes
 * figures on screen and credited points for admin-closed tickets, so it is its
 * own branch — `fix/points-table-unification` — and deliberately not part of
 * the RMA work.
 *
 * `extra_services` deliberately does not appear here. Two list pages add +3 per
 * extra service to the badge they render, but no writer has ever credited it.
 * That discrepancy also belongs to the unification branch.
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
