import "server-only";
import { toCatalogItem, type CatalogItem, type StockVisibility } from "./items";

/**
 * Reading the item catalogue from data.hnsitcenter.id.
 *
 * The token stays on the server: browsers search through /api/catalog/items,
 * never against the data API directly. Off when HNS_API_URL or HNS_API_TOKEN
 * is unset — the parts panel then simply offers the free-text field it always
 * had.
 */

// Generous on purpose: measured 2026-10-19, the first request after the API
// has been idle took 12.5 s, the next ones about 0.5 s.
const TIMEOUT_MS = 15_000;
/** Short, so a stock figure on screen is never far behind the warehouse. */
const CACHE_MS = 60_000;

export class CatalogUnavailableError extends Error {}

function settings(): { base: string; token: string } | null {
  const base = process.env.HNS_API_URL?.trim().replace(/\/+$/, "");
  const token = process.env.HNS_API_TOKEN?.trim();
  return base && token ? { base, token } : null;
}

export function isCatalogConfigured(): boolean {
  return settings() !== null;
}

const cache = new Map<string, { at: number; value: unknown }>();

async function getJson(path: string): Promise<{ status: number; body: unknown }> {
  const s = settings();
  if (!s) throw new CatalogUnavailableError("catalog not configured");

  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < CACHE_MS) return { status: 200, body: hit.value };

  let res: Response;
  try {
    res = await fetch(`${s.base}${path}`, {
      headers: { Authorization: `Bearer ${s.token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (err) {
    throw new CatalogUnavailableError(`catalog unreachable: ${(err as Error).message}`);
  }
  if (res.status === 404) return { status: 404, body: null };
  if (!res.ok) throw new CatalogUnavailableError(`catalog answered ${res.status}`);

  const body: unknown = await res.json();
  if (cache.size > 500) cache.clear();
  cache.set(path, { at: Date.now(), value: body });
  return { status: 200, body };
}

/**
 * `visible` is the viewer's warehouse settings (`stockVisibilityFor`), or
 * NO_STOCK where only an item's name, code or category is wanted. Required, so
 * no caller can forget it and hand a browser every warehouse.
 */
export async function searchCatalog(query: string, visible: StockVisibility, limit = 20): Promise<CatalogItem[]> {
  const { body } = await getJson(`/items?q=${encodeURIComponent(query)}&limit=${limit}`);
  const data = (body as { data?: unknown[] } | null)?.data ?? [];
  return data.map((d) => toCatalogItem(d as never, visible)).filter((i): i is CatalogItem => i !== null);
}

/** One item by its catalogue id, or null when it does not exist. */
export async function getCatalogItem(id: number, visible: StockVisibility): Promise<CatalogItem | null> {
  const { status, body } = await getJson(`/items/${id}`);
  if (status === 404) return null;
  const data = (body as { data?: unknown } | null)?.data;
  return data ? toCatalogItem(data as never, visible) : null;
}
