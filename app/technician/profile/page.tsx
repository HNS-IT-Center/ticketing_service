import { requireRole } from "@/lib/session";
import { User, Wrench, CheckCircle, XCircle, Trophy, Package } from "lucide-react";
import ProfileForm from "@/components/ui/ProfileForm";
import ChangePasswordForm from "@/components/ui/ChangePasswordForm";
import { updateTechnicianProfileAction, equipTitleAction } from "@/app/actions/profile";
import { awardMonthlyTitles, getUserTitles, getTechnicianProfile } from "@/lib/performance";
import { EmptyState } from "@/components/app/EmptyState";
import { PageHeader } from "@/components/app/PageHeader";
import { StatCard } from "@/components/app/StatCard";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

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

  if (!user) return <EmptyState icon={User} title="User not found." />;

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
    { label: "Tickets Handled", value: totalHandled, icon: Wrench, tone: "default" as const },
    { label: "Completed",       value: totalSuccess, icon: CheckCircle, tone: "success" as const },
    // Was var(--accent), which since the shadcn init is a near-white hover
    // fill — the number was almost invisible. Red, as it was meant to be.
    { label: "Cancelled",       value: totalFail,    icon: XCircle, tone: "attention" as const },
    { label: "Total Points",    value: totalPoints,  icon: User, tone: "default" as const },
  ];

  const activeTitle = titles.find((t) => t.title_key === user.active_title) ?? null;
  const levelPercent = Math.min((levelInfo.progress / levelInfo.required) * 100, 100);

  return (
    // Built from components/app and shadcn only (ProfileForm and
    // ChangePasswordForm moved over in UI-4a), so the page opts into Tailwind
    // spacing with a data-slot (the UI-1 reset rule).
    <div data-slot="technician-profile" className="flex w-full max-w-2xl flex-col gap-6">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <User aria-hidden="true" className="size-6" /> My Profile
          </span>
        }
        description="Manage your account information"
      />

      {/* ── Achievement Inventory ─────────────────────────────────────────── */}
      <Card className="md:[--card-spacing:--spacing(6)]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg font-bold text-orange-700">
            <Package aria-hidden="true" className="size-5" /> Achievement Inventory
          </CardTitle>
          {titles.length > 0 && (
            <CardAction>
              <span className="rounded-full bg-tone-amber-bg px-2 py-1 text-xs font-semibold text-tone-amber-fg">
                {titles.length} title{titles.length !== 1 ? "s" : ""} earned
              </span>
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
          {titles.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
              <Trophy aria-hidden="true" className="size-10 opacity-20" />
              <p className="font-medium">No titles yet. Keep going! 💪</p>
              <p className="text-sm">Be the top technician or coordinator of the month to earn your first title.</p>
            </div>
          ) : (
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
              {titles.map((title) => {
                const isEquipped  = user.active_title === title.title_key;
                const isCoord     = title.title_type === "coordinator";
                const month       = getMonthFromKey(title.title_key);
                const mc          = MONTH_COLORS[month] ?? MONTH_COLORS[1];

                return (
                  <li
                    key={title.title_key}
                    className={cn(
                      "relative flex flex-col gap-2 rounded-lg border-2 px-4 py-5 transition-all",
                      !isEquipped && "border-border bg-card",
                      isEquipped && isCoord && "border-violet-600 bg-violet-600/[0.06] shadow-[0_0_16px_rgba(124,58,237,0.35)]",
                      isEquipped && !isCoord && "border-amber-500 bg-amber-500/[0.06] shadow-[0_0_16px_rgba(245,158,11,0.35)]",
                    )}
                  >
                    {isEquipped && (
                      <div
                        className={cn(
                          "absolute -top-px -right-px rounded-tr-lg rounded-bl-lg px-2 py-0.5 text-[0.6rem] font-bold text-white",
                          isCoord ? "bg-violet-600" : "bg-amber-600",
                        )}
                      >
                        ✓ EQUIPPED
                      </div>
                    )}

                    <div className="text-[2rem] leading-none">{title.emoji}</div>

                    <div>
                      <div className="text-[0.9rem] leading-snug font-bold text-foreground">{title.title_label}</div>
                      <div className="mt-1 text-[0.7rem] text-muted-foreground">
                        Awarded {new Date(title.awarded_at).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
                      </div>
                    </div>

                    {/* Month color badge */}
                    <div
                      className="inline-block w-fit rounded-full px-2.5 py-0.5 text-[0.65rem] font-bold tracking-wide"
                      style={{ background: mc.bg, color: mc.text }}
                    >
                      {isCoord ? "🛡️" : "🏆"} #1 {MONTHS[month - 1].slice(0, 3)} {title.title_key.split("_")[1]}
                    </div>

                    {/* Equip / Unequip button */}
                    <form action={async () => {
                      "use server";
                      await equipTitleAction(isEquipped ? null : title.title_key);
                    }}>
                      <Button
                        type="submit"
                        size="sm"
                        variant={isEquipped ? "outline" : "default"}
                        className={cn("mt-1 w-full", isCoord && !isEquipped && "bg-violet-600 text-white hover:bg-violet-600/90")}
                      >
                        {isEquipped ? "Unequip" : "Equip →"}
                      </Button>
                    </form>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {statCards.map((s) => (
          <StatCard key={s.label} label={s.label} value={s.value} icon={s.icon} tone={s.tone} />
        ))}
      </div>

      {/* Active tickets */}
      <Card>
        <CardContent className="flex items-center justify-between">
          <span className="text-[0.9rem] font-semibold">Active Tickets</span>
          <span className="text-[1.1rem] font-bold text-primary">{activeTicketsCount}</span>
        </CardContent>
      </Card>

      {/* Leveling bar */}
      <Card>
        <CardContent className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-[1.1rem] font-bold text-primary">
              <Trophy aria-hidden="true" className="size-[18px]" /> Level {levelInfo.level}
            </span>
            <span className="text-sm font-medium text-muted-foreground">
              {levelInfo.progress} / {levelInfo.required} Tickets to next level
            </span>
          </div>
          <div
            role="progressbar"
            aria-label={`Level ${levelInfo.level} progress`}
            aria-valuenow={levelInfo.progress}
            aria-valuemax={levelInfo.required}
            className="h-3 overflow-hidden rounded-full bg-muted"
          >
            <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${levelPercent}%` }} />
          </div>
        </CardContent>
      </Card>

      {/* Avatar + info card */}
      <Card>
        <CardContent className="flex items-center gap-4">
          <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground">
            {user.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <div className="text-lg font-bold text-foreground">{user.name}</div>
            <div className="text-sm text-muted-foreground">
              {user.is_team_leader ? "Store Coordinator" : "Technician"}
              {user.shift ? ` · ${user.shift.charAt(0).toUpperCase() + user.shift.slice(1)} Shift` : ""}
            </div>
            {/* Active title badge */}
            {activeTitle && (() => {
              const month = getMonthFromKey(activeTitle.title_key);
              const mc = MONTH_COLORS[month] ?? MONTH_COLORS[1];
              return (
                <div
                  className="inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-0.5 text-[0.7rem] font-bold"
                  style={{ background: mc.bg, color: mc.text }}
                >
                  {activeTitle.emoji} {activeTitle.title_label}
                </div>
              );
            })()}
            <div className="text-xs text-muted-foreground">
              Member since {new Date(user.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Editable form */}
      <ProfileForm
        userId={user.id}
        initialName={user.name}
        initialPhone={user.phone_number ?? ""}
        initialAddress={user.address ?? ""}
        updateAction={updateTechnicianProfileAction}
      />

      {/* Change password */}
      <ChangePasswordForm hasPassword={!!user.password} />
    </div>
  );
}
