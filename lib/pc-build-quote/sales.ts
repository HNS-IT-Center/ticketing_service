/**
 * Which ticketing Sales account the quotation's "Sales: …" line names.
 *
 * The two systems keep their own accounts, so the name is the only link. An
 * exact match (ignoring case and spacing) wins; otherwise one account whose
 * name contains the printed one, or is contained in it ("Budi" ↔ "Budi
 * Santoso"). Anything ambiguous or absent is no match — the person picks the
 * sales by hand rather than the ticket going to the wrong one.
 *
 * Pure: shared by the upload route, the create action and the tests.
 */
export function normalizeName(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

export function matchSalesName<T extends { id: string; name: string }>(printed: string | null, accounts: T[]): T | null {
  if (!printed) return null;
  const want = normalizeName(printed);
  if (want.length < 2) return null;
  const exact = accounts.filter((a) => normalizeName(a.name) === want);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;
  if (want.length < 3) return null;
  const partial = accounts.filter((a) => {
    const have = normalizeName(a.name);
    return have.length >= 3 && (have.includes(want) || want.includes(have));
  });
  return partial.length === 1 ? partial[0] : null;
}
