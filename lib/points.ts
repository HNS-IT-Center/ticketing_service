/**
 * The ticket point table — one copy, for the whole application.
 *
 * There used to be four, across nine copies of this function, and the one the
 * leaderboard rendered was not the one any writer credited: a `Basic_Cleaning`
 * ticket showed 2 pts on the technician dashboard, credited 5 when a technician
 * closed it, and 4 when an administrator did. The divergence dated from
 * 2026-07-27 (`0fed3b9`), when the writers' table changed and nothing else
 * followed.
 *
 * This is the writers' table — the only one that knew the `Other_Device` and
 * `Full_Repaste*` enum values, and the one the stored `TechnicianPerformance`
 * totals were built from. Every display and every writer now reads it, so a
 * badge can no longer promise a number the leaderboard will not award.
 *
 * `extra_services` deliberately does not appear. Two list pages added +3 per
 * extra service to the badge they rendered, but no writer ever credited it, so
 * the badge overstated the reward. Making extras earn is a change here, and it
 * would then apply to every display and every writer at once.
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
