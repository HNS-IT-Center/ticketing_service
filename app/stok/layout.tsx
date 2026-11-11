import { requireRole } from "@/lib/session";
import DashboardShell from "@/components/layout/DashboardShell";

export default async function StokLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("StockAdmin", "Administrator");

  // An administrator opens these pages from their own sidebar and keeps it
  // here — the rule /rma and /toko follow.
  const shellRole = session.role === "Administrator" ? "admin" : "stok";

  return (
    <DashboardShell role={shellRole} userName={session.name} userId={session.userId} isCoordinator={false}>
      {children}
    </DashboardShell>
  );
}
