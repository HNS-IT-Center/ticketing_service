import { requireRole } from "@/lib/session";
import DashboardShell from "@/components/layout/DashboardShell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Both Administrator and Sales (CS) can access admin routes
  const session = await requireRole("Administrator", "Sales");
  const role = session.role === "Sales" ? "sales" : "admin";
  return (
    <DashboardShell role={role as "admin" | "sales"} userName={session.name} userId={session.userId}>
      {children}
    </DashboardShell>
  );
}
