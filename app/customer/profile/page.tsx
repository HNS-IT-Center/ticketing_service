import { requireRole } from "@/lib/session";
import { db } from "@/lib/db";
import CustomerProfileForm from "./CustomerProfileForm";
import { User } from "lucide-react";

export const metadata = { title: "My Profile — HNS IT Center" };

export default async function CustomerProfilePage() {
  const session = await requireRole("Customer");

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      name: true,
      email: true,
      phone_number: true,
      address: true,
      created_at: true,
    },
  });

  if (!user) return <div className="empty-state">User not found.</div>;

  // Stats
  const stats = await db.ticket.groupBy({
    by: ["status"],
    where: { user_id: session.userId },
    _count: { id: true },
  });
  const totalTickets   = stats.reduce((s, r) => s + r._count.id, 0);
  const doneTickets    = stats.find((r) => r.status === "done")?._count.id ?? 0;
  const activeTickets  = stats.find((r) => r.status === "on_progress")?._count.id ?? 0;

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-800">
          <User size={24} />
          My Profile
        </h1>
        <p className="text-sm text-gray-500 mt-1">Manage your account information</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Tickets", value: totalTickets, color: "var(--primary)" },
          { label: "Completed",     value: doneTickets,  color: "#16a34a" },
          { label: "In Progress",   value: activeTickets, color: "#2563eb" },
        ].map((s) => (
          <div key={s.label} className="card text-center">
            <div style={{ fontSize: "1.75rem", fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginTop: "0.125rem" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Avatar + Join date */}
      <div className="card flex items-center gap-4">
        <div style={{
          width: "4rem", height: "4rem", borderRadius: "50%",
          background: "var(--primary)", color: "white",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "1.5rem", fontWeight: 700, flexShrink: 0,
        }}>
          {user.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
        </div>
        <div>
          <div className="text-lg font-bold text-gray-800">{user.name}</div>
          <div className="text-sm text-gray-500">Customer</div>
          <div className="text-xs text-gray-400 mt-1">
            Member since {new Date(user.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
          </div>
        </div>
      </div>

      {/* Editable form */}
      <CustomerProfileForm
        userId={user.id}
        initialName={user.name}
        initialPhone={user.phone_number ?? ""}
        initialAddress={user.address ?? ""}
      />
    </div>
  );
}
