import { requireRole } from "@/lib/session";
import { db } from "@/lib/db";
import { accessFor } from "@/lib/access-server";
import DashboardShell from "@/components/layout/DashboardShell";

export default async function TechnicianLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("Technician");

  // Fetch is_team_leader to show RequestsBell for coordinators
  const [user, access] = await Promise.all([
    db.user.findUnique({
      where: { id: session.userId },
      select: { is_team_leader: true },
    }),
    accessFor(session.userId),
  ]);

  return (
    <DashboardShell
      role="technician"
      userName={session.name}
      userId={session.userId}
      isCoordinator={user?.is_team_leader ?? false}
      manage={{ vendors: access.can("manage_vendors"), serviceJobs: access.can("manage_service_jobs") }}
    >
      {children}
    </DashboardShell>
  );
}
