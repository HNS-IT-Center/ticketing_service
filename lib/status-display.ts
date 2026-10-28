import type { RmaStatus, TicketStatus } from "@prisma/client";

/**
 * How a status looks to staff: one label and one colour tone per value, for
 * both enums. `StatusBadge` (components/app) renders from here and nothing
 * else, so a status reads the same on every portal.
 *
 * Both lookups are exhaustive `switch`es ending in `const _exhaustive: never`:
 * a status added to the Prisma schema without a label fails `tsc` here rather
 * than rendering the raw enum name — the way "rma process" once reached a
 * customer's page.
 *
 * Ticket labels are the ones staff already see in `components/ui/Badge.tsx`,
 * minus the emoji. Switching them to Indonesian is the owner's call and has not
 * been made yet; RMA labels already are Indonesian and match
 * `RMA_STATUS_META` in `components/rma/RmaStatusCard.tsx` (a test holds them
 * equal until that card moves onto this module).
 *
 * The public customer page has its own wording in `lib/rma/public-status.ts`
 * and must keep it: it speaks to customers, this speaks to staff.
 */

export type StatusTone =
  | "amber"
  | "orange"
  | "blue"
  | "violet"
  | "teal"
  | "cyan"
  | "green"
  | "red"
  | "gray";

export type StatusDisplay = { label: string; tone: StatusTone };

/**
 * What else the legacy badge looked at besides the status. Pass them where the
 * page knows them, and the label matches what staff saw before:
 * `hasTechnician` splits "waiting" into "Waiting for Work" (someone holds the
 * ticket and has not started) and "Waiting for Technician" (nobody does);
 * `paused` turns a running ticket into "Paused". Left out, "waiting" is plain
 * "Waiting".
 */
export type TicketStatusContext = { hasTechnician?: boolean; paused?: boolean };

export function ticketStatusDisplay(status: TicketStatus, context: TicketStatusContext = {}): StatusDisplay {
  switch (status) {
    case "waiting":
      if (context.hasTechnician === undefined) return { label: "Waiting", tone: "amber" };
      return { label: context.hasTechnician ? "Waiting for Work" : "Waiting for Technician", tone: "amber" };
    case "on_progress":
      if (context.paused) return { label: "Paused", tone: "amber" };
      return { label: "On Progress", tone: "blue" };
    case "rma_process":
      return { label: "RMA Process", tone: "violet" };
    case "done":
      return { label: "Done", tone: "teal" };
    case "ready_for_pickup":
      return { label: "Ready Pickup", tone: "cyan" };
    case "waiting_pickup":
      return { label: "Waiting Pickup", tone: "orange" };
    case "handed_to_courier":
      return { label: "To Courier", tone: "blue" };
    case "delivered":
      return { label: "Delivered", tone: "green" };
    case "completed":
      return { label: "Completed", tone: "green" };
    case "cancelled":
      return { label: "Cancelled", tone: "gray" };
    case "rejected":
      return { label: "Rejected", tone: "red" };
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function rmaStatusDisplay(status: RmaStatus): StatusDisplay {
  switch (status) {
    case "pending_verification":
      return { label: "Menunggu Verifikasi", tone: "amber" };
    case "on_hold":
      return { label: "Ditahan", tone: "orange" };
    case "verified":
      return { label: "Terverifikasi", tone: "blue" };
    case "submitted_to_vendor":
      return { label: "Diajukan ke Vendor", tone: "blue" };
    case "in_vendor_process":
      return { label: "Diproses Vendor", tone: "violet" };
    case "vendor_decided":
      return { label: "Keputusan Vendor", tone: "blue" };
    case "unit_received":
      return { label: "Unit Diterima", tone: "teal" };
    case "closed":
      return { label: "Selesai", tone: "green" };
    case "ineligible":
      return { label: "Tidak Layak Klaim", tone: "amber" };
    case "cancelled":
      return { label: "Dibatalkan", tone: "red" };
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

/**
 * Tailwind classes per tone. Written out in full so Tailwind's scanner sees
 * every class; the colours themselves are the `--tone-*` tokens in
 * `app/globals.css`, each pair checked at 6:1 or better.
 */
export const TONE_CLASSES: Record<StatusTone, string> = {
  amber: "bg-tone-amber-bg text-tone-amber-fg border-tone-amber-border",
  orange: "bg-tone-orange-bg text-tone-orange-fg border-tone-orange-border",
  blue: "bg-tone-blue-bg text-tone-blue-fg border-tone-blue-border",
  violet: "bg-tone-violet-bg text-tone-violet-fg border-tone-violet-border",
  teal: "bg-tone-teal-bg text-tone-teal-fg border-tone-teal-border",
  cyan: "bg-tone-cyan-bg text-tone-cyan-fg border-tone-cyan-border",
  green: "bg-tone-green-bg text-tone-green-fg border-tone-green-border",
  red: "bg-tone-red-bg text-tone-red-fg border-tone-red-border",
  gray: "bg-tone-gray-bg text-tone-gray-fg border-tone-gray-border",
};
