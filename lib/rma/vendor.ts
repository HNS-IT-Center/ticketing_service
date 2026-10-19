/**
 * Vendor names as people type them.
 *
 * Claim vendors now live in the vendor list (`Vendor`, with `handles_claims`),
 * and a typed name is matched there by the unique index, which already ignores
 * case. What stays here is the part the index cannot do — collapsing sloppy
 * whitespace before the lookup — and the key the dashboard groups the stored
 * `RmaCase.vendor_name` text by, which still holds "Asus Service Center" and
 * "ASUS SERVICE CENTER" side by side for cases sent before the list existed.
 */

/** Whitespace collapsed, ends trimmed. What comparison and storage both use. */
export function cleanVendorName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/** The form used for matching: cleaned, then case-folded. */
export function vendorKey(raw: string): string {
  return cleanVendorName(raw).toLowerCase();
}
