import { requireRole } from "@/lib/session";
import VendorDirectory from "@/components/vendors/VendorDirectory";

export const metadata = { title: "Daftar Vendor — HNS IT Center" };

export default async function VendorsPage() {
  await requireRole("Administrator");
  return <VendorDirectory canManage />;
}
