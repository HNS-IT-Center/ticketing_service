import {
  AUDIENCES,
  CAPABILITIES,
  CAPABILITY_INFO,
  CAPABILITY_SECTIONS,
  appliesTo,
  audienceAllowed,
  type AccessOverrides,
  type Audience,
  type Capability,
} from "./access";

/**
 * Hak Akses as one card per role, and an edit page per role whose settings
 * sit in small grouped boxes (owner, 2026-11-12, after data.hnsitcenter.id's
 * "Pengguna & Akses"). Pure: the pages render from this and the tests need no
 * database.
 */

export type AccessItem = { capability: Capability; label: string; hint: string };
export type AccessGroup = { key: string; title: string; hint?: string; items: AccessItem[] };

/** What each group of staff is, on its card. */
export const AUDIENCE_HINTS: Record<Audience, string> = {
  administrator: "Akses penuh ke semua fitur. Tidak bisa dibatasi, supaya tidak ada yang terkunci dari halaman ini.",
  coordinator: "Teknisi bertanda Team Leader: menyetujui permintaan tiket di toko yang dipegangnya.",
  head_technician: "Teknisi bertanda Head Teknisi: melihat semua tiket dan mengelola harga service.",
  technician: "Mengerjakan tiket service, cleaning, upgrade, rakitan dan klaim.",
  sales: "Membuat tiket untuk customer dan memantau tiket yang ia pegang.",
  rma: "Meja klaim garansi: memverifikasi, mengirim ke vendor, dan menutup case.",
  store_supervisor: "Kepala toko: memantau toko yang dipegangnya, baca saja.",
  stock_admin: "Memantau rakitan PC dan part yang keluar, semua toko, baca saja.",
  finance: "Memantau klaim stok toko dan uang yang tertahan di vendor.",
};

/** A page's label is "Group · Page"; the group becomes the box title. */
function splitLabel(label: string): { group: string | null; label: string } {
  const at = label.indexOf(" · ");
  return at === -1 ? { group: null, label } : { group: label.slice(0, at), label: label.slice(at + 3) };
}

/**
 * The settings that can apply to one group, in boxes: the pages by their menu
 * group first (they decide what the person sees at all), then prices, ticket
 * correction and stock. A setting that cannot apply to the group (a kepala
 * toko's pages for a technician) is left out rather than shown disabled.
 */
export function accessGroupsFor(audience: Audience): AccessGroup[] {
  const groups = new Map<string, AccessGroup>();
  const add = (key: string, title: string, item: AccessItem, hint?: string) => {
    if (!groups.has(key)) groups.set(key, { key, title, hint, items: [] });
    groups.get(key)!.items.push(item);
  };
  for (const c of CAPABILITIES) {
    if (!appliesTo(c, audience)) continue;
    const info = CAPABILITY_INFO[c];
    const section = info.section ?? "pricing";
    if (section === "pages") {
      const { group, label } = splitLabel(info.label);
      const title = `Halaman · ${group ?? "Lainnya"}`;
      add(`pages:${group ?? "other"}`, title, { capability: c, label, hint: info.hint });
    } else {
      add(section, CAPABILITY_SECTIONS[section].title, { capability: c, label: info.label, hint: info.hint }, CAPABILITY_SECTIONS[section].hint);
    }
  }
  // Pages first — they decide what the person sees at all — then the rest.
  const rank = (g: AccessGroup) => (g.key.startsWith("pages:") ? 0 : ["pricing", "ticket", "stock"].indexOf(g.key) + 1);
  return [...groups.values()].sort((x, y) => rank(x) - rank(y));
}

/** The settings that can apply to a group, counted, and how many it holds. */
export function accessSummary(audience: Audience, overrides: AccessOverrides): { allowed: number; total: number } {
  const caps = CAPABILITIES.filter((c) => appliesTo(c, audience));
  return { allowed: caps.filter((c) => audienceAllowed(c, audience, overrides)).length, total: caps.length };
}

/** The roles on the Role & Izin tab, administrator first. */
export const AUDIENCE_ORDER: readonly Audience[] = AUDIENCES;
