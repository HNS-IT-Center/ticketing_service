import "server-only";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { BASE_LABELS, SYSTEM_ROLES, isRoleBase } from "@/lib/access-roles";

export type RoleChoice = { role: Role; accessRoleId: string | null; label: string };

/** Values the account form may post that are not a made role. */
const PLAIN: Partial<Record<string, string>> = { Owner: "Owner", Pending: "Menunggu role", Customer: "Customer" };

/**
 * What the account form's Role select means. Its options are the made roles
 * (by id) plus Owner, Pending and Customer, which have no made role. A bare
 * base type ("Technician") — from a script or an older form — becomes the
 * role the migration made for it, so nobody ends up holding no role by
 * accident. Null when the value matches nothing.
 */
export async function resolveRoleChoice(value: string): Promise<RoleChoice | null> {
  if (PLAIN[value]) return { role: value as Role, accessRoleId: null, label: PLAIN[value]! };
  const id = isRoleBase(value) ? SYSTEM_ROLES.find((r) => r.base === value && r.audiences.length === 1)?.id : value;
  if (!id) return null;
  const role = await db.accessRole.findUnique({ where: { id }, select: { id: true, name: true, base: true } });
  if (role && isRoleBase(role.base)) return { role: role.base, accessRoleId: role.id, label: role.name };
  // The base exists but its made role was deleted: keep the base, no made role.
  if (isRoleBase(value)) return { role: value, accessRoleId: null, label: BASE_LABELS[value] };
  return null;
}

/** The roles the account form offers, for whoever is filling it in. */
export async function roleOptions() {
  const roles = await db.accessRole.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, base: true } });
  return roles.flatMap((r) => (isRoleBase(r.base) ? [{ id: r.id, name: r.name, base: r.base }] : []));
}
