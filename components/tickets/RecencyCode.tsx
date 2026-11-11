import { relativeTimeId, ticketRecency } from "@/lib/ticket-recency";

/**
 * The ticket code, with a mark when it was created or its status moved in the
 * last 24 hours — what the list now sorts by, so the marked rows sit on top.
 */
export default function RecencyCode({
  ticket,
  now,
}: {
  ticket: { ticket_code: string; created_at: Date; updated_at: Date; status_logs: { created_at: Date }[] };
  now: Date;
}) {
  const recency = ticketRecency({ ...ticket, last_status_at: ticket.status_logs[0]?.created_at ?? null }, now);
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1.5">
      <span title={ticket.ticket_code} className="block max-w-32 truncate font-mono">
        {ticket.ticket_code}
      </span>
      {recency && (
        <span
          title={`${recency.kind === "new" ? "Dibuat" : "Status diperbarui"} ${relativeTimeId(recency.at, now)}`}
          className={
            recency.kind === "new"
              ? "rounded-full border border-tone-green-border bg-tone-green-bg px-1.5 py-px font-sans text-[0.65rem] font-bold tracking-wide text-tone-green-fg uppercase"
              : "rounded-full border border-tone-blue-border bg-tone-blue-bg px-1.5 py-px font-sans text-[0.65rem] font-bold tracking-wide text-tone-blue-fg uppercase"
          }
        >
          <span aria-hidden="true">● </span>
          {recency.kind === "new" ? "Baru" : "Update"}
        </span>
      )}
    </span>
  );
}
