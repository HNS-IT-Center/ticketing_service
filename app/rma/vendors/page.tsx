import { requirePage } from "@/lib/page-access";
import { urlSort } from "@/lib/table-sort";
import { accessFor } from "@/lib/access-server";
import VendorDirectory from "@/components/vendors/VendorDirectory";

export const metadata = { title: "Daftar Vendor — RMA" };

/**
 * The same list the admin sees. The desk is who knows which distributor takes
 * which brand's claims, so a new vendor added here starts as a claim vendor.
 */
export default async function RmaVendorsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await requirePage("manage_vendors");
  const canManage = (await accessFor(session.userId)).can("manage_vendors");
  return <VendorDirectory sort={urlSort("/rma/vendors", await searchParams)} canManage={canManage} defaultRoles={{ handles_claims: true }} />;
}
