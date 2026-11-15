import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";

/** The "Coba form baru" address from the announcement; the form now lives at /admin/tickets/create. */
export default async function Page() {
  await requireRole("Administrator");
  redirect("/admin/tickets/create");
}
