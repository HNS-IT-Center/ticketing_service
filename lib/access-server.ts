import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { audiencesOf, isAllowed, ruleKey, STOCK_CAPABILITIES, type Audience, type Capability } from "@/lib/access";
import type { StockVisibility } from "@/lib/catalog/items";
import { isRoleBase, roleCan } from "@/lib/access-roles";

/** The owner's changes over the defaults, read once per request. */
export const loadAccessOverrides = cache(async (): Promise<Map<string, boolean>> => {
  const rows = await db.accessRule.findMany({ select: { capability: true, audience: true, allowed: true } });
  return new Map(rows.map((r) => [ruleKey(r.capability as Capability, r.audience as Audience), r.allowed]));
});

export type Access = { audiences: Audience[]; can: (capability: Capability) => boolean };

/**
 * What one user may do, read once per request.
 *
 * An account with a role from Role & Izin (User.access_role_id) may do
 * exactly what that role holds — provided the role's base type is still the
 * account's own; a mismatch means data written outside the app, and the role
 * is then ignored rather than trusted. The Owner may do everything. Anyone
 * else (accounts made by scripts or before the roles existed) falls back to
 * the older per-group settings, unchanged.
 *
 * `audiences` stays derived from the account's built-in role and flags: it
 * decides behaviour (whose bill one may edit), not access.
 */
export const accessFor = cache(async (userId: string): Promise<Access> => {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      is_team_leader: true,
      is_head_technician: true,
      access_role: { select: { base: true, grants: { select: { capability: true } } } },
    },
  });
  const audiences = user ? audiencesOf(user) : [];
  if (user?.role === "Owner") return { audiences, can: () => true };
  const role = user?.access_role;
  if (role && isRoleBase(role.base) && role.base === user.role) {
    return { audiences, can: roleCan(role.base, role.grants.map((g) => g.capability)) };
  }
  const overrides = await loadAccessOverrides();
  return { audiences, can: (capability) => isAllowed(capability, audiences, overrides) };
});

/** The warehouses whose stock this user may see (Pengaturan Akses → Stok Gudang). */
export async function stockVisibilityFor(userId: string): Promise<StockVisibility> {
  const access = await accessFor(userId);
  return new Set(STOCK_CAPABILITIES.filter((c) => access.can(c)));
}
