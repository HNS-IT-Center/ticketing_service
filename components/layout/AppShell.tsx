import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { accessFor } from "@/lib/access-server";
import { navFor } from "@/lib/nav";
import { destinationForRoleName, isRole, type Portal } from "@/lib/routes";
import type { SessionPayload } from "@/lib/session";
import DashboardShell from "@/components/layout/DashboardShell";

/**
 * The frame of every staff page: one sidebar, built here from what this
 * person may open (lib/nav.ts + Pengaturan Akses). The frame follows the
 * person, not the page — an administrator on an RMA page keeps the
 * administrator's menu, and so does anyone granted a page in another portal.
 */
export default async function AppShell({ session, children }: { session: SessionPayload; children: React.ReactNode }) {
  const destination = destinationForRoleName(session.role);
  const [user, access] = await Promise.all([
    db.user.findUnique({ where: { id: session.userId }, select: { is_team_leader: true } }),
    accessFor(session.userId),
  ]);
  const role = session.role as Role;
  const sections = isRole(session.role) ? navFor(role, access.can) : [];
  const portal: Portal = destination.allowed ? destination.portal : "admin";

  return (
    <DashboardShell
      role={portal}
      userName={session.name}
      userId={session.userId}
      isCoordinator={role === "Technician" && Boolean(user?.is_team_leader)}
      sections={sections}
      home={destination.allowed ? destination.dashboard : "/"}
    >
      {children}
    </DashboardShell>
  );
}
