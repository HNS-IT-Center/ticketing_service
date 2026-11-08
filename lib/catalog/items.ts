/**
 * The company item catalogue as this app uses it.
 *
 * Source: data.hnsitcenter.id `/api/v1/items`, a mirror of Accurate. Read only —
 * purchasing, stock and prices are managed there, never from here. Stock is
 * read from the warehouses in WAREHOUSE_ACCESS only, and only those the viewer
 * may see (Admin → Pengaturan Akses → Stok Gudang). Pure: no
 * fetch, no server imports, so it is shared by the API route, the server action
 * that records a part, the technician's panel, and the tests.
 */

import type { StockCapability } from "@/lib/access";

export type CatalogItem = {
  id: number;
  sku: string;
  name: string;
  category: string | null;
  brand: string | null;
  /** INVENTORY, SERVICE or NON_INVENTORY, as Accurate calls them. */
  type: string;
  unit: string | null;
  serialized: boolean;
  /** Sum over the store warehouses the viewer may see — never the API's own `stock.total`. */
  stockTotal: number;
  /** Store warehouses the viewer may see; every other row is dropped on arrival. */
  warehouses: CatalogWarehouse[];
  /** Claim warehouses, when the viewer may see them (the RMA desk). Never in stockTotal. */
  claimWarehouses: CatalogWarehouse[];
};

export type CatalogWarehouse = { id: number; name: string; quantity: number };

/**
 * Every warehouse this app reads, each behind its own setting in Admin →
 * Pengaturan Akses → Stok Gudang (owner, 2026-11-07). An allowlist, not a
 * denylist, because the "Ticketing HNS" client on data.hnsitcenter.id is given
 * every warehouse (`warehouseIds: null`): display, exhibition, gift, inventory
 * and transit stock says nothing about what a technician can fit, so a
 * warehouse not named here never reaches a browser, a total or a report — and
 * one Accurate adds later stays out until it is listed.
 *
 * GRIYA (350) and GUDANG BATAM (100) are restricted: Admin only unless the
 * owner grants a group. Matched by id and, for the restricted two, by name too,
 * so a renumbered warehouse cannot slip into an unrestricted setting.
 */
export const WAREHOUSE_ACCESS: Readonly<
  Record<StockCapability, { ids: readonly number[]; names?: readonly string[]; claim?: true }>
> = {
  view_stock_utama: { ids: [50] }, // GUDANG UTAMA
  view_stock_nagoyahill: { ids: [400] }, // NAGOYAHILL
  view_stock_gateway: { ids: [250] }, // GATEWAY — not INVENTARIS NAGOYA GATEWAY (150), left out 2026-10-27
  // KLAIM PEMASOK is not on data.hnsitcenter.id yet; by name it appears the day it is.
  view_stock_klaim: { ids: [450], names: ["klaimpemasok"], claim: true }, // KLAIM GARANSI
  view_stock_batam: { ids: [100], names: ["gudangbatam"] }, // GUDANG BATAM
  view_stock_griya: { ids: [350], names: ["griya"] }, // GRIYA
};

/** Which warehouses a viewer may see — the stock settings they hold. */
export type StockVisibility = ReadonlySet<StockCapability>;
/** For callers that only need an item's name, code or category. */
export const NO_STOCK: StockVisibility = new Set();

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** The setting a warehouse row belongs to, or null when the app does not read it. */
function warehouseSetting(w: { id?: unknown; name?: unknown }): StockCapability | null {
  if (typeof w.id !== "number") return null; // cannot be shown not to be a restricted one
  const name = typeof w.name === "string" ? squash(w.name) : "";
  // Restricted ones first, by id or by name, so a name never lands elsewhere.
  for (const key of ["view_stock_griya", "view_stock_batam"] as const) {
    const rule = WAREHOUSE_ACCESS[key];
    if (rule.ids.includes(w.id) || (name && rule.names?.includes(name))) return key;
  }
  for (const key of Object.keys(WAREHOUSE_ACCESS) as StockCapability[]) {
    const rule = WAREHOUSE_ACCESS[key];
    if (rule.ids.includes(w.id) || (name && rule.names?.includes(name))) return key;
  }
  return null;
}

