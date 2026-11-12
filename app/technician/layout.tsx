import { requireRole } from "@/lib/session";
import AppShell from "@/components/layout/AppShell";

/** A technician's own work; the menu is built from their access settings. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("Technician");
  return <AppShell session={session}>{children}</AppShell>;
}
