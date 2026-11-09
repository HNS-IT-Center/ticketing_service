import type { Prisma } from "@prisma/client";

/**
 * The check fee every service ticket records at intake (Rp 50.000) goes on the
 * bill as a "Diagnosa / Pengecekan" line — owner, 2026-11-08: always billed,
 * removable from Rincian Biaya when it is waived. Before, it sat on
 * `Ticket.checking_fee` and the cashier had to add the job again by hand.
 */
export const CHECK_FEE_JOB_NAME = "Diagnosa / Pengecekan";

export type CheckFeeJob = { id: string; name: string; points: number; is_active: boolean } | null;

/**
 * The bill line for a recorded check fee, or null when there is none. The job
 * from the Daftar Jasa is linked while it is active, so the line counts like
 * any picked job; without one the line still carries the price.
 */
export function checkFeeCharge(
  ticketId: string,
  fee: number | null,
  job: CheckFeeJob,
  createdById: string,
): Prisma.TicketChargeUncheckedCreateInput | null {
  if (fee === null || !(fee > 0)) return null;
  const linked = job && job.is_active ? job : null;
  return {
    ticket_id: ticketId,
    kind: "service_fee",
    description: linked?.name ?? CHECK_FEE_JOB_NAME,
    quantity: 1,
    unit_price: Math.round(fee),
    service_job_id: linked?.id ?? null,
    job_points: linked ? linked.points : null,
    created_by_id: createdById,
  };
}
