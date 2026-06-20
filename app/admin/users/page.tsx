import { requireRole } from "@/lib/session";
import { db } from "@/lib/db";
import Link from "next/link";
import Badge from "@/components/ui/Badge";
import { UserPlus } from "lucide-react";

export const metadata = { title: "User Management — HNS IT Center" };

const ROLES = ["all", "Administrator", "Technician", "Sales", "Customer"] as const;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; q?: string }>;
}) {
  await requireRole("Administrator");
  const params = await searchParams;
  const roleFilter = params.role || "all";
  const query = params.q || "";

  const users = await db.user.findMany({
    where: {
      is_active: true,
      ...(roleFilter !== "all" ? { role: roleFilter as any } : {}),
      ...(query ? { OR: [{ name: { contains: query, mode: "insensitive" } }, { email: { contains: query, mode: "insensitive" } }] } : {}),
    },
    orderBy: { created_at: "desc" },
    include: {
      _count: { select: { tickets_technician: { where: { status: { in: ["waiting", "on_progress"] } } } } },
    },
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1>User Management</h1>
          <p style={{ color: "var(--text-muted)", marginTop: "0.25rem" }}>{users.length} users found</p>
        </div>
        <Link href="/admin/users/create" className="btn btn-primary">
          <UserPlus size={16} /> Add User
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3 md:items-center px-4 md:px-0">
        <div className="flex gap-2 flex-wrap">
          {ROLES.map((r) => (
            <Link
              key={r}
              href={r === "all" ? "/admin/users" : `/admin/users?role=${r}`}
              className="btn btn-sm"
              style={{
                background: roleFilter === r ? "var(--primary)" : "var(--white)",
                color: roleFilter === r ? "#fff" : "var(--text-secondary)",
                border: "1.5px solid",
                borderColor: roleFilter === r ? "var(--primary)" : "var(--border)",
              }}
            >
              {r === "all" ? "All Roles" : r}
            </Link>
          ))}
        </div>
        <form className="w-full md:w-auto md:ml-auto">
          <input
            name="q"
            defaultValue={query}
            className="form-input w-full md:w-[220px]"
            placeholder="Search by name or email..."
          />
        </form>
      </div>

      {/* Desktop table */}
      <div className="admin-ticket-table">
        <div className="table-wrapper">
          <table>
            <thead>
              <tr><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Active Tickets</th><th>Joined</th><th></th></tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 600 }}>{u.name}</td>
                  <td style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>{u.email}</td>
                  <td style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>{u.phone_number}</td>
                  <td><Badge variant={u.role} /></td>
                  <td>
                    {u.role === "Technician" ? (
                      <span className="badge badge-technician">
                        {u._count.tickets_technician} active
                      </span>
                    ) : "—"}
                  </td>
                  <td style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
                    {new Date(u.created_at).toLocaleDateString("id-ID")}
                  </td>
                  <td>
                    <Link href={`/admin/users/${u.id}`} className="btn btn-secondary btn-sm">Edit</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile card list */}
      <div className="admin-ticket-cards">
        {users.map((u) => (
          <Link key={u.id} href={`/admin/users/${u.id}`} style={{ textDecoration: "none" }}>
            <div className="mobile-ticket-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{u.name}</span>
                <Badge variant={u.role} />
              </div>
              <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>{u.email}</div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem" }}>
                <span style={{ color: "var(--text-secondary)" }}>{u.phone_number}</span>
                {u.role === "Technician" && (
                  <span className="badge badge-technician text-xs">
                    {u._count.tickets_technician} active
                  </span>
                )}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                Joined {new Date(u.created_at).toLocaleDateString("id-ID")}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
