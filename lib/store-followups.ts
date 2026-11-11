/**
 * What the kepala toko should chase today (owner, 2026-11-10) — five lists,
 * each built on a rule the rest of the app already uses:
 *
 *   stale   tickets still waiting or being worked on, longest in the shop first;
 *   pickup  finished units the customer has not collected (done / ready /
 *           waiting pickup), longest waiting first — with a WhatsApp reminder;
 *   vendor  work sent to a vendor and not back yet (an external_service bill
 *           line with sent_at and no returned_at — the line *is* the trip);
 *   billing finished service tickets not yet handed over whose bill cannot be
 *           printed final: no line at all, or a line with no selling price
 *           (the two DRAF reasons of lib/invoice.ts that a person can fix);
 *   code    finished service tickets with a part still waiting for its
 *           Accurate code (lib/part-code-alerts.ts, the dashboards' rule).
 *
 * Pure: thresholds and labels; the queries are in store-followups-server.ts.
 */
import type { TicketStatus } from "@prisma/client";

export const FOLLOWUP_KINDS = ["stale", "pickup", "vendor", "billing", "code"] as const;
export type FollowupKind = (typeof FOLLOWUP_KINDS)[number];

export function isFollowupKind(v: string | undefined): v is FollowupKind {
  return (FOLLOWUP_KINDS as readonly string[]).includes(v ?? "");
}

export const FOLLOWUP_INFO: Record<FollowupKind, { label: string; hint: string; warnDays: number; overdueDays: number }> = {
  stale: {
    label: "Belum selesai dikerjakan",
    hint: "Tiket yang masih menunggu atau sedang dikerjakan, dihitung dari tiket masuk.",
    warnDays: 3,
    overdueDays: 7,
  },
  pickup: {
    label: "Siap diambil customer",
    hint: "Unit selesai yang belum diambil. Ingatkan lewat WhatsApp; yang sudah diambil, minta statusnya diubah ke Completed.",
    warnDays: 3,
    overdueDays: 7,
  },
  vendor: {
    label: "Masih di vendor",
    hint: "Pekerjaan yang dikirim ke vendor (IC, mainboard, …) dan belum kembali.",
    warnDays: 7,
    overdueDays: 14,
  },
  billing: {
    label: "Biaya belum lengkap",
    hint: "Service selesai yang fakturnya masih DRAF: belum ada biaya, atau ada baris tanpa harga jual. Belum bisa ditagih.",
    warnDays: 1,
    overdueDays: 3,
  },
  code: {
    label: "Part tanpa kode Accurate",
    hint: "Part yang dipasang masih tercatat dengan nama saja. Teknisi memilih kodenya di Rincian Biaya → Masukkan kode.",
    warnDays: 3,
    overdueDays: 7,
  },
};

/** Waiting for the customer: the unit is finished and still at the shop. */
export const AWAITING_PICKUP_STATUSES: TicketStatus[] = ["done", "ready_for_pickup", "waiting_pickup"];

/** Finished but not yet handed over — still to be billed at the counter. */
export const TO_BE_BILLED_STATUSES: TicketStatus[] = ["done", "ready_for_pickup", "waiting_pickup", "handed_to_courier", "delivered"];

export type Urgency = "ok" | "warn" | "overdue";

export function urgencyOf(kind: FollowupKind, days: number): Urgency {
  const { warnDays, overdueDays } = FOLLOWUP_INFO[kind];
  return days >= overdueDays ? "overdue" : days >= warnDays ? "warn" : "ok";
}

const DAY_MS = 24 * 3600_000;
export function daysSince(at: Date, now: number): number {
  return Math.max(0, Math.floor((now - +at) / DAY_MS));
}

/** The moment a ticket entered its current status: the newest log into it, else when it was last touched. */
export function enteredStatusAt(
  status: TicketStatus,
  logs: readonly { new_status: TicketStatus; created_at: Date }[],
  fallback: Date,
): Date {
  let at: Date | null = null;
  for (const l of logs) if (l.new_status === status && (!at || l.created_at > at)) at = l.created_at;
  return at ?? fallback;
}

/** Why a bill is not final, in the words of the invoice page; null when it is. */
export function billingGap(lines: readonly { unit_price: number | null }[]): string | null {
  if (lines.length === 0) return "Belum ada biaya yang dicatat";
  const unpriced = lines.filter((l) => l.unit_price === null).length;
  return unpriced ? `${unpriced} baris belum ada harga jual` : null;
}
