import { requireRole } from "@/lib/session";
import { urlSort } from "@/lib/table-sort";
import { db } from "@/lib/db";
import Link from "next/link";
import type { Role } from "@prisma/client";
import { DataTable, type DataTableColumn } from "@/components/app/DataTable";
import { EmptyState } from "@/components/app/EmptyState";
import { FilterBar, FilterBarSearch } from "@/components/app/FilterBar";
import { FilterChips } from "@/components/app/FilterChips";
import { UsersAccessHeader } from "@/components/users/UsersAccessTabs";
import { RoleBadge } from "@/components/app/RoleBadge";
import { Button, buttonVariants } from "@/components/ui/button";
import { UserPlus, Users } from "lucide-react";
import { DeactivateUserButton } from "@/components/users/DeactivateUserButton";

export const metadata = { title: "Pengguna & Akses — HNS IT Center" };

// "Pending" are accounts that signed in through HNS SSO and still need a role.
const ROLES = ["all", "Pending", "Administrator", "Technician", "Sales", "RMA", "StoreSupervisor", "StockAdmin", "Finance", "Customer"] as const;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; q?: string }>;
}) {
  const session = await requireRole("Administrator");
  const params = await searchParams;
  const roleFilter = params.role || "all";
  const query = params.q || "";

  const users = await db.user.findMany({
    where: {
      is_active: true,
      ...(roleFilter !== "all" ? { role: roleFilter as Role } : {}),
      ...(query ? { OR: [{ name: { contains: query } }, { email: { contains: query } }] } : {}),
    },
    orderBy: { created_at: "desc" },
    include: {
      _count: { select: { tickets_technician: { where: { status: { in: ["waiting", "on_progress"] } } } } },
    },
  });

  type ListUser = (typeof users)[number];
  const columns: DataTableColumn<ListUser>[] = [
    { key: "name", sortValue: (u) => u.name, header: "Name", cell: (u) => <span className="font-semibold">{u.name}</span>, mobile: "title" },
    {
      key: "email", sortValue: (u) => u.email,
      header: "Email",
      cell: (u) => (
        <span className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span className="min-w-0 [overflow-wrap:anywhere]">{u.email}</span>
          {u.sso_sub && (
            <span
              title="Tertaut ke akun SSO HNS"
              className="rounded-full border border-tone-green-border bg-tone-green-bg px-2 py-0.5 text-xs font-semibold text-tone-green-fg"
            >
              SSO
            </span>
          )}
        </span>
      ),
    },
    { key: "phone", sortValue: (u) => u.phone_number, header: "Phone", cell: (u) => u.phone_number, className: "text-sm text-muted-foreground" },
    { key: "role", sortValue: (u) => u.role, header: "Role", cell: (u) => <RoleBadge role={u.role} />, mobile: "badge" },
    {
      key: "active", sortValue: (u) => (u.role === "Technician" ? u._count.tickets_technician : null), sortFirst: "desc",
      header: "Active Tickets",
      cell: (u) =>
        u.role === "Technician" ? (
          <span className="rounded-full border border-tone-blue-border bg-tone-blue-bg px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-tone-blue-fg">
            {u._count.tickets_technician} active
          </span>
        ) : (
          "—"
        ),
    },
    {
      key: "joined", sortValue: (u) => u.created_at, sortFirst: "desc",
      header: "Joined",
      cell: (u) => new Date(u.created_at).toLocaleDateString("id-ID"),
      className: "whitespace-nowrap text-sm text-muted-foreground",
    },
    {
      key: "edit",
      header: "",
      cell: () => <span className="text-sm font-medium text-primary">Edit →</span>,
      className: "hidden text-right xl:table-cell",
      mobile: "hidden",
    },
    {
      key: "delete",
      header: <span className="sr-only">Hapus</span>,
      mobileLabel: "Hapus",
      className: "w-px text-right",
      mobile: "footer",
      interactive: true,
      // Your own account is not offered: the action refuses it anyway.
      cell: (u) => (u.id === session.userId ? null : <DeactivateUserButton user={{ id: u.id, name: u.name }} compact />),
    },
  ];

  const chips = ROLES.map((r) => ({
    key: r,
    label: r === "all" ? "All Roles" : r === "Pending" ? "Menunggu role" : r === "StoreSupervisor" ? "Kepala Toko" : r === "StockAdmin" ? "Admin Stok" : r,
    href: r === "all" ? "/admin/users" : `/admin/users?role=${r}`,
  }));

  return (
    // Built from components/app and shadcn only, so the page opts into
    // Tailwind spacing with a data-slot (the UI-1 reset rule).
    <div data-slot="admin-users" className="flex flex-col gap-5">
      <UsersAccessHeader
        active="akun"
        description={`${users.length} akun. Role menentukan halaman yang bisa dibuka — diatur di tab Role & Izin.`}
        actions={
          <Link href="/admin/users/create" className={buttonVariants()}>
            <UserPlus aria-hidden="true" /> Tambah pengguna
          </Link>
        }
      />

      <div className="flex flex-col gap-3">
        <FilterBar action="/admin/users">
          {roleFilter !== "all" && <input type="hidden" name="role" value={roleFilter} />}
          <FilterBarSearch label="Search users" placeholder="Search by name or email..." defaultValue={query} />
          <Button type="submit" className="md:w-auto">Search</Button>
        </FilterBar>
        <FilterChips label="Role" chips={chips} active={roleFilter} />
      </div>

      <DataTable
        caption="Users"
        sort={urlSort("/admin/users", params)}
        columns={columns}
        rows={users}
        getRowKey={(u) => u.id}
        rowHref={(u) => `/admin/users/${u.id}`}
        empty={<EmptyState icon={Users} title="No users found" />}
      />
    </div>
  );
}
