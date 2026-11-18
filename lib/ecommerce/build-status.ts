import "server-only";
import { db } from "@/lib/db";
import { BUILD_STAGE_LABELS, buildStageOf, type BuildStage } from "@/lib/stock";

/**
 * Which quotations already have a PC build ticket (owner, 2026-11-18): the
 * e-commerce side marks those quotations "Sudah dirakit" on its lists. A
 * marker only — it does not close the quotation or touch any sales figure;
 * closing stays with sales and the cashier.
 *
 * Only live tickets count (cancelled and rejected ones do not, as at intake),
 * so a cancelled build drops its marker. No customer data and no prices.
 */

export const MAX_STATUS_CODES = 100;

export type BuildStatus = {
  ticketCode: string;
  status: string;
  stage: BuildStage | null;
  stageLabel: string | null;
  store: string | null;
  /** When the ticket was opened, ISO. */
  createdAt: string;
  /** When the build first reached `done`, ISO; null while it is being built. */
  finishedAt: string | null;
};

/** Keyed by quotation code; a code with no live ticket is left out. */
export async function loadBuildStatuses(codes: readonly string[]): Promise<Record<string, BuildStatus>> {
  if (codes.length === 0) return {};
  const rows = await db.ticketPcBuildDetail.findMany({
    where: { quote_code: { in: [...codes] }, ticket: { status: { notIn: ["cancelled", "rejected"] } } },
    select: {
      quote_code: true,
      ticket: {
        select: { id: true, ticket_code: true, status: true, created_at: true, store_location: { select: { name: true } } },
      },
    },
  });
  if (rows.length === 0) return {};

  const done = await db.ticketStatusLog.groupBy({
    by: ["ticket_id"],
    where: { ticket_id: { in: rows.map((r) => r.ticket.id) }, new_status: "done" },
    _min: { created_at: true },
  });
  const finished = new Map(done.map((d) => [d.ticket_id, d._min.created_at]));

  const out: Record<string, BuildStatus> = {};
  for (const { quote_code, ticket: t } of rows) {
    if (!quote_code) continue;
    // One quotation opens one live ticket; should two ever exist, the newer answers.
    const current = out[quote_code];
    if (current && current.createdAt >= t.created_at.toISOString()) continue;
    const stage = buildStageOf(t.status);
    out[quote_code] = {
      ticketCode: t.ticket_code,
      status: t.status,
      stage,
      stageLabel: stage ? BUILD_STAGE_LABELS[stage] : null,
      store: t.store_location?.name ?? null,
      createdAt: t.created_at.toISOString(),
      finishedAt: finished.get(t.id)?.toISOString() ?? null,
    };
  }
  return out;
}
