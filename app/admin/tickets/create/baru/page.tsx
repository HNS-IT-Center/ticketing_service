import { requireRole } from "@/lib/session";
import QuickCreate from "@/app/technician/tickets/create/baru/QuickCreate";

export const metadata = { title: "Buat Tiket (form baru) — HNS IT Center" };

/** The one-page form, opened from the "Coba form baru" button; the wizard at /admin/tickets/create stays. */
export default async function Page() {
  const session = await requireRole("Administrator");
  return <QuickCreate userId={session.userId} oldFormHref="/admin/tickets/create" />;
}
