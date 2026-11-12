import { requireRole } from "@/lib/session";
import { urlSort } from "@/lib/table-sort";
import { accessFor } from "@/lib/access-server";
import ServiceJobDirectory from "@/components/service-jobs/ServiceJobDirectory";

export const metadata = { title: "Daftar Jasa — HNS IT Center" };

/** Head technicians and coordinators manage it from here; anyone else reads it. */
export default async function TechnicianServiceJobsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await requireRole("Technician");
  const canManage = (await accessFor(session.userId)).can("manage_service_jobs");
  return <ServiceJobDirectory sort={urlSort("/technician/service-jobs", await searchParams)} canManage={canManage} />;
}
