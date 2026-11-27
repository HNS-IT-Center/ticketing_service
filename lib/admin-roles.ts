/**
 * Owner and Administrator (owner, 2026-11-18).
 *
 * The Owner is the boss: everything an Administrator may, always, and the only
 * one who changes Pengaturan Akses or the Administrator / Owner accounts. An
 * Administrator is staff whose pages and data the Owner can narrow in
 * Pengaturan Akses — by default nothing is narrowed, so the change moved no
 * one's menu.
 *
 * Pure: proxy, server actions and client forms share it, and the tests need no
 * database.
 */

/** Both roles that run the admin portal. A check for "an administrator" means either. */
export const ADMIN_ROLES = ["Owner", "Administrator"] as const;

export function isAdminRole(role: string | null | undefined): boolean {
  return role === "Owner" || role === "Administrator";
}

/** Whether `role` is one of `roles`, an Owner counting as an Administrator. */
export function roleMatches(role: string, roles: readonly string[]): boolean {
  return roles.includes(role) || (role === "Owner" && roles.includes("Administrator"));
}

export function isOwnerRole(role: string | null | undefined): boolean {
  return role === "Owner";
}

/**
 * Roles whose holders only the Owner may change or deactivate. Otherwise an
 * Administrator could demote the boss, or give a colleague back what the
 * Owner took away in Pengaturan Akses.
 *
 * The Owner role itself an Administrator may give (owner, 2026-11-27), so the
 * shop never depends on one person's login to name a new Owner. What keeps
 * that safe: nobody changes their own role (updateUserAction,
 * promoteToOwnerAction), and an existing Owner can be changed only by an
 * Owner. The Administrator role stays the Owner's to give.
 */
export const OWNER_GUARDED_ROLES: readonly string[] = ADMIN_ROLES;

export const OWNER_ONLY_ACCOUNT_MESSAGE = "Hanya Owner yang dapat mengubah atau menonaktifkan akun Admin dan Owner, atau memberi role Admin.";

/**
 * Whether `actorRole` may create or change an account.
 *
 * `currentRole` is the account's role now (null when creating one),
 * `newRole` the role it would have afterwards (null when not changing it, as
 * in a deactivation).
 */
export function mayManageAccount(actorRole: string, currentRole: string | null, newRole: string | null): boolean {
  if (isOwnerRole(actorRole)) return true;
  if (actorRole !== "Administrator") return false;
  if (currentRole !== null && OWNER_GUARDED_ROLES.includes(currentRole)) return false;
  if (newRole === "Administrator") return false;
  return true;
}

/**
 * Whether `actorRole` may make an existing account an Owner — the one change
 * an Administrator may make to an Administrator account (owner, 2026-11-27).
 * Never one's own account, never one already an Owner.
 */
export function mayPromoteToOwner(actorRole: string, targetRole: string, isSelf: boolean): boolean {
  return !isSelf && isAdminRole(actorRole) && targetRole !== "Owner";
}

/** The roles a form may offer this person, in the given order. */
export function assignableRoles<R extends string>(actorRole: string, roles: readonly R[]): R[] {
  return roles.filter((r) => mayManageAccount(actorRole, null, r));
}
