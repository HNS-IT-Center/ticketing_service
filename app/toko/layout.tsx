import { requireRole } from "@/lib/session";
import DashboardShell from "@/components/layout/DashboardShell";

export default async function TokoLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("StoreSupervisor", "Administrator");

  // An administrator opens the dashboard from "Laporan" in their own sidebar,
  // so they keep that sidebar here — the same rule as /rma.
  const shellRole = session.role === "Administrator" ? "admin" : "toko";

  return (
    <DashboardShell role={shellRole} userName={session.name} userId={session.userId} isCoordinator={false}>
      {children}
    </DashboardShell>
  );
}
