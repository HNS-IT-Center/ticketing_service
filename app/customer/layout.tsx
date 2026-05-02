import { requireRole } from "@/lib/session";
import DashboardShell from "@/components/layout/DashboardShell";

export default async function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole("Customer", "Sales");
  return (
    <DashboardShell role="customer" userName={session.name} userId={session.userId}>
      {children}
    </DashboardShell>
  );
}
