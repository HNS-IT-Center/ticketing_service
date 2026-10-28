import { PageSkeleton } from "@/components/app/PageSkeleton";

export default function Loading() {
  return <PageSkeleton variant="report" stats={3} columns={4} />;
}
