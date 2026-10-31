/**
 * Items picked on the intake form as a list — the components of a PC build,
 * the item fitted for an upgrade.
 *
 * Each line is picked from the company catalogue (Accurate, through
 * data.hnsitcenter.id) or typed when the catalogue does not hold it. The form
 * posts only the catalogue id, the typed name and the quantity: the server
 * re-reads every picked item by id, so the name and SKU on record are the
 * catalogue's and not whatever the browser sent — the rule the unit at intake
 * and the replaced parts already follow.
 *
 * Pure: shared by the form, the server action and the tests.
 */
import { MAX_QUANTITY } from "./items";

/** One line as the form keeps it, and drafts it. */
export type PickedItem = {
  /** The catalogue id, or null when the name was typed. */
  catalogItemId: number | null;
  sku: string | null;
  category: string | null;
  name: string;
  quantity: number;
};

/** What the form posts for one line. */
export type PostedItem = { catalogItemId: number | null; name: string; quantity: number };

/** A selected upgrade and, optionally, the item fitted for it. */
export type UpgradeSelection = { upgradeId: string; item: PostedItem | null };

export const MAX_PC_COMPONENTS = 30;
export const MAX_UPGRADE_SELECTIONS = 20;
export const MAX_ITEM_NAME = 300;

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function toPosted(item: PickedItem): PostedItem {
  return { catalogItemId: item.catalogItemId, name: item.name.trim(), quantity: item.quantity };
}

/**
 * Add an item to a list: a catalogue item already on it gains one in quantity
 * rather than appearing twice, so "2× RAM 8GB" reads as one line.
 */
export function addPicked(list: readonly PickedItem[], item: PickedItem): PickedItem[] {
  if (item.catalogItemId !== null) {
    const at = list.findIndex((i) => i.catalogItemId === item.catalogItemId);
    if (at >= 0) {
      return list.map((i, n) => (n === at ? { ...i, quantity: Math.min(MAX_QUANTITY, i.quantity + item.quantity) } : i));
    }
  }
  return [...list, item];
}

function readItem(raw: unknown, where: string): ParseResult<PostedItem> {
  if (!raw || typeof raw !== "object") return { ok: false, error: `${where}: data tidak terbaca.` };
  const r = raw as Record<string, unknown>;

  let catalogItemId: number | null = null;
  if (r.catalogItemId !== null && r.catalogItemId !== undefined) {
    if (typeof r.catalogItemId !== "number" || !Number.isInteger(r.catalogItemId) || r.catalogItemId <= 0) {
      return { ok: false, error: `${where}: barang dari katalog tidak valid.` };
    }
    catalogItemId = r.catalogItemId;
  }

  const name = typeof r.name === "string" ? r.name.trim() : "";
  // A typed line is only its name; a catalogue line's name is replaced by the
  // catalogue's own on the server, so an empty one there is no loss.
  if (catalogItemId === null && !name) return { ok: false, error: `${where}: nama barang kosong.` };
  if (name.length > MAX_ITEM_NAME) {
    return { ok: false, error: `${where}: nama barang maksimal ${MAX_ITEM_NAME} karakter.` };
  }

  const quantity = r.quantity === undefined ? 1 : r.quantity;
  if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
    return { ok: false, error: `${where}: jumlah harus angka bulat 1–${MAX_QUANTITY}.` };
  }

  return { ok: true, value: { catalogItemId, name, quantity } };
}

function readArray(raw: string | null | undefined, max: number, what: string): ParseResult<unknown[]> {
  if (raw === null || raw === undefined || raw.trim() === "") return { ok: true, value: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: `Daftar ${what} tidak terbaca.` };
  }
  if (!Array.isArray(parsed)) return { ok: false, error: `Daftar ${what} tidak terbaca.` };
  if (parsed.length > max) return { ok: false, error: `Maksimal ${max} ${what}.` };
  return { ok: true, value: parsed };
}

/** Plain names, as a form loaded before 2026-10-26 posts them: typed lines of one. */
export function typedItems(names: readonly string[]): PostedItem[] {
  return names.map((n) => n.trim()).filter(Boolean).map((name) => ({ catalogItemId: null, name, quantity: 1 }));
}

/** The PC build's component list as posted. Empty or absent is an empty list. */
export function parsePostedItems(raw: string | null | undefined, max = MAX_PC_COMPONENTS): ParseResult<PostedItem[]> {
  const arr = readArray(raw, max, "komponen");
  if (!arr.ok) return arr;
  const out: PostedItem[] = [];
  for (const [i, raw] of arr.value.entries()) {
    const item = readItem(raw, `Komponen ${i + 1}`);
    if (!item.ok) return item;
    out.push(item.value);
  }
  return { ok: true, value: out };
}

/** The upgrades as posted: each type once, with or without the item fitted. */
export function parseUpgradeSelections(
  raw: string | null | undefined,
  max = MAX_UPGRADE_SELECTIONS,
): ParseResult<UpgradeSelection[]> {
  const arr = readArray(raw, max, "upgrade");
  if (!arr.ok) return arr;
  const seen = new Set<string>();
  const out: UpgradeSelection[] = [];
  for (const [i, raw] of arr.value.entries()) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const upgradeId = typeof r.upgradeId === "string" ? r.upgradeId.trim() : "";
    if (!upgradeId) return { ok: false, error: `Upgrade ${i + 1}: jenis upgrade tidak terbaca.` };
    if (seen.has(upgradeId)) return { ok: false, error: "Jenis upgrade yang sama dipilih dua kali." };
    seen.add(upgradeId);
    if (r.item === null || r.item === undefined) {
      out.push({ upgradeId, item: null });
      continue;
    }
    const item = readItem(r.item, `Barang upgrade ${i + 1}`);
    if (!item.ok) return item;
    out.push({ upgradeId, item: item.value });
  }
  return { ok: true, value: out };
}

/**
 * A component list from a saved draft. Drafts made before 2026-10-26 kept PC
 * components as plain strings (the old tag field); they come back as typed
 * lines. Anything unreadable is dropped rather than breaking the restore.
 */
export function restorePickedItems(value: unknown): PickedItem[] {
  if (!Array.isArray(value)) return [];
  const out: PickedItem[] = [];
  for (const v of value) {
    if (typeof v === "string") {
      if (v.trim()) out.push({ catalogItemId: null, sku: null, category: null, name: v.trim(), quantity: 1 });
      continue;
    }
    if (!v || typeof v !== "object") continue;
    const r = v as Record<string, unknown>;
    const name = typeof r.name === "string" ? r.name.trim() : "";
    if (!name) continue;
    const id = typeof r.catalogItemId === "number" && Number.isInteger(r.catalogItemId) && r.catalogItemId > 0 ? r.catalogItemId : null;
    const qty = typeof r.quantity === "number" && Number.isInteger(r.quantity) ? Math.min(MAX_QUANTITY, Math.max(1, r.quantity)) : 1;
    out.push({
      catalogItemId: id,
      sku: id !== null && typeof r.sku === "string" ? r.sku : null,
      category: id !== null && typeof r.category === "string" ? r.category : null,
      name,
      quantity: qty,
    });
  }
  return out;
}
