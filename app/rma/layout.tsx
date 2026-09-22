import { requireRole } from "@/lib/session";
import DashboardShell from "@/components/layout/DashboardShell";

export default async function RmaLayout({ children }: { children: React.ReactNode }) {
  // Administrators can do everything the RMA desk can — see lib/rma/state-machine.ts.
  const session = await requireRole("RMA", "Administrator");

  return (
    <DashboardShell role="rma" userName={session.name} userId={session.userId} isCoordinator={false}>
      {children}
    </DashboardShell>
  );
}
