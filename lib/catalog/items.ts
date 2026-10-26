/**
 * The company item catalogue as this app uses it.
 *
 * Source: data.hnsitcenter.id `/api/v1/items`, a mirror of Accurate. Read only —
 * purchasing, stock and prices are managed there, never from here. Pure: no
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
  stockTotal: number;
  warehouses: { name: string; quantity: number }[];
};

type ApiItem = {
  id?: unknown;
  sku?: unknown;
  name?: unknown;
  category?: { name?: unknown } | null;
  brand?: { name?: unknown } | string | null;
  type?: unknown;
  unit?: unknown;
  manageSerialNumber?: unknown;
  stock?: { total?: unknown; warehouses?: { name?: unknown; quantity?: unknown }[] } | null;
};

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** One item from the API, or null when it lacks what a record needs. */
export function toCatalogItem(raw: ApiItem): CatalogItem | null {
  const id = typeof raw.id === "number" ? raw.id : null;
  const sku = str(raw.sku);
  const name = str(raw.name);
  if (id === null || !sku || !name) return null;
  const brand = typeof raw.brand === "string" ? str(raw.brand) : str(raw.brand?.name);
  return {
    id,
    sku,
    name,
    category: str(raw.category?.name),
    brand,
    type: str(raw.type) ?? "INVENTORY",
    unit: str(raw.unit),
    serialized: raw.manageSerialNumber === true,
    stockTotal: num(raw.stock?.total),
    warehouses: (raw.stock?.warehouses ?? [])
      .map((w) => ({ name: str(w.name) ?? "", quantity: num(w.quantity) }))
      .filter((w) => w.name),
  };
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Stock in the warehouse that belongs to a store, or null when no warehouse
 * matches it. Accurate names warehouses without spaces ("NAGOYAHILL") while
 * stores here are named for people ("Nagoya Hill"), so both are compared with
 * case, spaces and punctuation removed.
 */
export function stockAtStore(item: CatalogItem, storeName: string | null | undefined): number | null {
  if (!storeName) return null;
  const key = squash(storeName);
  if (!key) return null;
  const hit = item.warehouses.find((w) => squash(w.name) === key);
  return hit ? hit.quantity : null;
}

/** What a search box sends; anything shorter returns half the catalogue. */
export const MIN_QUERY = 2;
export const MAX_QUERY = 80;
export const MAX_QUANTITY = 99;
