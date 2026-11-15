import { requirePage } from "@/lib/page-access";
import { requireRole } from "@/lib/session";
import QuickCreate from "./baru/QuickCreate";

export const metadata = { title: "Buat Tiket — HNS IT Center" };

/** The one-page form is the default; the wizard stays at /technician/tickets/create/lama. */
export default async function TechnicianCreateTicketPage() {
  const session = await requireRole("Technician", "Sales", "Administrator");
  await requirePage("page_create_ticket");
  return <QuickCreate userId={session.userId} oldFormHref="/technician/tickets/create/lama" />;
}
