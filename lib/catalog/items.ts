/**
 * The company item catalogue as this app uses it.
 *
 * Source: data.hnsitcenter.id `/api/v1/items`, a mirror of Accurate. Read only —
 * purchasing, stock and prices are managed there, never from here. Stock is
 * read from STOCK_WAREHOUSE_IDS only; see there for why. Pure: no
 * fetch, no server imports, so it is shared by the API route, the server action
 * that records a part, the technician's panel, and the tests.
 */

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
  /** Sum over STOCK_WAREHOUSE_IDS — never the API's own `stock.total`. */
  stockTotal: number;
  /** Only warehouses in STOCK_WAREHOUSE_IDS; every other row is dropped on arrival. */
  warehouses: CatalogWarehouse[];
  /** Only warehouses in CLAIM_WAREHOUSE_IDS, for the RMA desk. Never in stockTotal. */
  claimWarehouses: CatalogWarehouse[];
};

export type CatalogWarehouse = { id: number; name: string; quantity: number };

/**
 * The warehouses whose stock this app reads (owner, 2026-10-26). An allowlist,
 * not a denylist, because the "Ticketing HNS" client on data.hnsitcenter.id is
 * given every warehouse (`warehouseIds: null`). That includes GRIYA (id 350), a
 * restricted store whose stock must never be read or shown through the API, and
 * display, exhibition, gift and transit stock that says nothing about what a
 * technician can fit. A row outside this list never reaches a browser, a total
 * or a report, and a warehouse Accurate adds later stays out until listed here.
 */
export const STOCK_WAREHOUSE_IDS: ReadonlySet<number> = new Set([
  50, //  GUDANG UTAMA
  400, // NAGOYAHILL
  250, // GATEWAY
  // Not INVENTARIS NAGOYA GATEWAY (150): left out by the owner, 2026-10-27.
]);

/**
 * Where units under claim are kept, shown on the RMA case page and nowhere
 * else (owner, 2026-10-27): KLAIM GARANSI and KLAIM PEMASOK. Like the list
 * above, anything not named here is dropped.
 */
export const CLAIM_WAREHOUSE_IDS: ReadonlySet<number> = new Set([
  450, // KLAIM GARANSI
]);

/**
 * Claim warehouses known only by name, compared without case or spacing.
 * KLAIM PEMASOK does not exist on data.hnsitcenter.id yet (13 warehouses,
 * checked 2026-10-27); matching its name lets it appear the day Accurate has it,
 * with no release. Once it does, its id can join the list above.
 */
const CLAIM_WAREHOUSE_NAMES: ReadonlySet<string> = new Set(["klaimpemasok"]);

/** Restricted stores, refused whatever list or name would let them in. */
const RESTRICTED_WAREHOUSE_IDS: ReadonlySet<number> = new Set([350]); // GRIYA

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

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
export function toCatalogItem(raw: ApiItem): CatalogItem | null {
  const id = typeof raw.id === "number" ? raw.id : null;
  const sku = str(raw.sku);
  const name = str(raw.name);
  if (id === null || !sku || !name) return null;
  const brand = typeof raw.brand === "string" ? str(raw.brand) : str(raw.brand?.name);

  // A row without a numeric id cannot be shown not to be Griya, so it goes too.
  const all = raw.stock?.warehouses ?? [];
  const rows = all.filter((w) => typeof w.id === "number" && STOCK_WAREHOUSE_IDS.has(w.id));
  const toWarehouse = (w: (typeof all)[number]): CatalogWarehouse => ({
    id: w.id as number,
    name: str(w.name) ?? `#${w.id}`,
    quantity: num(w.quantity),
  });
  const warehouses = rows.map(toWarehouse);
  const claimWarehouses = all
    .filter(
      (w) =>
        typeof w.id === "number" &&
        !RESTRICTED_WAREHOUSE_IDS.has(w.id) &&
        (CLAIM_WAREHOUSE_IDS.has(w.id) || (typeof w.name === "string" && CLAIM_WAREHOUSE_NAMES.has(squash(w.name))))
    )
    .map(toWarehouse);
  // Recomputed rather than read: `stock.total` covers every warehouse the
  // client may see, Griya included (data API docs, "Data yang bisa ditarik").
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
