import { requireRole } from "@/lib/session";
import { db } from "@/lib/db";
import { User, Ticket, Users, Shield } from "lucide-react";
import ProfileForm from "@/components/ui/ProfileForm";
import ChangePasswordForm from "@/components/ui/ChangePasswordForm";
import { updateAdminProfileAction } from "@/app/actions/profile";

export const metadata = { title: "My Profile — HNS IT Center" };

export default async function AdminProfilePage() {
  const session = await requireRole("Administrator");

  const [user, totalTickets, totalUsers] = await Promise.all([
    db.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone_number: true,
        address: true,
        created_at: true,
        password: true,
      },
    }),
    db.ticket.count(),
    db.user.count({ where: { role: { not: "Administrator" } } }),
  ]);

  if (!user) return <div className="empty-state">User not found.</div>;

  const statCards = [
    { label: "Total Tickets", value: totalTickets, icon: <Ticket size={20} />, color: "var(--primary)" },
    { label: "Total Users", value: totalUsers, icon: <Users size={20} />, color: "#7c3aed" },
  ];

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-800">
          <Shield size={24} />
          Admin Profile
        </h1>
        <p className="text-sm text-gray-500 mt-1">Manage your administrator account</p>
      </div>

      {/* Stats */}
      <div className="customer-stats-grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
        {statCards.map((s) => (
          <div key={s.label} className="stat-card">
            <div className="stat-card-icon" style={{ background: `${s.color}18`, color: s.color }}>
              {s.icon}
            </div>
            <div className="stat-card-body">
              <div className="stat-card-value" style={{ color: s.color }}>{s.value}</div>
              <div className="stat-card-label">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Avatar + info */}
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
          <div className="text-sm text-gray-500">Administrator</div>
          <div className="text-xs text-gray-400 mt-1">
            Member since {new Date(user.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
          </div>
        </div>
      </div>

      {/* Editable form */}
      <ProfileForm
        userId={user.id}
        initialName={user.name}
        initialPhone={user.phone_number ?? ""}
        initialAddress={user.address ?? ""}
        updateAction={updateAdminProfileAction}
      />

      {/* Change password */}
      <ChangePasswordForm hasPassword={!!user.password} />
    </div>
  );
}
