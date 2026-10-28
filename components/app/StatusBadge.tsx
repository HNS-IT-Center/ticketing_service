import type { TicketBadgeChoice } from "@/lib/rma/ticket-status-badge";
import { rmaStatusDisplay, ticketStatusDisplay, TONE_CLASSES, type TicketStatusContext } from "@/lib/status-display";
import { cn } from "@/lib/utils";

type StatusBadgeProps = TicketBadgeChoice &
  TicketStatusContext & {
    size?: "sm" | "md";
    className?: string;
  };

/**
 * The one badge for a ticket or RMA status, on every portal.
 *
 * Takes the same `{ kind, status }` shape `ticketBadgeChoice()` returns, so a
 * list showing a warranty claim at `rma_process` can pass the choice straight
 * through and get the case's own status.
 *
 * Label and colour come from `lib/status-display.ts` and nowhere else. The
 * colour is never the only signal: the label always says the status in words.
 */
export function StatusBadge({ kind, status, hasTechnician, paused, size = "md", className }: StatusBadgeProps) {
  const { label, tone } =
    kind === "rma" ? rmaStatusDisplay(status) : ticketStatusDisplay(status, { hasTechnician, paused });

  return (
    <span
      data-slot="status-badge"
      data-status={status}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border font-semibold whitespace-nowrap",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs md:text-[0.8125rem]",
        TONE_CLASSES[tone],
        className,
      )}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}
