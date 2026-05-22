import { requireRole } from "@/lib/session";
import { db } from "@/lib/db";
import { User, Wrench, CheckCircle, XCircle, Trophy } from "lucide-react";
import ProfileForm from "@/components/ui/ProfileForm";
import { updateTechnicianProfileAction } from "@/app/actions/profile";
import { getTopTechnicianOfMonth } from "@/lib/performance";

export const metadata = { title: "My Profile — HNS IT Center" };

export default async function TechnicianProfilePage() {
  const session = await requireRole("Technician");

  const [user, performance, workload] = await Promise.all([
    db.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone_number: true,
        address: true,
        created_at: true,
        shift: true,
      },
    }),
    db.technicianPerformance.findUnique({
      where: { technician_id: session.userId },
    }),
    db.technicianWorkload.findUnique({
      where: { technician_id: session.userId },
    }),
  ]);

  if (!user) return <div className="empty-state">User not found.</div>;

  const totalHandled  = performance?.tickets_handled ?? 0;
  const totalSuccess  = performance?.success_count ?? 0;
  const totalFail     = performance?.failed_count ?? 0;
  const totalPoints   = performance?.total_points_completed ?? 0;
  const currentLoad   = workload?.current_points ?? 0;
  const maxLoad       = workload?.max_points ?? 7;

  const getLevelInfo = (tickets: number) => {
    if (tickets <= 100) {
      const level = Math.floor(tickets / 10) + 1;
      const progress = tickets % 10;
      return { level, progress, required: 10 };
    } else {
      const extra = tickets - 100;
      const level = 11 + Math.floor(extra / 15);
      const progress = extra % 15;
      return { level, progress, required: 15 };
    }
  };

  const levelInfo = getLevelInfo(totalHandled);

  const statCards = [
    { label: "Tickets Handled", value: totalHandled, icon: <Wrench size={20} />, color: "var(--primary)" },
    { label: "Completed", value: totalSuccess, icon: <CheckCircle size={20} />, color: "#16a34a" },
    { label: "Cancelled", value: totalFail, icon: <XCircle size={20} />, color: "var(--accent)" },
    { label: "Total Points", value: totalPoints, icon: <User size={20} />, color: "#7c3aed" },
  ];

  const now = new Date();
  const lastMonth = now.getMonth() === 0 ? 12 : now.getMonth();
  const lastMonthYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const topTechLastMonth = await getTopTechnicianOfMonth(lastMonth, lastMonthYear);
  const isTopTechLastMonth = topTechLastMonth === session.userId;

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

      {/* Achievements row */}
      {isTopTechLastMonth && (
        <div className="card" style={{ background: "linear-gradient(135deg, #fff7ed, #ffedd5)", border: "1px solid #fed7aa" }}>
          <h2 style={{ fontSize: "1.1rem", color: "#c2410c", display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <Trophy size={20} />
            Achievements
          </h2>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <div style={{ fontSize: "2.5rem" }}>🏆</div>
            <div>
              <div style={{ fontWeight: 800, color: "#9a3412" }}>Technician of the Month</div>
              <div style={{ fontSize: "0.85rem", color: "#c2410c", marginTop: "0.1rem" }}>
                Awarded for outstanding performance in {new Date(lastMonthYear, lastMonth - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="customer-stats-grid">
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

      {/* Current workload bar */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
          <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>Current Workload</span>
          <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>{currentLoad} / {maxLoad} pts</span>
        </div>
        <div className="workload-bar">
          <div
            className={`workload-fill${currentLoad >= maxLoad ? " danger" : ""}`}
            style={{ width: `${Math.min((currentLoad / maxLoad) * 100, 100)}%` }}
          />
        </div>
      </div>

      {/* Technician Leveling bar */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem", alignItems: "center" }}>
          <span style={{ fontWeight: 700, fontSize: "1.1rem", color: "var(--primary)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Trophy size={18} />
            Level {levelInfo.level}
          </span>
          <span style={{ fontSize: "0.875rem", color: "var(--text-muted)", fontWeight: 500 }}>
            {levelInfo.progress} / {levelInfo.required} Tickets to next level
          </span>
        </div>
        <div className="workload-bar" style={{ height: "12px", background: "var(--cream-dark)" }}>
          <div
            className="workload-fill"
            style={{ width: `${Math.min((levelInfo.progress / levelInfo.required) * 100, 100)}%`, background: "var(--primary)" }}
          />
        </div>
      </div>

      {/* Avatar + info card */}
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
          <div className="text-sm text-gray-500">
            Technician · {user.shift ? `${user.shift.charAt(0).toUpperCase() + user.shift.slice(1)} Shift` : ""}
          </div>
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
        updateAction={updateTechnicianProfileAction}
      />
    </div>
  );
}
