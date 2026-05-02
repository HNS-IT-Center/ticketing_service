import { requireRole } from "@/lib/session";
import DashboardShell from "@/components/layout/DashboardShell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("Administrator");
  return (
    <DashboardShell role="admin" userName={session.name} userId={session.userId}>
      {children}
    </DashboardShell>
  );
}
