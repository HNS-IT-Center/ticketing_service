/**
 * Finance's view of the shop's own claimed stock (owner, 2026-11-10): which
 * vendors are slow with a claim, so payment terms can be weighed against how
 * long each one holds the shop's money. Read only, every store.
 *
 * A "klaim stok toko" is a warranty claim on a unit from the shop's own stock
 * (`unit_ownership = store_stock`), on the RMA case or, before handover, on
 * the intake. Time at the vendor runs from `submitted_at` (sent to the vendor)
 * to the unit — or its replacement or refund — coming back (`unit_received_at`),
 * else to the case closing. Pure: the queries are in finance-claims-server.ts.
 */
import type { RmaDecision, RmaStatus } from "@prisma/client";

/** Days at a vendor from which a claim reads as slow, and as very slow. */
export const SLOW_DAYS = 14;
export const VERY_SLOW_DAYS = 30;

const DAY_MS = 24 * 3600_000;
export function daysBetween(from: Date, to: Date | number): number {
  return Math.max(0, Math.floor((+to - +from) / DAY_MS));
}

export type ClaimTiming = {
  status: RmaStatus;
  submittedAt: Date | null;
  decidedAt: Date | null;
  receivedAt: Date | null;
  closedAt: Date | null;
};

export type VendorSpan = { days: number; open: boolean };

/** How long the unit has been, or was, with the vendor; null when it never went. */
export function vendorSpan(t: ClaimTiming, now: number): VendorSpan | null {
  if (!t.submittedAt) return null;
  const end = t.receivedAt ?? t.closedAt;
  return { days: daysBetween(t.submittedAt, end ?? now), open: end === null };
}

/** Days from sending to the vendor's decision, once there is one. */
export function decisionDays(t: ClaimTiming): number | null {
  return t.submittedAt && t.decidedAt ? daysBetween(t.submittedAt, t.decidedAt) : null;
}

export type Speed = "ok" | "slow" | "very_slow";
export function speedOf(days: number): Speed {
  return days >= VERY_SLOW_DAYS ? "very_slow" : days >= SLOW_DAYS ? "slow" : "ok";
}

export type VendorClaim = ClaimTiming & {
  vendorKey: string;
  vendorName: string;
  decision: RmaDecision | null;
};

export type VendorRow = {
  key: string;
  name: string;
  /** Claims sent to this vendor in the period. */
  sent: number;
  /** Still with the vendor today. */
  open: number;
  /** Still with the vendor, past SLOW_DAYS. */
  openSlow: number;
  /** Longest a claim still open has been there. */
  longestOpen: number | null;
  /** Median and average days to come back, over the claims that did. */
  medianReturn: number | null;
  avgReturn: number | null;
  /** Median days to the vendor's decision. */
  medianDecision: number | null;
  approved: number;
  rejected: number;
};

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

/**
 * One row per vendor, slowest first: the median time to come back, and where
 * nothing has come back yet, the longest still open.
 */
export function vendorRows(claims: readonly VendorClaim[], now: number): VendorRow[] {
  const by = new Map<string, VendorClaim[]>();
  for (const c of claims) if (c.submittedAt) by.set(c.vendorKey, [...(by.get(c.vendorKey) ?? []), c]);

  const rows = [...by.entries()].map(([key, list]): VendorRow => {
    const spans = list.map((c) => vendorSpan(c, now)!);
    const returned = spans.filter((s) => !s.open).map((s) => s.days);
    const open = spans.filter((s) => s.open).map((s) => s.days);
    const decisions = list.map(decisionDays).filter((d): d is number => d !== null);
    return {
      key,
      name: list[0].vendorName,
      sent: list.length,
      open: open.length,
      openSlow: open.filter((d) => d >= SLOW_DAYS).length,
      longestOpen: open.length ? Math.max(...open) : null,
      medianReturn: median(returned),
      avgReturn: returned.length ? Math.round(returned.reduce((a, b) => a + b, 0) / returned.length) : null,
      medianDecision: median(decisions),
      approved: list.filter((c) => c.decision && c.decision !== "rejected").length,
      rejected: list.filter((c) => c.decision === "rejected").length,
    };
  });
  const weight = (r: VendorRow) => Math.max(r.medianReturn ?? 0, r.longestOpen ?? 0);
  return rows.sort((a, b) => weight(b) - weight(a) || b.sent - a.sent || a.name.localeCompare(b.name));
}

/** "Asus Service Center" and "ASUS  service center" are one vendor when no id links them. */
export function vendorKeyOf(vendorId: string | null, vendorName: string | null): string {
  if (vendorId) return vendorId;
  const name = (vendorName ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  return name ? `name:${name}` : "none";
}

/**
 * Money held in claims (owner, 2026-11-11): a store-stock unit out on a claim
 * is stock the shop paid for and cannot sell until the unit, its replacement
 * or a refund comes back. Valued at harga modal per unit (Accurate's HPP), one
 * unit per claim. A unit with no harga modal — typed by hand without an
 * Accurate code, or the API not giving costs — is counted apart, never as 0.
 */
export type HeldMoney = { value: number; units: number; unpriced: number };

export function heldMoney(rows: readonly { unitCost: number | null }[]): HeldMoney {
  let value = 0;
  let unpriced = 0;
  for (const r of rows) {
    if (r.unitCost === null) unpriced += 1;
    else value += r.unitCost;
  }
  return { value, units: rows.length, unpriced };
}

/** The same, per vendor key. */
export function heldMoneyByVendor(rows: readonly { vendorKey: string; unitCost: number | null }[]): Map<string, HeldMoney> {
  const groups = new Map<string, { unitCost: number | null }[]>();
  for (const r of rows) groups.set(r.vendorKey, [...(groups.get(r.vendorKey) ?? []), r]);
  return new Map([...groups].map(([k, g]) => [k, heldMoney(g)]));
}
