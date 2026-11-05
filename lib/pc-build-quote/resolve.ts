import "server-only";
import { db } from "@/lib/db";
import { CatalogUnavailableError, isCatalogConfigured, searchCatalog } from "@/lib/catalog/hns-data";
import type { QuoteItem, QuoteLine } from "./parse";
import { matchSalesName } from "./sales";

/**
 * Each quotation line matched to the Accurate item with the same SKU. Only an
 * exact SKU match counts — a search hit on a similar name is not the item that
 * was sold. Read only, like every catalogue call in this app.
 *
 * When the catalogue cannot be reached the lines are returned unmatched and
 * `catalogChecked` is false: the quotation is still usable, its SKUs simply
 * stay as printed.
 */
export async function matchQuoteToCatalog(lines: QuoteLine[]): Promise<{ items: QuoteItem[]; catalogChecked: boolean }> {
  const unmatched = lines.map((l) => ({ ...l, catalogItemId: null, catalogCategory: null }));
  if (!isCatalogConfigured()) return { items: unmatched, catalogChecked: false };
  try {
    const items = await Promise.all(
      lines.map(async (line): Promise<QuoteItem> => {
        if (!line.sku) return { ...line, catalogItemId: null, catalogCategory: null };
        const hits = await searchCatalog(line.sku, 10);
        const hit = hits.find((h) => h.sku.trim().toUpperCase() === line.sku!.trim().toUpperCase());
        return { ...line, catalogItemId: hit?.id ?? null, catalogCategory: hit?.category ?? null };
      }),
    );
    return { items, catalogChecked: true };
  } catch (err) {
    if (!(err instanceof CatalogUnavailableError)) throw err;
    console.error("[PC BUILD QUOTE] katalog tidak bisa dihubungi", err.message);
    return { items: unmatched, catalogChecked: false };
  }
}

/**
 * The live ticket already opened from this quotation, if any. A cancelled or
 * rejected one does not count, so a build that fell through can be opened
 * again from the same quotation.
 */
export async function ticketUsingQuote(code: string): Promise<{ id: string; ticket_code: string } | null> {
  const found = await db.ticketPcBuildDetail.findFirst({
    where: { quote_code: code, ticket: { status: { notIn: ["cancelled", "rejected"] } } },
    select: { ticket: { select: { id: true, ticket_code: true } } },
  });
  return found?.ticket ?? null;
}

/** The active Sales account the quotation's "Sales: …" line names, if exactly one does. */
export async function findQuoteSales(salesName: string | null): Promise<{ id: string; name: string } | null> {
  if (!salesName) return null;
  const accounts = await db.user.findMany({ where: { role: "Sales", is_active: true }, select: { id: true, name: true } });
  return matchSalesName(salesName, accounts);
}
