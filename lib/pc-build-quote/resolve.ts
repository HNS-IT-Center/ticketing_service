import "server-only";
import { db } from "@/lib/db";
import { CatalogUnavailableError, isCatalogConfigured, searchCatalog } from "@/lib/catalog/hns-data";
import { NO_STOCK } from "@/lib/catalog/items";
import type { QuoteItem, QuoteLine } from "./parse";
import { quoteLineKind, type QuoteLineKind } from "@/lib/ecommerce/quote-contract";

/** A line from either source: a PDF's has no kind (read from its label) and no price. */
export type SourceLine = QuoteLine & { kind?: QuoteLineKind; unitPrice?: number | null };
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
export async function matchQuoteToCatalog(source: SourceLine[]): Promise<{ items: QuoteItem[]; catalogChecked: boolean }> {
  const lines = source.map(({ kind, unitPrice, ...line }) => ({
    ...line,
    kind: kind ?? quoteLineKind(null, line.label, line.name),
    unitPrice: unitPrice ?? null,
  }));
  const unmatched = lines.map((l) => ({ ...l, catalogItemId: null, catalogCategory: null }));
  if (!isCatalogConfigured()) return { items: unmatched, catalogChecked: false };
  try {
    const items = await Promise.all(
      lines.map(async (line): Promise<QuoteItem> => {
        // Labour is matched to the Daftar Jasa on create, not to an item.
        if (!line.sku || line.kind === "service") return { ...line, catalogItemId: null, catalogCategory: null };
        const hits = await searchCatalog(line.sku, NO_STOCK, 10);
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

/**
 * The active Sales account behind the quotation: by the SSO subject the
 * e-commerce side sends when it has one — the same `sub` this app gets from
 * HNS SSO, so it cannot pick a namesake — else by the printed name, if exactly
 * one account matches.
 */
export async function findQuoteSales(
  salesName: string | null,
  ssoSub: string | null = null,
): Promise<{ id: string; name: string } | null> {
  if (ssoSub) {
    const bySub = await db.user.findFirst({ where: { sso_sub: ssoSub, role: "Sales", is_active: true }, select: { id: true, name: true } });
    if (bySub) return bySub;
  }
  if (!salesName) return null;
  const accounts = await db.user.findMany({ where: { role: "Sales", is_active: true }, select: { id: true, name: true } });
  return matchSalesName(salesName, accounts);
}
