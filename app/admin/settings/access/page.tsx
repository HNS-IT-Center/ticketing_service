import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { isOwnerRole } from "@/lib/admin-roles";
import { cleanGrants, isRoleBase } from "@/lib/access-roles";
import { UsersAccessHeader } from "@/components/users/UsersAccessTabs";
import { RoleManager, type RoleRow } from "./RoleManager";

export const metadata = { title: "Role & Izin — HNS IT Center" };

/**
 * Pengguna & Akses → Role & Izin (owner, 2026-11-18, mockup v2): every role in
 * one list, made and changed by the Owner. A role is a name, a base type that
 * keeps its behaviour, and what it may open — see lib/access-roles.ts.
 */
export default async function AccessSettingsPage() {
  // Owner only; an Administrator who types the address is told no.
  const session = await requireRole("Administrator");
  if (!isOwnerRole(session.role)) redirect("/unauthorized");

  const [roles, owners] = await Promise.all([
    db.accessRole.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        description: true,
        base: true,
        grants: { select: { capability: true } },
        _count: { select: { users: true } },
        users: { where: { is_active: true }, select: { id: true } },
      },
    }),
    db.user.count({ where: { role: "Owner", is_active: true } }),
  ]);

  const rows: RoleRow[] = roles.flatMap((r) =>
    isRoleBase(r.base)
      ? [
          {
            id: r.id,
            name: r.name,
            description: r.description,
            base: r.base,
            grants: cleanGrants(r.base, r.grants.map((g) => g.capability)),
            users: r.users.length,
            holders: r._count.users,
          },
        ]
      : [],
  );

  return (
    <div data-slot="access-settings" className="flex flex-col gap-5">
      <UsersAccessHeader
        active="role"
        description="Role menentukan halaman dan fitur yang bisa dibuka. Buat role dari tipe dasar, lalu pilih aksesnya per halaman."
      />
      <RoleManager roles={rows} owners={owners} />
    </div>
  );
}
