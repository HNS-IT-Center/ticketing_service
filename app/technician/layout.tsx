import { requireRole } from "@/lib/session";
import DashboardShell from "@/components/layout/DashboardShell";

export default async function TechnicianLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("Technician");
  return (
    <DashboardShell role="technician" userName={session.name} userId={session.userId}>
      {children}
    </DashboardShell>
  );
}
