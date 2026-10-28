import { PageSkeleton } from "@/components/app/PageSkeleton";

export default function PerformanceLoading() {
  return <PageSkeleton variant="report" stats={4} columns={6} />;
}
