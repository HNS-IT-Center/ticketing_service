import { requireRole } from "@/lib/session";
import AppShell from "@/components/layout/AppShell";

/** A kepala toko's stores; an administrator sees every store. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("StoreSupervisor", "Administrator");
  return <AppShell session={session}>{children}</AppShell>;
}
