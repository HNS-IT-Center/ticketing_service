/**
 * Pages a pagination strip shows: always the first and the last, the current
 * page and one either side, and a "gap" for every run left out. Pure, so the
 * strip is identical on the server and in the browser.
 *
 *   pageWindow(5, 10) → [1, "gap", 4, 5, 6, "gap", 10]
 */
export function pageWindow(page: number, pageCount: number): (number | "gap")[] {
  const pages = new Set([1, pageCount, page - 1, page, page + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  for (const p of sorted) {
    const prev = out[out.length - 1];
    if (typeof prev === "number" && p - prev > 1) out.push("gap");
    out.push(p);
  }
  return out;
}

/**
 * The page "previous" points at. Past the end (`?page=9` of 3) it leads back
 * to the last real page rather than to page 8, which is just as empty.
 */
export function previousPage(page: number, pageCount: number): number | null {
  if (page <= 1 || pageCount < 1) return null;
  return Math.max(1, Math.min(page - 1, pageCount));
}

export function nextPage(page: number, pageCount: number): number | null {
  return page < pageCount ? page + 1 : null;
}
