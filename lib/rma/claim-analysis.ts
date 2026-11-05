import type { RmaDecision, RmaStatus } from "@prisma/client";

/**
 * Which brands and which kinds of goods come back under warranty, and how
 * those claims end — the RMA desk's "Analisa Klaim". Pure: the page loads the
 * rows, this counts them.
 *
 * Brand and category come from the Accurate catalogue (Ticket.device_brand,
 * device_catalog_category), not from the typed unit name: the dashboard's old
 * brand chart guessed the brand from the first word of free text and was
 * withdrawn for counting "Tuf" and "ROG" apart from ASUS (BL28). A unit typed
 * by hand has neither, and is counted as unknown rather than guessed.
 */

export const CLAIM_OUTCOMES = ["in_progress", "approved", "vendor_rejected", "ineligible", "cancelled", "not_handed_over"] as const;
export type ClaimOutcome = (typeof CLAIM_OUTCOMES)[number];

export const CLAIM_OUTCOME_LABELS: Record<ClaimOutcome, string> = {
  in_progress: "Dalam proses",
  approved: "Disetujui",
  vendor_rejected: "Ditolak vendor",
  ineligible: "Tidak layak",
  cancelled: "Dibatalkan",
  not_handed_over: "Belum ke RMA",
};

export type ClaimAnalysisRow = {
  device_brand: string | null;
  device_catalog_category: string | null;
  device_sku: string | null;
  device_name: string | null;
  rma_case: { status: RmaStatus; decision: RmaDecision | null } | null;
};

/** How a claim stands or ended. Approved = repaired, replaced or refunded. */
export function claimOutcome(rmaCase: ClaimAnalysisRow["rma_case"]): ClaimOutcome {
  if (!rmaCase) return "not_handed_over";
  if (rmaCase.status === "cancelled") return "cancelled";
  if (rmaCase.status === "ineligible") return "ineligible";
  if (rmaCase.decision === "rejected") return "vendor_rejected";
  if (rmaCase.decision) return "approved";
  return "in_progress";
}

/**
 * The kind of goods, without the make: the shop names categories
 * "<kind> <brand>" ("VGA CARD MSI", "LAPTOP ASUS"), so the brand is taken off
 * the end. A category that does not end with the brand is kept whole.
 */
export function categoryKind(category: string | null, brand: string | null): string | null {
  const c = (category ?? "").trim().replace(/\s+/g, " ").toUpperCase();
  if (!c) return null;
  const b = (brand ?? "").trim().toUpperCase();
  if (b && c.endsWith(` ${b}`)) return c.slice(0, -(b.length + 1));
  return c;
}

export type BreakdownRow = {
  key: string;
  label: string;
  total: number;
  outcomes: Record<ClaimOutcome, number>;
  /** Approved over decided (approved + vendor-rejected + ineligible); null when none is decided yet. */
  approvalRate: number | null;
};

export const UNKNOWN_KEY = "__unknown__";

function emptyOutcomes(): Record<ClaimOutcome, number> {
  return Object.fromEntries(CLAIM_OUTCOMES.map((o) => [o, 0])) as Record<ClaimOutcome, number>;
}

function breakdown(
  rows: readonly ClaimAnalysisRow[],
  keyOf: (r: ClaimAnalysisRow) => { key: string; label: string } | null,
  unknownLabel: string,
): BreakdownRow[] {
  const map = new Map<string, BreakdownRow>();
  for (const r of rows) {
    const k = keyOf(r) ?? { key: UNKNOWN_KEY, label: unknownLabel };
    let row = map.get(k.key);
    if (!row) {
      row = { key: k.key, label: k.label, total: 0, outcomes: emptyOutcomes(), approvalRate: null };
      map.set(k.key, row);
    }
    row.total++;
    row.outcomes[claimOutcome(r.rma_case)]++;
  }
  for (const row of map.values()) {
    const decided = row.outcomes.approved + row.outcomes.vendor_rejected + row.outcomes.ineligible;
    row.approvalRate = decided ? row.outcomes.approved / decided : null;
  }
  // Most claims first; the unknown row last, whatever its size, so it reads
  // as a gap in the data rather than as the leading brand.
  return [...map.values()].sort((a, b) =>
    a.key === UNKNOWN_KEY ? 1 : b.key === UNKNOWN_KEY ? -1 : b.total - a.total || a.label.localeCompare(b.label),
  );
}

export function analyzeClaims(rows: readonly ClaimAnalysisRow[], topItems = 15) {
  const byBrand = breakdown(
    rows,
    (r) => (r.device_brand ? { key: r.device_brand.toUpperCase(), label: r.device_brand.toUpperCase() } : null),
    "Tidak diketahui (diketik manual)",
  );
  const byCategory = breakdown(
    rows,
    (r) => {
      const kind = categoryKind(r.device_catalog_category, r.device_brand);
      return kind ? { key: kind, label: kind } : null;
    },
    "Tidak diketahui (diketik manual)",
  );
  const byItem = breakdown(
    rows.filter((r) => r.device_sku),
    (r) => ({ key: r.device_sku as string, label: r.device_name?.trim() || (r.device_sku as string) }),
    "",
  ).slice(0, topItems);
  return {
    total: rows.length,
    unknownBrand: rows.filter((r) => !r.device_brand).length,
    byBrand,
    byCategory,
    byItem,
  };
}
