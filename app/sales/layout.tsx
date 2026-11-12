import { requireRole } from "@/lib/session";
import AppShell from "@/components/layout/AppShell";

/** A sales person's own tickets. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("Sales", "Administrator");
  return <AppShell session={session}>{children}</AppShell>;
}
