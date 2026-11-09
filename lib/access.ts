/**
 * What each group of staff may see and change: service pricing, correcting a
 * ticket's intake data, and which warehouses' stock they see.
 *
 * The owner sets this in Admin → Pengaturan Akses. The defaults below apply
 * until a setting is changed; a changed one is an AccessRule row. Pure: the
 * server reads the rows and calls `isAllowed`, the settings page renders from
 * the same tables, and the tests need no database.
 *
 * Administrators always may — the column is fixed on the settings page — so
 * nobody can lock the owner out of the page that grants access.
 */

export const AUDIENCES = [
  "administrator",
  "coordinator",
  "head_technician",
  "technician",
  "sales",
  "rma",
  "store_supervisor",
] as const;
export type Audience = (typeof AUDIENCES)[number];

export const AUDIENCE_LABELS: Record<Audience, string> = {
  administrator: "Admin",
  coordinator: "Koordinator Toko",
  head_technician: "Head Teknisi",
  technician: "Teknisi",
  sales: "Sales",
  rma: "RMA",
  store_supervisor: "Kepala Toko",
};

/**
 * Which warehouses' stock a group may see — one capability per warehouse
 * (owner, 2026-11-07: "cuman admin yang bisa lihat dan kasih aksesnya"). GRIYA
 * and GUDANG BATAM start as Admin only; the shop's own warehouses as before.
 * Which Accurate warehouse each one is lives in lib/catalog/items.ts.
 */
export const STOCK_CAPABILITIES = [
  "view_stock_utama",
  "view_stock_nagoyahill",
  "view_stock_gateway",
  "view_stock_klaim",
  "view_stock_batam",
  "view_stock_griya",
] as const;
export type StockCapability = (typeof STOCK_CAPABILITIES)[number];
export function isStockCapability(v: string): v is StockCapability {
  return (STOCK_CAPABILITIES as readonly string[]).includes(v);
}

export const CAPABILITIES = [
  "view_cost",
  "edit_cost",
  "edit_price",
  "view_margin",
  "view_finance_report",
  "print_invoice",
  "manage_vendors",
  "manage_service_jobs",
  "edit_ticket",
  ...STOCK_CAPABILITIES,
] as const;
export type Capability = (typeof CAPABILITIES)[number];

const SENIOR: Audience[] = ["administrator", "coordinator", "head_technician"];
const ALL_STAFF: Audience[] = ["administrator", "coordinator", "head_technician", "technician", "sales", "rma", "store_supervisor"];

export type CapabilitySection = "pricing" | "ticket" | "stock";
export const CAPABILITY_SECTIONS: Record<CapabilitySection, { title: string; hint: string }> = {
  pricing: { title: "Harga & Data Master", hint: "Siapa yang boleh melihat dan mengubah harga service." },
  ticket: {
    title: "Tiket",
    hint: "Memperbaiki data tiket yang salah input. Setiap perubahan tercatat di Log Aktivitas beserta isi sebelumnya.",
  },
  stock: {
    title: "Stok Gudang",
    hint: "Stok gudang mana yang tampil di pencarian barang, laporan, dan halaman RMA. Gudang yang tidak dicentang tidak dikirim ke browser sama sekali, dan tidak ikut dihitung di stok total.",
  },
};

export const CAPABILITY_INFO: Record<
  Capability,
  { label: string; hint: string; defaults: Audience[]; section?: CapabilitySection }
