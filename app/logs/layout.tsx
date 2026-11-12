import { requireStaff } from "@/lib/page-access";
import AppShell from "@/components/layout/AppShell";

/** Any staff member; each page checks its own capability (Pengaturan Akses → Halaman & Menu). */
export default async function Layout({ children }: { children: React.ReactNode }) {
  const session = await requireStaff();
  return <AppShell session={session}>{children}</AppShell>;
}
