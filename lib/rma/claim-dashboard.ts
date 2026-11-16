/**
 * Analisa Klaim — the RMA desk's monthly performance dashboard (owner's
 * Power BI layout, 2026-11-16). Pure: the page loads the cases, this counts.
 *
 * The unit is an RMA case. Definitions the owner chose:
 *
 *   masuk     the unit was handed over to the RMA desk (`handed_over_at`);
 *   selesai   the case was ended — closed, ineligible or cancelled. All three
 *             stamp `closed_at`, so a case is finished exactly when it has one.
 *
 * And, for a month [start, end):
 *
 *   Total Tiket   cases handed over before the month ends;
 *   Tiket Masuk   handed over in the month;
 *   Tiket Selesai ended in the month, whenever they came in;
 *   Tiket Aktif   came in this month and not ended by its end;
 *   Outstanding   came in earlier and still open when the month began;
 *   Workload      masuk + outstanding — everything the desk had to carry;
 *   % Selesai     selesai ÷ masuk, as the owner's sheet has it (it can pass
 *                 100% in a month that clears an older pile);
 *   Avg LT        mean days from handover to end, over the month's selesai.
 */

export type VendorLocation = "in_town" | "out_of_town";
export type Ownership = "customer" | "store_stock";

export type DashboardCase = {
  handedOverAt: Date;
  closedAt: Date | null;
  ownership: Ownership;
  /** The vendor's name as recorded; null until the case goes to a vendor. */
  vendor: string | null;
  vendorLocation: VendorLocation | null;
  brand: string | null;
};

export type MonthRange = { start: Date; end: Date };

export type MonthFigures = {
  total: number;
  masuk: number;
  selesai: number;
  aktif: number;
  outstanding: number;
  workload: number;
  /** selesai ÷ masuk, 0–1+; null when nothing came in. */
  selesaiRate: number | null;
  /** Days; null when nothing ended in the month. */
  avgLeadDays: number | null;
};

const DAY = 86_400_000;

const inRange = (t: Date, r: MonthRange) => t >= r.start && t < r.end;
/** Still open at instant `t`. */
const openAt = (c: DashboardCase, t: Date) => c.closedAt === null || c.closedAt >= t;

export function monthFigures(cases: readonly DashboardCase[], r: MonthRange): MonthFigures {
  let total = 0, masuk = 0, selesai = 0, aktif = 0, outstanding = 0, leadSum = 0;
  for (const c of cases) {
    if (c.handedOverAt < r.end) total++;
    if (inRange(c.handedOverAt, r)) {
      masuk++;
      if (openAt(c, r.end)) aktif++;
    } else if (c.handedOverAt < r.start && openAt(c, r.start)) {
      outstanding++;
    }
    if (c.closedAt && inRange(c.closedAt, r)) {
      selesai++;
      leadSum += (c.closedAt.getTime() - c.handedOverAt.getTime()) / DAY;
    }
  }
  return {
    total,
    masuk,
    selesai,
    aktif,
    outstanding,
    workload: masuk + outstanding,
    selesaiRate: masuk ? selesai / masuk : null,
    avgLeadDays: selesai ? leadSum / selesai : null,
  };
}

export const LOCATION_LABELS: Record<VendorLocation, string> = { in_town: "LKL (dalam kota)", out_of_town: "ITR (luar kota)" };
export const OWNERSHIP_LABELS: Record<Ownership, string> = { customer: "Klaim User", store_stock: "Klaim Toko" };

export type Share = { key: string; label: string; count: number; muted?: boolean };

/**
 * Where the month's cases went: LKL or ITR by their vendor. A case not yet
 * sent, or sent to a vendor whose location is not recorded, is its own row,
 * so the two real parts are never inflated by a guess.
 */
export function locationShares(cases: readonly DashboardCase[]): Share[] {
  const count = (pred: (c: DashboardCase) => boolean) => cases.filter(pred).length;
  return [
    { key: "out_of_town", label: LOCATION_LABELS.out_of_town, count: count((c) => c.vendorLocation === "out_of_town") },
    { key: "in_town", label: LOCATION_LABELS.in_town, count: count((c) => c.vendorLocation === "in_town") },
    { key: "unknown", label: "Lokasi vendor belum dicatat", count: count((c) => c.vendor !== null && c.vendorLocation === null), muted: true },
    { key: "none", label: "Belum dikirim ke vendor", count: count((c) => c.vendor === null), muted: true },
  ].filter((s) => s.count > 0);
}

export function ownershipShares(cases: readonly DashboardCase[]): Share[] {
  return (["customer", "store_stock"] as const).map((o) => ({
    key: o,
    label: OWNERSHIP_LABELS[o],
    count: cases.filter((c) => c.ownership === o).length,
  }));
}

/** Folds case and spacing, so "Asus Service Center" and "ASUS  SERVICE CENTER" are one. */
const fold = (s: string) => s.trim().replace(/\s+/g, " ").toUpperCase();

/**
 * Cases per name, most first; ties by name. Cases without a name are left out
 * and counted in `missing` — a vendor ranking does not rank "not sent yet".
 */
export function ranking(cases: readonly DashboardCase[], nameOf: (c: DashboardCase) => string | null): { rows: Share[]; missing: number } {
  const map = new Map<string, Share>();
  let missing = 0;
  for (const c of cases) {
    const name = nameOf(c)?.trim();
    if (!name) {
      missing++;
      continue;
    }
    const key = fold(name);
    const row = map.get(key) ?? { key, label: key, count: 0 };
    row.count++;
    map.set(key, row);
  }
  return { rows: [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)), missing };
}

/** "YYYY-MM" of the month before / after. */
export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Every month from `first` to `last`, both included, oldest first. */
export function monthsBetween(first: string, last: string): string[] {
  const out: string[] = [];
  for (let m = first; m <= last && out.length < 240; m = shiftMonth(m, 1)) out.push(m);
  return out;
}

export const STATUS_FILTERS = ["open", "finished"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

/** The page's Lokasi / Kepemilikan / Status dropdowns; an empty value is "all". */
export type CaseFilter = { location?: VendorLocation; ownership?: Ownership; status?: StatusFilter };

export function readCaseFilter(p: { lokasi?: string; milik?: string; status?: string }): CaseFilter {
  return {
    location: p.lokasi === "in_town" || p.lokasi === "out_of_town" ? p.lokasi : undefined,
    ownership: p.milik === "customer" || p.milik === "store_stock" ? p.milik : undefined,
    status: p.status === "open" || p.status === "finished" ? p.status : undefined,
  };
}

/** Status is read as the case stands now: still open, or ended. */
export function matchesFilter(c: DashboardCase, f: CaseFilter): boolean {
  if (f.location && c.vendorLocation !== f.location) return false;
  if (f.ownership && c.ownership !== f.ownership) return false;
  if (f.status === "open" && c.closedAt !== null) return false;
  if (f.status === "finished" && c.closedAt === null) return false;
  return true;
}
