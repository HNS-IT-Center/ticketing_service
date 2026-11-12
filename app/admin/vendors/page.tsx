import { requirePage } from "@/lib/page-access";
import { urlSort } from "@/lib/table-sort";
import VendorDirectory from "@/components/vendors/VendorDirectory";

export const metadata = { title: "Daftar Vendor — HNS IT Center" };

export default async function VendorsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePage("manage_vendors");
  return <VendorDirectory sort={urlSort("/admin/vendors", await searchParams)} canManage />;
}
