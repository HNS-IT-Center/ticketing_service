/**
 * Proof files uploaded with a status change are named
 * `{prefix}_{ticket_code}_{name}.ext` (see updateTicketStatusAction). The three
 * ticket detail pages split them from ordinary attachments by that prefix —
 * one copy here instead of one per page.
 */
export const PROOF_PREFIXES = ["work-proof", "courier-proof", "pickup-proof", "delivery-proof", "cancel-proof"] as const;
export type ProofKind = (typeof PROOF_PREFIXES)[number];

export function proofKindOf(url: string): ProofKind | null {
  const filename = url.split("/").pop()?.split("?")[0] ?? "";
  return PROOF_PREFIXES.find((p) => filename.startsWith(p)) ?? null;
}

/** The file's own name, from its URL. */
export function fileNameOf(url: string): string {
  return url.split("/").pop()?.split("?")[0] ?? "file";
}
