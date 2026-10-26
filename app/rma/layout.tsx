import { requireRole } from "@/lib/session";
import DashboardShell from "@/components/layout/DashboardShell";

export default async function RmaLayout({ children }: { children: React.ReactNode }) {
  // Administrators can do everything the RMA desk can — see lib/rma/state-machine.ts.
  const session = await requireRole("RMA", "Administrator");

  // An administrator opens these pages from the "Klaim & RMA" group of their
  // own sidebar, so they keep that sidebar here rather than being moved into
  // the desk's portal and losing the way back.
  const shellRole = session.role === "Administrator" ? "admin" : "rma";

  return (
    <DashboardShell role={shellRole} userName={session.name} userId={session.userId} isCoordinator={false}>
      {children}
    </DashboardShell>
  );
}
