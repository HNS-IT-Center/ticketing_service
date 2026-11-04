import type { RmaDecision } from "@prisma/client";

/**
 * The vendor's decision on a claim, in the desk's words. Exhaustive over the
 * enum, so a decision added to the schema without a label fails the build.
 * Plain data, no React: read by the RMA pages and by the claim export.
 */
export const RMA_DECISION_LABELS: Record<RmaDecision, string> = {
  repaired: "Diperbaiki",
  replaced: "Diganti unit baru",
  refund: "Dana dikembalikan",
  rejected: "Ditolak vendor",
};

/** For a decision that arrives as a plain string (a grouped count): its label, or the value itself. */
export function rmaDecisionLabel(value: string): string {
  return (RMA_DECISION_LABELS as Record<string, string>)[value] ?? value;
}
