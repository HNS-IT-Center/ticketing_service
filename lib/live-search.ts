/** How long typing must pause before the list is asked again. */
export const LIVE_SEARCH_DELAY_MS = 350;

/**
 * The URL a search box asks for: every filled field of its form (the chips'
 * hidden inputs, the selects, the dates), or — outside a form — the current
 * query string with this box's value set. The page number is never carried:
 * a new search starts at page 1.
 */
export function liveSearchHref(
  base: string,
  fields: Iterable<[string, FormDataEntryValue]>,
): string {
  const qs = new URLSearchParams();
  for (const [key, value] of fields) {
    if (key === "page" || typeof value !== "string") continue;
    const v = value.trim();
    if (v) qs.set(key, v);
  }
  const s = qs.toString();
  return s ? `${base}?${s}` : base;
}
