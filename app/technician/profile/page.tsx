import { requireRole } from "@/lib/session";
import { User, Wrench, CheckCircle, XCircle, Trophy, ShieldCheck, Package } from "lucide-react";
import ProfileForm from "@/components/ui/ProfileForm";
import ChangePasswordForm from "@/components/ui/ChangePasswordForm";
import { updateTechnicianProfileAction, equipTitleAction } from "@/app/actions/profile";
import { awardMonthlyTitles, getUserTitles, getTechnicianProfile } from "@/lib/performance";

export const metadata = { title: "My Profile — HNS IT Center" };

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

// Month-based badge colors (bg, text) — always readable contrast
const MONTH_COLORS: Record<number, { bg: string; text: string }> = {
  1:  { bg: "#dbeafe", text: "#1e40af" },
  2:  { bg: "#fce7f3", text: "#9d174d" },
  3:  { bg: "#d1fae5", text: "#065f46" },
  4:  { bg: "#bbf7d0", text: "#14532d" },
  5:  { bg: "#fef9c3", text: "#713f12" },
  6:  { bg: "#fed7aa", text: "#7c2d12" },
  7:  { bg: "#fecaca", text: "#991b1b" },
  8:  { bg: "#ffedd5", text: "#7c2d12" },
  9:  { bg: "#e0e7ff", text: "#3730a3" },
  10: { bg: "#fef3c7", text: "#78350f" },
  11: { bg: "#f3e8ff", text: "#6b21a8" },
  12: { bg: "#fee2e2", text: "#991b1b" },
};

function getMonthFromKey(titleKey: string): number {
  // e.g. "technician_2026_04" → 4
  const parts = titleKey.split("_");
  return parseInt(parts[parts.length - 1]);
}

