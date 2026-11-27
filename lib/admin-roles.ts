/**
 * Owner and Administrator.
 *
 * The Owner role came in 2026-11-18 as the boss above Administrators: the only
 * one who changed Pengaturan Akses or the Administrator / Owner accounts. On
 * 2026-11-27 the owner made them equal ("akun admin aksesnya sama seperti
 * owner"): an Administrator now runs Role & Izin and manages every account,
 * Owner ones included. What still tells them apart is only the label, and that
 * an Owner's access can never be narrowed (lib/access-server.ts) while the
 * Admin role is a role like any other in Role & Izin.
 *
 * What still holds for both: nobody changes their own role (the account
 * actions check it), so nobody demotes themselves by accident.
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

export const OWNER_ONLY_ACCOUNT_MESSAGE = "Hanya Owner dan Admin yang dapat menambah, mengubah, atau menonaktifkan akun ini.";

/**
 * Whether `actorRole` may create or change an account — any account, any role
 * (Owner and Administrator alike since 2026-11-27). `currentRole` and
 * `newRole` are kept in the signature for the callers that pass them.
 */
export function mayManageAccount(actorRole: string, currentRole: string | null, newRole: string | null): boolean {
  void currentRole;
  void newRole;
  return isAdminRole(actorRole);
}

/** Who runs Role & Izin: Owner and Administrator alike since 2026-11-27. */
export function mayRunOwnerTools(role: string | null | undefined): boolean {
  return isAdminRole(role);
}

/** The roles a form may offer this person, in the given order. */
export function assignableRoles<R extends string>(actorRole: string, roles: readonly R[]): R[] {
  return roles.filter((r) => mayManageAccount(actorRole, null, r));
}
