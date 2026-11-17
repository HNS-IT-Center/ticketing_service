import type { Prisma } from "@prisma/client";

/**
 * A PC build's labour on its bill — the assembly fee is the technician's job
 * and counts toward their target like any service job (owner, 2026-11-16).
 *
 * Pure, like `lib/check-fee.ts`: the create action loads the Daftar Jasa and
 * writes what this returns.
 */

/** The Daftar Jasa job for building a PC, seeded by the migration that added this. */
export const ASSEMBLY_JOB_NAME = "Jasa Rakit PC";
/** Accurate's service item "JASA RAKIT PC", which the e-commerce quotation bills the assembly as. */
export const ASSEMBLY_JOB_SKU = "101048";

export type LabourJob = {
  id: string;
  name: string;
  points: number;
  default_price: number | null;
  accurate_sku: string | null;
};

export type LabourLine = { name: string; sku: string | null; quantity: number; unitPrice: number | null };

const fold = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const isAssembly = (s: string) => fold(s).includes("rakit");

/** The active job a quotation's service line is: its Accurate code, else its name, else "Jasa Rakit PC" for an assembly line. */
export function labourJobFor(line: LabourLine, jobs: LabourJob[]): LabourJob | null {
  const sku = fold(line.sku);
  return (
    (sku ? jobs.find((j) => fold(j.accurate_sku) === sku) : undefined) ??
    jobs.find((j) => fold(j.name) === fold(line.name)) ??
    (isAssembly(line.name)
      ? (jobs.find((j) => fold(j.name) === fold(ASSEMBLY_JOB_NAME)) ?? jobs.find((j) => fold(j.accurate_sku) === ASSEMBLY_JOB_SKU))
      : undefined) ??
    null
  );
}

/**
 * The bill lines for a new PC build.
 *
 * - From a quotation: one line per service line, at the price it was sold for
 *   (a PDF prints no prices, so the job's default is used there).
 * - Without a quotation: one "Jasa Rakit PC" line at the job's default price.
 * - A quotation with no service line at all — a pre-built package may leave
 *   the step out — still records the job, with no price: the work was done,
 *   and what was charged for it is for whoever sets prices to fill in.
 *
 * `jobs` is the active Daftar Jasa. Without a matching job the line keeps its
 * own name and price and earns no target points.
 */
export function pcBuildLabourCharges(
  ticketId: string,
  serviceLines: LabourLine[] | null,
  jobs: LabourJob[],
  createdById: string,
): Prisma.TicketChargeUncheckedCreateInput[] {
  const assemblyJob =
    jobs.find((j) => fold(j.name) === fold(ASSEMBLY_JOB_NAME)) ?? jobs.find((j) => fold(j.accurate_sku) === ASSEMBLY_JOB_SKU) ?? null;
  const line = (job: LabourJob | null, name: string, quantity: number, unitPrice: number | null) => ({
    ticket_id: ticketId,
    kind: "service_fee" as const,
    description: job?.name ?? name,
    quantity,
    unit_price: unitPrice,
    service_job_id: job?.id ?? null,
    job_points: job ? job.points : null,
    created_by_id: createdById,
  });

  if (serviceLines === null) return [line(assemblyJob, ASSEMBLY_JOB_NAME, 1, assemblyJob?.default_price ?? null)];
  if (serviceLines.length === 0) return [line(assemblyJob, ASSEMBLY_JOB_NAME, 1, null)];
  return serviceLines.map((l) => {
    const job = labourJobFor(l, jobs);
    return line(job, l.name, l.quantity, l.unitPrice ?? job?.default_price ?? null);
  });
}