export default async function TechnicianProfilePage() {
  const session = await requireRole("Technician");

  // 1. Fetch cached profile data
  const [user, performance, activeTicketsCount] = await getTechnicianProfile(session.userId);

  if (!user) return <div className="empty-state">User not found.</div>;

  // 2. Lazily award last month's title if earned (no-op if already awarded or not eligible)
  await awardMonthlyTitles(session.userId, user.is_team_leader);

  // 3. Fetch title inventory (cached)
  const titles = await getUserTitles(session.userId);

  const totalHandled = performance?.tickets_handled ?? 0;
  const totalSuccess = performance?.success_count ?? 0;
  const totalFail    = performance?.failed_count ?? 0;
  const totalPoints  = performance?.total_points_completed ?? 0;

  const getLevelInfo = (tickets: number) => {
    if (tickets <= 100) {
      const level = Math.floor(tickets / 10) + 1;
      return { level, progress: tickets % 10, required: 10 };
    }
    const extra = tickets - 100;
    const level = 11 + Math.floor(extra / 15);
    return { level, progress: extra % 15, required: 15 };
  };
  const levelInfo = getLevelInfo(totalSuccess);

  const statCards = [
    { label: "Tickets Handled", value: totalHandled, icon: <Wrench size={20} />, color: "var(--primary)" },
    { label: "Completed",       value: totalSuccess, icon: <CheckCircle size={20} />, color: "#16a34a" },
    { label: "Cancelled",       value: totalFail,    icon: <XCircle size={20} />, color: "var(--accent)" },
    { label: "Total Points",    value: totalPoints,  icon: <User size={20} />, color: "#7c3aed" },
  ];

  const activeTitle = titles.find((t) => t.title_key === user.active_title) ?? null;

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-800">
          <User size={24} /> My Profile
        </h1>
        <p className="text-sm text-gray-500 mt-1">Manage your account information</p>
      </div>

      {/* ── Achievement Inventory ─────────────────────────────────────────── */}
      <div className="card" style={{ padding: "1.5rem" }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="flex items-center gap-2 text-lg font-bold" style={{ color: "#c2410c" }}>
            <Package size={20} /> Achievement Inventory
          </h2>
          {titles.length > 0 && (
            <span className="text-xs font-semibold px-2 py-1 rounded-full"
              style={{ background: "#fef3c7", color: "#78350f" }}>
              {titles.length} title{titles.length !== 1 ? "s" : ""} earned
            </span>
          )}
        </div>

        {titles.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center"
            style={{ color: "var(--text-muted)" }}>
            <Trophy size={40} style={{ opacity: 0.2 }} />
            <p className="font-medium">No titles yet. Keep going! 💪</p>
            <p className="text-sm">Be the top technician or coordinator of the month to earn your first title.</p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "1rem" }}>
            {titles.map((title) => {
              const isEquipped  = user.active_title === title.title_key;
              const isCoord     = title.title_type === "coordinator";
              const month       = getMonthFromKey(title.title_key);
              const mc          = MONTH_COLORS[month] ?? MONTH_COLORS[1];
              const glowColor   = isCoord ? "rgba(124,58,237,0.35)" : "rgba(245,158,11,0.35)";
              const borderColor = isEquipped
                ? (isCoord ? "#7c3aed" : "#f59e0b")
                : "var(--border-light)";

              return (
                <div key={title.title_key}
                  style={{
                    border: `2px solid ${borderColor}`,
                    borderRadius: "var(--radius-md)",
                    padding: "1.25rem 1rem",
                    background: isEquipped
                      ? (isCoord ? "rgba(124,58,237,0.06)" : "rgba(245,158,11,0.06)")
                      : "var(--white)",
                    boxShadow: isEquipped ? `0 0 16px ${glowColor}` : "none",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                    transition: "all 0.2s",
                    position: "relative",
                  }}>
                  {isEquipped && (
                    <div style={{
                      position: "absolute", top: "-1px", right: "-1px",
                      background: isCoord ? "#7c3aed" : "#f59e0b",
                      color: "white", fontSize: "0.6rem", fontWeight: 700,
                      padding: "0.2rem 0.5rem", borderRadius: "0 var(--radius-md) 0 var(--radius-md)",
                    }}>
                      ✓ EQUIPPED
                    </div>
                  )}

                  <div style={{ fontSize: "2rem", lineHeight: 1 }}>{title.emoji}</div>

                  <div>
                    <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--text-primary)", lineHeight: 1.3 }}>
                      {title.title_label}
                    </div>
                    <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                      Awarded {new Date(title.awarded_at).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
                    </div>
                  </div>

                  {/* Month color badge */}
                  <div style={{
                    display: "inline-block", width: "fit-content",
                    padding: "0.2rem 0.6rem", borderRadius: "999px",
                    background: mc.bg, color: mc.text,
                    fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.03em",
                  }}>
                    {isCoord ? "🛡️" : "🏆"} #1 {MONTHS[month - 1].slice(0, 3)} {title.title_key.split("_")[1]}
                  </div>

                  {/* Equip / Unequip button */}
                  <form action={async () => {
                    "use server";
                    await equipTitleAction(isEquipped ? null : title.title_key);
                  }}>
                    <button type="submit"
                      className={`btn btn-sm w-full mt-1 ${isEquipped ? "btn-outline" : (isCoord ? "" : "btn-primary")}`}
                      style={isCoord && !isEquipped ? {
                        background: "#7c3aed", color: "white", border: "none"
                      } : undefined}>
                      {isEquipped ? "Unequip" : "Equip →"}
                    </button>
                  </form>
                </div>
              );
            })}
          </div>
        )}
      </div>

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

      {/* Active tickets */}
      <div className="card flex items-center justify-between">
        <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>Active Tickets</span>
        <span style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--primary)" }}>{activeTicketsCount}</span>
      </div>

      {/* Leveling bar */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem", alignItems: "center" }}>
          <span style={{ fontWeight: 700, fontSize: "1.1rem", color: "var(--primary)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Trophy size={18} /> Level {levelInfo.level}
          </span>
          <span style={{ fontSize: "0.875rem", color: "var(--text-muted)", fontWeight: 500 }}>
            {levelInfo.progress} / {levelInfo.required} Tickets to next level
          </span>
        </div>
        <div className="workload-bar" style={{ height: "12px", background: "var(--cream-dark)" }}>
          <div className="workload-fill"
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
            {user.is_team_leader ? "Store Coordinator" : "Technician"}
            {user.shift ? ` · ${user.shift.charAt(0).toUpperCase() + user.shift.slice(1)} Shift` : ""}
          </div>
          {/* Active title badge */}
          {activeTitle && (() => {
            const month = getMonthFromKey(activeTitle.title_key);
            const mc = MONTH_COLORS[month] ?? MONTH_COLORS[1];
            return (
              <div style={{
                display: "inline-flex", alignItems: "center", gap: "0.3rem",
                marginTop: "0.375rem", padding: "0.2rem 0.6rem",
                borderRadius: "999px", background: mc.bg, color: mc.text,
                fontSize: "0.7rem", fontWeight: 700,
              }}>
                {activeTitle.emoji} {activeTitle.title_label}
              </div>
            );
          })()}
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

      {/* Change password */}
      <ChangePasswordForm />
    </div>
  );
}
