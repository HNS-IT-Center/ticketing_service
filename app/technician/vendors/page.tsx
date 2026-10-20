import { requireRole } from "@/lib/session";
import { accessFor } from "@/lib/access-server";
import VendorDirectory from "@/components/vendors/VendorDirectory";

export const metadata = { title: "Daftar Vendor — HNS IT Center" };

/**
 * Head technicians and coordinators hold manage_vendors by default, and until
 * now had no page to use it on. Anyone else in the portal reads the list.
 */
export default async function TechnicianVendorsPage() {
  const session = await requireRole("Technician");
  const canManage = (await accessFor(session.userId)).can("manage_vendors");
  return <VendorDirectory canManage={canManage} />;
}