> = {
  view_cost: {
    label: "Lihat harga modal",
    hint: "Harga beli dari vendor/supplier.",
    defaults: SENIOR,
  },
  edit_cost: {
    label: "Isi / ubah harga modal",
    hint: "Selama harga beli belum tersedia dari Accurate, harga modal diisi manual. Perlu juga akses Lihat harga modal.",
    defaults: SENIOR,
  },
  edit_price: {
    label: "Isi harga jual / markup",
    hint: "Harga yang ditagihkan ke customer.",
    defaults: [...SENIOR, "technician"],
  },
  view_margin: {
    label: "Lihat margin",
    hint: "Selisih harga jual dan harga modal. Hanya tampil bagi yang juga boleh melihat harga modal — margin dan total bersama-sama membuka harga modal.",
    defaults: SENIOR,
  },
  view_finance_report: {
    label: "Lihat laporan keuangan service",
    hint: "Pendapatan, modal dan margin per periode.",
    defaults: SENIOR,
  },
  print_invoice: {
    label: "Cetak faktur service",
    hint: "Ringkasan tagihan untuk customer — hanya harga jual.",
    defaults: [...SENIOR, "technician", "sales"],
  },
  manage_vendors: {
    label: "Kelola daftar vendor",
    hint: "Tambah, ubah dan nonaktifkan vendor: supplier part, service eksternal dan vendor klaim garansi.",
    // RMA too: the desk is who knows which distributor takes which brand's claims.
    defaults: [...SENIOR, "rma"],
  },
  manage_service_jobs: {
    label: "Kelola Daftar Jasa",
    hint: "Tambah jasa, ubah harga default dan poin, nonaktifkan. Poin dan jumlah jasa jadi ukuran target teknisi.",
    defaults: SENIOR,
  },
  edit_ticket: {
    label: "Ubah data tiket",
    hint: "Nama unit (dari katalog atau ketik), SN, kelengkapan, kondisi unit, dan data customer — di tiket mana pun, status apa pun.",
    defaults: ["administrator"],
    section: "ticket",
  },
  view_stock_utama: { label: "Lihat stok Gudang Utama", hint: "Ikut dihitung di stok total.", defaults: ALL_STAFF, section: "stock" },
  view_stock_nagoyahill: { label: "Lihat stok Nagoyahill", hint: "Stok toko NGH.", defaults: ALL_STAFF, section: "stock" },
  view_stock_gateway: { label: "Lihat stok Gateway", hint: "Stok toko NGW.", defaults: ALL_STAFF, section: "stock" },
  view_stock_klaim: {
    label: "Lihat stok gudang klaim",
    hint: "Klaim Garansi dan Klaim Pemasok, di halaman case RMA. Tidak dihitung di stok total.",
    defaults: ["administrator", "rma"],
    section: "stock",
  },
  view_stock_batam: {
    label: "Lihat stok Gudang Batam",
    hint: "Terbatas — bawaannya hanya Admin.",
    defaults: ["administrator"],
    section: "stock",
  },
  view_stock_griya: {
    label: "Lihat stok Griya",
    hint: "Terbatas — bawaannya hanya Admin.",
    defaults: ["administrator"],
    section: "stock",
  },
};

export function isCapability(v: string): v is Capability {
  return (CAPABILITIES as readonly string[]).includes(v);
}
export function isAudience(v: string): v is Audience {
  return (AUDIENCES as readonly string[]).includes(v);
}

/** Every group a user belongs to. A coordinator is also a technician, and so on. */
export function audiencesOf(user: {
  role: string;
  is_team_leader?: boolean | null;
  is_head_technician?: boolean | null;
}): Audience[] {
  switch (user.role) {
    case "Administrator":
      return ["administrator"];
    case "Technician": {
      const groups: Audience[] = ["technician"];
      if (user.is_team_leader) groups.push("coordinator");
      if (user.is_head_technician) groups.push("head_technician");
      return groups;
    }
    case "Sales":
      return ["sales"];
    case "RMA":
      return ["rma"];
    case "StoreSupervisor":
      return ["store_supervisor"];
    default:
      return [];
  }
}

export type AccessOverrides = ReadonlyMap<string, boolean>;
export const ruleKey = (capability: Capability, audience: Audience) => `${capability}:${audience}`;

/** Whether one group may, given the owner's changes over the defaults. */
export function audienceAllowed(capability: Capability, audience: Audience, overrides: AccessOverrides): boolean {
  if (audience === "administrator") return true;
  const changed = overrides.get(ruleKey(capability, audience));
  return changed ?? CAPABILITY_INFO[capability].defaults.includes(audience);
}

/** Whether a user may: any of their groups being allowed is enough. */
export function isAllowed(capability: Capability, audiences: Audience[], overrides: AccessOverrides): boolean {
  return audiences.some((a) => audienceAllowed(capability, a, overrides));
}
