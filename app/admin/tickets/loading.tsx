import { PageSkeleton } from "@/components/app/PageSkeleton";

export default function TicketListLoading() {
  return <PageSkeleton variant="list" stats={4} columns={7} />;
}
