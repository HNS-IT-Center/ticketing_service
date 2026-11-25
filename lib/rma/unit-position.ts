import type { RmaStatus } from "@prisma/client";
import { claimStatusLabel, type ClaimStatusFilter } from "@/lib/rma/claim-list";
import type { CaseFilter, Ownership, Share, VendorLocation } from "@/lib/rma/claim-dashboard";

/**
 * Analisa Klaim — "Posisi Unit Sekarang" (owner, 2026-11-25): how many claims
 * sit at each RMA stage today, and for each stage that holds units, how long
 * they have been there and where. Pure: the page loads, this counts, the clock
 * is passed in.
 *
 * The claims counted are exactly the ones the Klaim Garansi list holds
 * (`claimListWhere`), so with no filter set the strip shows the same numbers
 * as that list's status dropdown. It is a snapshot of today: the page's Bulan
 * filter does not apply, Lokasi / Kepemilikan / Status do.
 */

export type ClaimStage = Exclude<ClaimStatusFilter, "all">;

/** Stages a unit is still moving through, in the desk's working order. */
export const OPEN_STAGES = [
  "not_handed",
  "pending_verification",
  "on_hold",
  "verified",
  "submitted_to_vendor",
  "in_vendor_process",
  "vendor_decided",
  "unit_received",
] as const satisfies readonly ClaimStage[];

/** Stages where the claim has ended. */
export const ENDED_STAGES = ["closed", "ineligible", "cancelled"] as const satisfies readonly RmaStatus[];

export type PositionUnit = {
  stage: ClaimStage;
  ownership: Ownership;
  vendor: string | null;
  vendorLocation: VendorLocation | null;
  /** When the unit entered its current stage: newest RMA event, else the handover, else the ticket. */
  stageSince: Date;
  ticketCode: string;
  rmaCode: string | null;
  caseId: string | null;
  device: string | null;
};

const DAY = 86_400_000;
const ENDED: ReadonlySet<ClaimStage> = new Set(ENDED_STAGES);

export const stageLabel = (s: ClaimStage) => claimStatusLabel(s);

/** The page's Lokasi / Kepemilikan / Status filter, read the way the rest of the page reads it. */
export function matchesPositionFilter(u: PositionUnit, f: CaseFilter): boolean {
  if (f.location && u.vendorLocation !== f.location) return false;
  if (f.ownership && u.ownership !== f.ownership) return false;
  if (f.status === "open" && ENDED.has(u.stage)) return false;
  if (f.status === "finished" && !ENDED.has(u.stage)) return false;
  return true;
}

export function stageCounts(units: readonly PositionUnit[]): Record<ClaimStage, number> {
  const out = Object.fromEntries([...OPEN_STAGES, ...ENDED_STAGES].map((s) => [s, 0])) as Record<ClaimStage, number>;
  for (const u of units) out[u.stage]++;
  return out;
}

/** Days in the current stage, rounded down. */
export const daysInStage = (u: PositionUnit, now: number) => Math.max(0, Math.floor((now - u.stageSince.getTime()) / DAY));

export const AGE_BUCKETS = [
  { key: "lt7", label: "< 7 hari", min: 0, max: 7 },
  { key: "7to14", label: "7–14 hari", min: 7, max: 14 },
  { key: "14to30", label: "14–30 hari", min: 14, max: 30 },
  { key: "gt30", label: "> 30 hari", min: 30, max: Infinity },
] as const;

export function ageShares(units: readonly PositionUnit[], now: number): Share[] {
  return AGE_BUCKETS.map((b) => ({
    key: b.key,
    label: b.label,
    count: units.filter((u) => {
      const d = daysInStage(u, now);
      return d >= b.min && d < b.max;
    }).length,
  }));
}

const fold = (s: string) => s.trim().replace(/\s+/g, " ").toUpperCase();

/**
 * Where the stage's units are: per vendor once they have one, else Klaim User
 * vs Klaim Toko — a unit not sent yet has no vendor to rank.
 */
export function stageBreakdown(units: readonly PositionUnit[]): { title: string; rows: Share[] } {
  const withVendor = units.filter((u) => u.vendor?.trim());
  if (withVendor.length === 0) {
    return {
      title: "Per kepemilikan",
      rows: [
        { key: "customer", label: "Klaim User", count: units.filter((u) => u.ownership === "customer").length },
        { key: "store_stock", label: "Klaim Toko", count: units.filter((u) => u.ownership === "store_stock").length },
      ].filter((r) => r.count > 0),
    };
  }
  const map = new Map<string, Share>();
  for (const u of withVendor) {
    const key = fold(u.vendor!);
    const row = map.get(key) ?? { key, label: key, count: 0 };
    row.count++;
    map.set(key, row);
  }
  const rows = [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const missing = units.length - withVendor.length;
  if (missing > 0) rows.push({ key: "none", label: "Belum ada vendor", count: missing, muted: true });
  return { title: "Per vendor", rows };
}

/** The units waiting longest in the stage, longest first. */
export function longestWaiting(units: readonly PositionUnit[], n = 3): PositionUnit[] {
  return [...units].sort((a, b) => a.stageSince.getTime() - b.stageSince.getTime() || a.ticketCode.localeCompare(b.ticketCode)).slice(0, n);
}
