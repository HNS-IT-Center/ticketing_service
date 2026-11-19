"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { BASE_LABELS, cleanGrants, isRoleBase } from "@/lib/access-roles";
import { logActivity } from "@/lib/activity";

/**
 * Pengguna & Akses → Role & Izin (owner, 2026-11-18): making, changing and
 * removing roles. Owner only — an Administrator is one of the groups a role
 * narrows, so letting one edit roles would let them widen their own.
 *
 * A role's grants are stored in full (AccessRoleGrant), cleaned against its
 * base type first, so a capability that cannot apply to it is never kept.
 */

type Result = { success: true; id: string } | { error: string };

const NAME_MAX = 60;

function readForm(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim().replace(/\s+/g, " ");
  const description = String(formData.get("description") ?? "").trim();
  const base = String(formData.get("base") ?? "");
  const grants = formData.getAll("grant").map(String);
  return { name, description, base, grants };
}

function invalid(name: string, base: string): string | null {
  if (!name) return "Nama role wajib diisi.";
  if (name.length > NAME_MAX) return `Nama role maksimal ${NAME_MAX} karakter.`;
  if (["owner", "pending", "customer"].includes(name.toLowerCase())) return "Nama itu dipakai sistem. Pilih nama lain.";
  if (!isRoleBase(base)) return "Pilih tipe dasar role.";
  return null;
}

const duplicate = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
const DUPLICATE = "Sudah ada role dengan nama itu.";

export async function createAccessRoleAction(formData: FormData): Promise<Result> {
  const session = await requireRole("Owner");
  const { name, description, base, grants } = readForm(formData);
  const error = invalid(name, base);
  if (error || !isRoleBase(base)) return { error: error ?? "Pilih tipe dasar role." };
  const caps = cleanGrants(base, grants);

  try {
    const role = await db.accessRole.create({
      data: {
        name,
        description: description || null,
        base,
        created_by_id: session.userId,
        grants: { create: caps.map((capability) => ({ capability })) },
      },
      select: { id: true },
    });
    await logActivity(session, "role.create", `Membuat role ${name} (dasar ${BASE_LABELS[base]}, ${caps.length} izin).`, {
      type: "access",
      id: role.id,
      label: name,
    });
    revalidatePath("/admin/settings/access");
    return { success: true, id: role.id };
  } catch (e) {
    if (duplicate(e)) return { error: DUPLICATE };
    throw e;
  }
}

export async function updateAccessRoleAction(roleId: string, formData: FormData): Promise<Result> {
  const session = await requireRole("Owner");
  const { name, description, base, grants } = readForm(formData);
  const error = invalid(name, base);
  if (error || !isRoleBase(base)) return { error: error ?? "Pilih tipe dasar role." };

  const current = await db.accessRole.findUnique({
    where: { id: roleId },
    select: { name: true, base: true, _count: { select: { users: true } }, grants: { select: { capability: true } } },
  });
  if (!current) return { error: "Role tidak ditemukan. Mungkin sudah dihapus." };
  // An account's built-in role is its role's base; changing the base under
  // people would change what they *are* (their portal, holding tickets), so
  // it is only allowed while nobody holds the role.
  if (current.base !== base && current._count.users > 0) {
    return { error: `Tipe dasar tidak bisa diganti: role ini dipakai ${current._count.users} akun.` };
  }

  const caps = cleanGrants(base, grants);
  const kept = new Set<string>(caps);
  const before = new Set(current.grants.map((g) => g.capability));
  const added = caps.filter((c) => !before.has(c)).length;
  const removed = [...before].filter((c) => !kept.has(c)).length;

  try {
    await db.$transaction([
      db.accessRole.update({ where: { id: roleId }, data: { name, description: description || null, base } }),
      db.accessRoleGrant.deleteMany({ where: { role_id: roleId } }),
      db.accessRoleGrant.createMany({ data: caps.map((capability) => ({ role_id: roleId, capability })) }),
    ]);
  } catch (e) {
    if (duplicate(e)) return { error: DUPLICATE };
    throw e;
  }
  const renamed = current.name !== name ? ` (dulu ${current.name})` : "";
  await logActivity(session, "role.update", `Mengubah role ${name}${renamed}: ${caps.length} izin, +${added} / −${removed}.`, {
    type: "access",
    id: roleId,
    label: name,
  });
  revalidatePath("/admin/settings/access");
  return { success: true, id: roleId };
}

export async function deleteAccessRoleAction(roleId: string): Promise<{ success: true } | { error: string }> {
  const session = await requireRole("Owner");
  const role = await db.accessRole.findUnique({ where: { id: roleId }, select: { name: true, _count: { select: { users: true } } } });
  if (!role) return { error: "Role tidak ditemukan. Mungkin sudah dihapus." };
  if (role._count.users > 0) {
    return { error: `Role ${role.name} masih dipakai ${role._count.users} akun. Pindahkan mereka ke role lain dulu di tab Akun.` };
  }
  // Conditional, so an account given this role meanwhile is never orphaned.
  const gone = await db.accessRole.deleteMany({ where: { id: roleId, users: { none: {} } } });
  if (gone.count === 0) return { error: `Role ${role.name} baru saja diberikan ke akun. Muat ulang halaman.` };
  await logActivity(session, "role.delete", `Menghapus role ${role.name}.`, { type: "access", id: roleId, label: role.name });
  revalidatePath("/admin/settings/access");
  return { success: true };
}
