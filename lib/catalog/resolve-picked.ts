import { CatalogUnavailableError, getCatalogItem } from "./hns-data";
import { NO_STOCK, type CatalogItem } from "./items";
import type { PostedItem } from "./picked-items";

/** A posted line made ready for the database: the catalogue's own name and SKU. */
export type ResolvedItem = {
  name: string;
  catalog_item_id: number | null;
  sku: string | null;
  catalog_category: string | null;
  quantity: number;
};

export type ResolveResult = { ok: true; items: ResolvedItem[] } | { ok: false; error: string };

export const CATALOG_DOWN_FOR_ITEMS =
  "Katalog barang sedang tidak dapat dihubungi. Hapus barang yang dipilih dari katalog dan ketik namanya secara manual.";

/**
 * Re-read every picked item from the catalogue by id. Each id is asked once,
 * however often it appears. Typed lines pass through untouched.
 */
export async function resolvePostedItems(items: readonly PostedItem[]): Promise<ResolveResult> {
  const ids = [...new Set(items.flatMap((i) => (i.catalogItemId === null ? [] : [i.catalogItemId])))];
  const found = new Map<number, CatalogItem>();
  try {
    const fetched = await Promise.all(ids.map((id) => getCatalogItem(id, NO_STOCK)));
    for (const [n, item] of fetched.entries()) {
      const id = ids.at(n)!;
      if (!item) return { ok: false, error: `Barang dengan id ${id} tidak ditemukan di katalog.` };
      found.set(id, item);
    }
  } catch (err) {
    if (!(err instanceof CatalogUnavailableError)) throw err;
    console.error("[CATALOG LOOKUP]", err.message);
    return { ok: false, error: CATALOG_DOWN_FOR_ITEMS };
  }

  return {
    ok: true,
    items: items.map((i) => {
      const c = i.catalogItemId === null ? undefined : found.get(i.catalogItemId);
      return c
        ? { name: c.name, catalog_item_id: c.id, sku: c.sku, catalog_category: c.category, quantity: i.quantity }
        : { name: i.name, catalog_item_id: null, sku: null, catalog_category: null, quantity: i.quantity };
    }),
  };
}
