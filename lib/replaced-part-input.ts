import "server-only";
import type { ServicePart } from "@prisma/client";
import { CatalogUnavailableError, getCatalogItem } from "@/lib/catalog/hns-data";
import { MAX_QUANTITY, type CatalogItem } from "@/lib/catalog/items";
import { isServicePart, requiresItemName } from "@/lib/service-parts";

export type PartInput = {
  part: ServicePart;
  /** The catalogue's name when picked from it, else what was typed; null when nothing was. */
  name: string | null;
  quantity: number;
  catalog: CatalogItem | null;
};

/**
 * What a form says was fitted, checked: the category, the item — re-read from
 * the catalogue by id when one was picked, so the code and name on record are
 * the catalogue's and not whatever the browser sent — and the quantity.
 *
 * One copy for both ways a part is recorded: the technician's "Part yang
 * Diganti" panel and the "Part" line of Rincian Biaya.
 */
export async function readPartInput(formData: FormData): Promise<{ error: string } | PartInput> {
  const part = String(formData.get("part") ?? "");
  if (!isServicePart(part)) return { error: "Jenis part tidak dikenal." };

  const quantity = Number(String(formData.get("quantity") ?? "1").trim() || "1");
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
    return { error: `Jumlah harus angka 1–${MAX_QUANTITY}.` };
  }

  let catalog: CatalogItem | null = null;
  const catalogIdRaw = String(formData.get("catalog_item_id") ?? "").trim();
  if (catalogIdRaw) {
    const catalogId = Number(catalogIdRaw);
    if (!Number.isInteger(catalogId) || catalogId <= 0) return { error: "Barang katalog tidak valid." };
    try {
      catalog = await getCatalogItem(catalogId);
    } catch (err) {
      if (!(err instanceof CatalogUnavailableError)) throw err;
      console.error("[CATALOG LOOKUP]", err.message);
      return {
        error: "Katalog barang sedang tidak dapat dihubungi. Hapus pilihan katalog dan isi nama barang secara manual.",
      };
    }
    if (!catalog) return { error: "Barang tidak ditemukan di katalog." };
  }

  const name = catalog?.name ?? (String(formData.get("item_name") ?? "").trim() || null);
  // `other` carries no meaning by itself, so the name is what says what was
  // fitted. Every named category already describes itself.
  if (requiresItemName(part) && !name) return { error: "Nama barang wajib diisi bila jenis part-nya Lainnya." };

  return { part, name, quantity, catalog };
}
