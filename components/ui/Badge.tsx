import type { Role, TicketStatus } from "@prisma/client";
import { roleDisplay, ticketStatusDisplay, TONE_CLASSES, type StatusDisplay } from "@/lib/status-display";
import { cn } from "@/lib/utils";

/**
 * The legacy badge, kept as an adapter.
 *
 * Pages that are not migrated yet still render `<Badge variant=… />`. Rather
 * than keep the old `.badge-*` CSS and its emoji labels alive for them, this
 * now draws the same thing StatusBadge and RoleBadge draw — same words, same
 * tones, from lib/status-display.ts — so every page agrees while the callers
 * move over one by one. Same props as before; delete once nothing imports it.
 */

const ROLES: readonly string[] = ["Administrator", "Technician", "Sales", "Customer", "RMA", "Pending"];
const TICKET_STATUSES: readonly string[] = [
  "waiting",
  "on_progress",
  "rma_process",
  "done",
  "ready_for_pickup",
  "waiting_pickup",
  "handed_to_courier",
  "delivered",
  "completed",
  "cancelled",
  "rejected",
];

export default function Badge({
  variant,
  label,
  technicianId,
  isPaused,
}: {
  variant: string;
  label?: string;
  technicianId?: string | null;
  isPaused?: boolean;
}) {
  let display: StatusDisplay;
  if (ROLES.includes(variant)) {
    display = roleDisplay(variant as Role);
  } else if (TICKET_STATUSES.includes(variant)) {
    // As before: a waiting ticket says whether someone holds it, and a running
    // one can read "Paused".
    display = ticketStatusDisplay(variant as TicketStatus, {
      hasTechnician: Boolean(technicianId),
      paused: isPaused,
    });
  } else {
    display = { label: variant.replace(/_/g, " "), tone: "gray" };
  }

  return (
    <span
      data-slot="status-badge"
      data-status={variant}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold whitespace-nowrap",
        TONE_CLASSES[display.tone],
      )}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {label ?? display.label}
    </span>
  );
}
