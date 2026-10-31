import type { Role } from "@prisma/client";
import { getSession } from "@/lib/session";
import { CatalogUnavailableError, isCatalogConfigured, searchCatalog } from "@/lib/catalog/hns-data";
import { MAX_QUERY, MIN_QUERY } from "@/lib/catalog/items";

// Typed against the enum, so a misspelt role fails tsc instead of locking it out.
const STAFF: ReadonlySet<string> = new Set<Role>(["Administrator", "Technician", "Sales", "RMA"]);

/**
 * GET /api/catalog/items?q=… — search the item catalogue for the parts panel.
 *
 * A thin, authenticated proxy: the data API's token never reaches a browser.
 * Staff sessions only, and this check is the only one — proxy.ts lets every
 * /api route through, so nothing in front of this handler asks for a login.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!STAFF.has(session.role)) return Response.json({ error: "Forbidden" }, { status: 403 });
  if (!isCatalogConfigured()) {
    return Response.json({ error: "Katalog barang belum dikonfigurasi." }, { status: 503 });
  }

  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, MAX_QUERY);
  if (q.length < MIN_QUERY) return Response.json({ items: [] });

  try {
    const items = await searchCatalog(q, 20);
    return Response.json({ items }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof CatalogUnavailableError) {
      console.error("[CATALOG SEARCH]", err.message);
      return Response.json(
        { error: "Katalog barang sedang tidak dapat dihubungi. Isi nama barang secara manual." },
        { status: 503 }
      );
    }
    throw err;
  }
}
