import { requireRole } from "@/lib/session";
import { db } from "@/lib/db";
import DashboardShell from "@/components/layout/DashboardShell";

export default async function TechnicianLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("Technician");

  // Fetch is_team_leader to show RequestsBell for coordinators
  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { is_team_leader: true },
  });

  return (
    <DashboardShell
      role="technician"
      userName={session.name}
      userId={session.userId}
      isCoordinator={user?.is_team_leader ?? false}
    >
      {children}
    </DashboardShell>
  );
}
