import { PageSkeleton } from "@/components/app/PageSkeleton";

export default function DashboardLoading() {
  return <PageSkeleton variant="dashboard" stats={4} columns={5} />;
}
