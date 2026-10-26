/**
 * Which parts to keep in stock.
 *
 * Service parts are bought per job, except laptop RAM and SSD; a part fitted
 * again and again is a candidate for the shelf instead. This counts what the
 * technicians fitted over the last few months, by catalogue item, beside what
 * the catalogue says is in stock now — and, separately, what they fitted that
 * the catalogue does not hold at all, which an admin may want added to
 * Accurate. Pure: rows in, rankings out; the stock is passed in.
 */

import { monthRange, type PartReportRow } from "./parts";

/** How far back "often" looks, in months, the chosen one included. */
export const DEMAND_MONTHS = 3;
/** Fitted at least this many times in the window, with nothing in stock: worth a look. */
export const STOCK_HINT_MIN_USES = 3;

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/** The months ending with `month` ("YYYY-MM"), as one [start, end) range. */
export function demandWindow(month: string, months = DEMAND_MONTHS): { start: Date; end: Date; firstMonth: string } | null {
  const last = monthRange(month);
  if (!last) return null;
  const [y, m] = month.split("-").map(Number);
  const firstIndex = y * 12 + (m - 1) - (months - 1);
  const firstMonth = `${Math.floor(firstIndex / 12)}-${String((firstIndex % 12) + 1).padStart(2, "0")}`;
  const first = monthRange(firstMonth);
  if (!first) return null;
  return { start: first.start, end: last.end, firstMonth };
}

function monthOf(date: Date): string {
  const d = new Date(date.getTime() + WIB_OFFSET_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export type DemandRow = {
  sku: string;
  catalogItemId: number | null;
  name: string;
  category: string | null;
  /** Times it was recorded — one per ticket line. */
  uses: number;
  quantity: number;
  tickets: number;
  /** In how many of the window's months it was fitted: steady demand, not one busy week. */
  months: number;
};

/** Catalogue items fitted in the window, most used first. */
export function rankCatalogDemand(rows: readonly PartReportRow[]): DemandRow[] {
  const map = new Map<string, DemandRow & { ticketSet: Set<string>; monthSet: Set<string>; latest: number }>();
  for (const r of rows) {
    if (!r.sku) continue;
    const row = map.get(r.sku) ?? {
      sku: r.sku,
      catalogItemId: r.catalogItemId ?? null,
      name: r.itemName?.trim() || r.sku,
      category: r.catalogCategory,
      uses: 0,
      quantity: 0,
      tickets: 0,
      months: 0,
      ticketSet: new Set<string>(),
      monthSet: new Set<string>(),
      latest: 0,
    };
    row.uses += 1;
    row.quantity += r.quantity;
    row.ticketSet.add(r.ticketId);
    row.monthSet.add(monthOf(r.createdAt));
    // The newest record's name and id win: the catalogue may have renamed it.
    if (r.createdAt.getTime() >= row.latest) {
      row.latest = r.createdAt.getTime();
      if (r.itemName?.trim()) row.name = r.itemName.trim();
      if (r.catalogItemId) row.catalogItemId = r.catalogItemId;
      if (r.catalogCategory) row.category = r.catalogCategory;
    }
    map.set(r.sku, row);
  }
  return [...map.values()]
    .map((r) => ({
      sku: r.sku,
      catalogItemId: r.catalogItemId,
      name: r.name,
      category: r.category,
      uses: r.uses,
      quantity: r.quantity,
      tickets: r.ticketSet.size,
      months: r.monthSet.size,
    }))
    .sort((a, b) => b.uses - a.uses || b.quantity - a.quantity || a.name.localeCompare(b.name, "id"));
}

export type OutsideRow = { part: string; name: string; uses: number; quantity: number };

/**
 * Parts typed by hand because the catalogue did not hold them, grouped by
 * category and by name as typed — case and spacing ignored, the most common
 * spelling shown.
 */
export function outsideCatalog(rows: readonly PartReportRow[]): OutsideRow[] {
  const map = new Map<string, OutsideRow & { spellings: Map<string, number> }>();
  for (const r of rows) {
    if (r.sku) continue;
    const typed = r.itemName?.replace(/\s+/g, " ").trim() || "(tanpa nama barang)";
    const key = `${r.part}:${typed.toLowerCase()}`;
    const row = map.get(key) ?? { part: r.part, name: typed, uses: 0, quantity: 0, spellings: new Map<string, number>() };
    row.uses += 1;
    row.quantity += r.quantity;
    row.spellings.set(typed, (row.spellings.get(typed) ?? 0) + 1);
    map.set(key, row);
  }
  return [...map.values()]
    .map(({ spellings, ...row }) => ({
      ...row,
      name: [...spellings].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0],
    }))
    .sort((a, b) => b.uses - a.uses || b.quantity - a.quantity || a.name.localeCompare(b.name, "id"));
}

/** Fitted often, and none in stock: worth considering for the shelf. `null` stock means unknown. */
export function worthStocking(row: Pick<DemandRow, "uses">, stock: number | null): boolean {
  return row.uses >= STOCK_HINT_MIN_USES && stock === 0;
}
