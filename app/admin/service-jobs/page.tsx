import { requirePage } from "@/lib/page-access";
import { urlSort } from "@/lib/table-sort";
import ServiceJobDirectory from "@/components/service-jobs/ServiceJobDirectory";

export const metadata = { title: "Daftar Jasa — HNS IT Center" };

export default async function ServiceJobsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePage("manage_service_jobs");
  return <ServiceJobDirectory sort={urlSort("/admin/service-jobs", await searchParams)} canManage />;
}
