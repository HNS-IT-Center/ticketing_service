/**
 * The brand of a catalogue item. Accurate's own brand field when it is set —
 * it is for laptops ("ASUS", "LENOVO") — and otherwise the brand the category
 * is named after: the shop files components as "VGA CARD MSI", "MB ASUS",
 * "LAPTOP LENOVO", so its last word is the make. A one-word category says
 * nothing about the make, and gives null.
 */
export function catalogBrand(item: { brand: string | null; category: string | null }): string | null {
  const own = item.brand?.trim();
  if (own) return own.toUpperCase();
  const words = (item.category ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return null;
  return words[words.length - 1].toUpperCase();
}
