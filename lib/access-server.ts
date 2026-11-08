import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { audiencesOf, isAllowed, ruleKey, STOCK_CAPABILITIES, type Audience, type Capability } from "@/lib/access";
import type { StockVisibility } from "@/lib/catalog/items";

/** The owner's changes over the defaults, read once per request. */
export const loadAccessOverrides = cache(async (): Promise<Map<string, boolean>> => {
  const rows = await db.accessRule.findMany({ select: { capability: true, audience: true, allowed: true } });
  return new Map(rows.map((r) => [ruleKey(r.capability as Capability, r.audience as Audience), r.allowed]));
});

export type Access = { audiences: Audience[]; can: (capability: Capability) => boolean };

/** What one user may do, read once per request. */
export const accessFor = cache(async (userId: string): Promise<Access> => {
  const [user, overrides] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: { role: true, is_team_leader: true, is_head_technician: true },
    }),
    loadAccessOverrides(),
  ]);
  const audiences = user ? audiencesOf(user) : [];
  return { audiences, can: (capability) => isAllowed(capability, audiences, overrides) };
});

/** The warehouses whose stock this user may see (Pengaturan Akses → Stok Gudang). */
export async function stockVisibilityFor(userId: string): Promise<StockVisibility> {
  const access = await accessFor(userId);
  return new Set(STOCK_CAPABILITIES.filter((c) => access.can(c)));
}
