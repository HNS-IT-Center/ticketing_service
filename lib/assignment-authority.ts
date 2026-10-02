/**
 * Who may act on a ticket assignment request — one copy of the rule.
 *
 * `GET /api/ticket-requests` filtered its list to the coordinator's own stores
 * while `POST` checked nothing at all, so a coordinator who knew a `requestId`
 * could approve a ticket belonging to any store. The bell hid those requests;
 * it never stopped them. The two halves of one endpoint disagreeing is the same
 * shape of fault as the four point tables, so the rule lives here and both
 * halves read it.
 *
 * A ticket with no store (`store_location_id === null`, the `TKT-` codes) stays
 * visible and actionable to every coordinator: it belongs to no store, so no
 * store can be the one that owns it, and hiding it from everyone would leave it
 * unassignable. That matches what the list already did.
 */

export type AssignmentAuthority =
  /** Administrator and Sales: every store. */
  | { kind: "admin" }
  /** Technician with `is_team_leader`: only the stores they are assigned to. */
  | { kind: "coordinator"; storeIds: readonly string[] }
  /** Anyone else. */
  | { kind: "none" };

/** Roles the route treats as unrestricted. Sales is included deliberately. */
export const UNRESTRICTED_ASSIGNMENT_ROLES = ["Administrator", "Sales"] as const;

export function isUnrestrictedAssignmentRole(role: string): boolean {
  return (UNRESTRICTED_ASSIGNMENT_ROLES as readonly string[]).includes(role);
}

/**
 * True when `authority` may read or approve a request for a ticket held by
 * `ticketStoreId`. `null` means the ticket has no store.
 */
export function canActOnAssignmentRequest(
  authority: AssignmentAuthority,
  ticketStoreId: string | null | undefined,
): boolean {
  switch (authority.kind) {
    case "admin":
      return true;
    case "coordinator":
      // A ticket without a store belongs to no store, so every coordinator
      // keeps it; otherwise the store must be one of theirs.
      if (ticketStoreId === null || ticketStoreId === undefined) return true;
      return authority.storeIds.includes(ticketStoreId);
    case "none":
      return false;
    default: {
      const _exhaustive: never = authority;
      return Boolean(_exhaustive);
    }
  }
}

/** The message the API returns when a coordinator reaches outside their stores. */
export const CROSS_STORE_DENIED =
  "This request belongs to another store's ticket.";
