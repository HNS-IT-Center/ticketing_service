import { requireRole } from "@/lib/session";
import QuickCreate from "@/app/technician/tickets/create/baru/QuickCreate";

export const metadata = { title: "Buat Tiket — HNS IT Center" };

/** The one-page form is the default; the wizard stays at /admin/tickets/create/lama. */
export default async function AdminCreateTicketPage() {
  const session = await requireRole("Administrator");
  return <QuickCreate userId={session.userId} oldFormHref="/admin/tickets/create/lama" />;
}
