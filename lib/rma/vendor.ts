/**
 * Vendor names are free text, so the same vendor arrives spelled several ways.
 * The live data already holds "Asus Service Center" and "ASUS SERVICE CENTER"
 * as two separate vendors, which splits every per-vendor figure in half.
 *
 * This does not introduce a vendor table — it just stops the splitting getting
 * worse, by folding a newly typed name onto one already in use whenever the two
 * only differ by case or spacing.
 */

/** Whitespace collapsed, ends trimmed. What comparison and storage both use. */
export function cleanVendorName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/** The form used for matching: cleaned, then case-folded. */
export function vendorKey(raw: string): string {
  return cleanVendorName(raw).toLowerCase();
}

/**
 * Pick the spelling to store.
 *
 * If an existing vendor differs only by case or spacing, its spelling wins —
 * so the group stays one group instead of becoming two. Otherwise the cleaned
 * input is stored as typed, because a genuinely new vendor's own capitalisation
 * ("MSI", "iBox") is better than anything this could impose on it.
 */
export function canonicalVendorName(raw: string, known: readonly string[]): string {
  const cleaned = cleanVendorName(raw);
  if (!cleaned) return "";

  const key = vendorKey(cleaned);
  const match = known.find((k) => vendorKey(k) === key);
  return match ? cleanVendorName(match) : cleaned;
}
