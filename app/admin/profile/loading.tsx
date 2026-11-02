import { PageSkeleton } from "@/components/app/PageSkeleton";

export default function Loading() {
  return <PageSkeleton variant="form" stats={4} columns={5} />;
}