/**
 * A store's own warehouses, by store code. Gudang Utama belongs to no store: it
 * counts in the total only. A store missing here falls back to matching its
 * name, so one an administrator adds still finds a warehouse named after it.
 */
const STORE_WAREHOUSE_IDS: Readonly<Record<string, readonly number[]>> = {
  NGH: [400],
  NGW: [250],
};

/** The store a stock figure is asked about. */
export type StoreRef = { code: string; name: string };

type ApiItem = {
  id?: unknown;
  sku?: unknown;
  name?: unknown;
  category?: { name?: unknown } | null;
  brand?: { name?: unknown } | string | null;
  type?: unknown;
  unit?: unknown;
  manageSerialNumber?: unknown;
  stock?: {
    total?: unknown;
    warehouses?: { id?: unknown; name?: unknown; quantity?: unknown; countsInTotal?: unknown }[];
  } | null;
};

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
// The API rounds to four places; a sum of fractional quantities does the same.
const round = (n: number) => Math.round(n * 10_000) / 10_000;

/** One item from the API, or null when it lacks what a record needs. */
export function toCatalogItem(raw: ApiItem, visible: StockVisibility): CatalogItem | null {
  const id = typeof raw.id === "number" ? raw.id : null;
  const sku = str(raw.sku);
  const name = str(raw.name);
  if (id === null || !sku || !name) return null;
  const brand = typeof raw.brand === "string" ? str(raw.brand) : str(raw.brand?.name);

  // Only warehouses this app reads, and of those only what the viewer may see.
  const all = raw.stock?.warehouses ?? [];
  const toWarehouse = (w: (typeof all)[number]): CatalogWarehouse => ({
    id: w.id as number,
    name: str(w.name) ?? `#${w.id}`,
    quantity: num(w.quantity),
  });
  const seen = all
    .map((w) => ({ w, setting: warehouseSetting(w) }))
    .filter((x): x is { w: (typeof all)[number]; setting: StockCapability } => x.setting !== null && visible.has(x.setting));
  const rows = seen.filter((x) => !WAREHOUSE_ACCESS[x.setting].claim).map((x) => x.w);
  const warehouses = rows.map(toWarehouse);
  const claimWarehouses = seen.filter((x) => WAREHOUSE_ACCESS[x.setting].claim).map((x) => toWarehouse(x.w));
  // Recomputed rather than read: `stock.total` covers every warehouse the
  // client may see, the restricted ones included.
  const stockTotal = round(
    rows.reduce((sum, w) => (w.countsInTotal === false ? sum : sum + num(w.quantity)), 0)
  );

  return {
    id,
    sku,
    name,
    category: str(raw.category?.name),
    brand,
    type: str(raw.type) ?? "INVENTORY",
    unit: str(raw.unit),
    serialized: raw.manageSerialNumber === true,
    stockTotal,
    warehouses,
    claimWarehouses,
  };
}

/**
 * Stock in a store's own warehouses, or null when it is not known which
 * warehouses those are.
 *
 * A store in STORE_WAREHOUSE_IDS is matched by warehouse id, and an absent row
 * means 0 — the API omits warehouses holding nothing. Any other store is
 * matched by name, compared without case, spaces or punctuation ("Nagoya Hill"
 * against "NAGOYAHILL"); there an absent row means unknown. Matching by name
 * alone never found Gateway, whose warehouse is just "GATEWAY".
 */
export function stockAtStore(item: CatalogItem, store: StoreRef | null | undefined): number | null {
  if (!store) return null;
  const ids = STORE_WAREHOUSE_IDS[store.code];
  if (ids) {
    return round(item.warehouses.filter((w) => ids.includes(w.id)).reduce((sum, w) => sum + w.quantity, 0));
  }
  const key = squash(store.name);
  if (!key) return null;
  const hit = item.warehouses.find((w) => squash(w.name) === key);
  return hit ? hit.quantity : null;
}

/** What a search box sends; anything shorter returns half the catalogue. */
export const MIN_QUERY = 2;
export const MAX_QUERY = 80;
export const MAX_QUANTITY = 99;
