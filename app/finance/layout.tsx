import { requireRole } from "@/lib/session";
import DashboardShell from "@/components/layout/DashboardShell";

export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("Finance", "Administrator");

  // An administrator opens these pages from their own sidebar and keeps it
  // here — the rule /rma, /toko and /stok follow.
  const shellRole = session.role === "Administrator" ? "admin" : "finance";

  return (
    <DashboardShell role={shellRole} userName={session.name} userId={session.userId} isCoordinator={false}>
      {children}
    </DashboardShell>
  );
}
