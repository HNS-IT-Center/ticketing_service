import { redirect } from "next/navigation";
import { requirePage } from "@/lib/page-access";
import { requireRole } from "@/lib/session";

/** The "Coba form baru" address from the announcement; the form now lives at /technician/tickets/create. */
export default async function Page() {
  await requireRole("Technician", "Sales", "Administrator");
  await requirePage("page_create_ticket");
  redirect("/technician/tickets/create");
}
