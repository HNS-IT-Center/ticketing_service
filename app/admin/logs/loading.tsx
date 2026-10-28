import { PageSkeleton } from "@/components/app/PageSkeleton";

export default function Loading() {
  return <PageSkeleton variant="list" stats={4} columns={5} />;
}
