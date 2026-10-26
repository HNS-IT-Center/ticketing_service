import { requireRole } from "@/lib/session";
import ServiceJobDirectory from "@/components/service-jobs/ServiceJobDirectory";

export const metadata = { title: "Daftar Jasa — HNS IT Center" };

export default async function ServiceJobsPage() {
  await requireRole("Administrator");
  return <ServiceJobDirectory canManage />;
}
