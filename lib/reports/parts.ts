/**
 * The replaced-parts report: what technicians fitted, counted.
 *
 * Pure — rows in, summaries out — so the page, the CSV export and the tests
 * share one set of sums. Built on the category picker and, when the part was
 * picked from the catalogue, its SKU; free-text names are grouped as typed.
 */

export type PartReportRow = {
  id: string;
  createdAt: Date;
  part: string;
  itemName: string | null;
  sku: string | null;
  /** The catalogue item's id, to look its stock up; absent on typed parts. */
  catalogItemId?: number | null;
  catalogCategory: string | null;
  quantity: number;
  notes: string | null;
  ticketId: string;
  ticketCode: string;
  storeName: string | null;
  technicianName: string;
};

/** Stores run on WIB (UTC+7); a month starts at local midnight, not UTC's. */
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/** "2026-10" → [start, end) as instants, or null for anything malformed. */
export function monthRange(month: string): { start: Date; end: Date } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const year = Number(m[1]);
  const mon = Number(m[2]);
  if (mon < 1 || mon > 12 || year < 2000 || year > 2100) return null;
  return {
    start: new Date(Date.UTC(year, mon - 1, 1) - WIB_OFFSET_MS),
    end: new Date(Date.UTC(year, mon, 1) - WIB_OFFSET_MS),
  };
}

const MONTH_LABEL = new Intl.DateTimeFormat("id-ID", { month: "short", year: "numeric", timeZone: "UTC" });

/** "2026-10" → "Okt 2026". */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return MONTH_LABEL.format(Date.UTC(y, m - 1, 1));
}

/** The current month in WIB, as "YYYY-MM". The clock is passed in. */
export function currentMonth(now: number): string {
  const d = new Date(now + WIB_OFFSET_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export type ItemSummary = {
  key: string;
  label: string;
  sku: string | null;
  category: string | null;
  quantity: number;
  tickets: number;
};

export type PartsSummary = {
  entries: number;
  quantity: number;
  tickets: number;
  /** Entries picked from the catalogue (with a SKU) — how countable the data is. */
  fromCatalog: number;
  byPart: { part: string; quantity: number; entries: number }[];
  byItem: ItemSummary[];
  byTechnician: { name: string; quantity: number; entries: number }[];
};

export function summarizeParts(rows: PartReportRow[]): PartsSummary {
  const byPart = new Map<string, { quantity: number; entries: number }>();
  const byItem = new Map<string, ItemSummary & { ticketSet: Set<string> }>();
  const byTech = new Map<string, { quantity: number; entries: number }>();
  const tickets = new Set<string>();
  let quantity = 0;
  let fromCatalog = 0;

  for (const r of rows) {
    quantity += r.quantity;
    tickets.add(r.ticketId);
    if (r.sku) fromCatalog++;

    const p = byPart.get(r.part) ?? { quantity: 0, entries: 0 };
    p.quantity += r.quantity;
    p.entries++;
    byPart.set(r.part, p);

    const t = byTech.get(r.technicianName) ?? { quantity: 0, entries: 0 };
    t.quantity += r.quantity;
    t.entries++;
    byTech.set(r.technicianName, t);

    // A SKU identifies an item; a typed name is grouped as typed, ignoring
    // case and spacing — the rule the "di luar katalog" list follows too.
    const name = r.itemName?.replace(/\s+/g, " ").trim() || "(tanpa nama barang)";
    const key = r.sku ? `sku:${r.sku}` : `name:${r.part}:${name.toLowerCase()}`;
    const item = byItem.get(key) ?? {
      key,
      label: name,
      sku: r.sku,
      category: r.catalogCategory,
      quantity: 0,
      tickets: 0,
      ticketSet: new Set<string>(),
    };
    item.quantity += r.quantity;
    item.ticketSet.add(r.ticketId);
    item.tickets = item.ticketSet.size;
    byItem.set(key, item);
  }

  const desc = <T extends { quantity: number }>(a: T, b: T) => b.quantity - a.quantity;
  return {
    entries: rows.length,
    quantity,
    tickets: tickets.size,
    fromCatalog,
    byPart: [...byPart].map(([part, v]) => ({ part, ...v })).sort(desc),
    byItem: [...byItem.values()]
      .map((i) => ({ key: i.key, label: i.label, sku: i.sku, category: i.category, quantity: i.quantity, tickets: i.tickets }))
      .sort(desc),
    byTechnician: [...byTech].map(([name, v]) => ({ name, ...v })).sort(desc),
  };
}

export const PART_REPORT_CSV_HEADER = [
  "tanggal",
  "kode_tiket",
  "toko",
  "teknisi",
  "jenis_part",
  "nama_barang",
  "sku",
  "kategori_accurate",
  "jumlah",
  "catatan",
] as const;
