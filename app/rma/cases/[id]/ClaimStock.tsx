import { CatalogUnavailableError, getCatalogItem, isCatalogConfigured } from "@/lib/catalog/hns-data";
import { stockVisibilityFor } from "@/lib/access-server";
import type { StockVisibility } from "@/lib/catalog/items";

const LABEL = "Stok Model Ini di Gudang Klaim";

/** Same markup as the page's Field, which hides itself when empty; this never is. */
export function ClaimStockShell({ value, muted = false }: { value: string; muted?: boolean }) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-1">{LABEL}</p>
      <p className="font-medium" style={{ wordBreak: "break-word", color: muted ? "var(--text-muted)" : undefined }}>
        {value}
      </p>
    </div>
  );
}

/**
 * What the claim warehouses (`view_stock_klaim` in WAREHOUSE_ACCESS) hold of the unit's catalogue
 * item — per model, not per serial number, so it counts this unit only if it
 * is store stock already moved there.
 *
 * A unit typed by hand, usually one not bought here, has no catalogue item and
 * says so. Rendered under Suspense by the page: the first catalogue request
 * after the API has idled took 12.5 s, and the rest of the case must not wait.
 */
export default async function ClaimStock({ catalogItemId, userId }: { catalogItemId: number | null; userId: string }) {
  // Hidden altogether for a viewer the owner has not given the claim warehouses.
  const visible = await stockVisibilityFor(userId);
  if (!visible.has("view_stock_klaim")) return null;
  if (catalogItemId === null) {
    return <ClaimStockShell value="Unit diketik manual, tidak ada di katalog" muted />;
  }
  if (!isCatalogConfigured()) return null;
  const { value, muted } = await lookup(catalogItemId, visible);
  return <ClaimStockShell value={value} muted={muted} />;
}

async function lookup(catalogItemId: number, visible: StockVisibility): Promise<{ value: string; muted: boolean }> {
  try {
    const item = await getCatalogItem(catalogItemId, visible);
    if (!item) return { value: "Barang sudah tidak ada di katalog", muted: true };
    if (item.claimWarehouses.length === 0) return { value: "Tidak ada", muted: true };
    return { value: item.claimWarehouses.map((w) => `${w.name}: ${w.quantity}`).join(" · "), muted: false };
  } catch (err) {
    if (!(err instanceof CatalogUnavailableError)) throw err;
    console.error("[RMA CLAIM STOCK]", err.message);
    return { value: "Katalog sedang tidak dapat dihubungi", muted: true };
  }
}
