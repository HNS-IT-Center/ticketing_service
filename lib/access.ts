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
  "stock_admin",
  "finance",
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
  stock_admin: "Admin Stok",
  finance: "Finance",
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

/**
 * Which pages a group may open — one capability per page, and the sidebar
 * shows exactly what a person may open (owner, 2026-11-11: "pakai RBAC saja").
 * The defaults are who could open each page before this existed, so turning
 * it on changed nobody's menu. Pages whose data belongs to the viewer — a
 * technician's own tickets, a sales person's — are not here: they come with
 * the role. Users, Stores and these settings stay Administrator only.
 */
export const PAGE_CAPABILITIES = [
  "page_tickets_all",
  "page_create_ticket",
  "page_rma_dashboard",
  "page_rma_claims",
  "page_rma_analysis",
  "page_toko_dashboard",
  "page_toko_tickets",
  "page_toko_followups",
  "page_toko_claims",
  "page_toko_performance",
  "page_toko_schedule",
  "page_toko_team",
  "page_stock_dashboard",
  "page_stock_builds",
  "page_stock_parts",
  "page_finance_vendors",
  "page_finance_claims",
  "page_performance",
  "page_tech_targets",
  "page_leaderboard",
  "page_parts_report",
  "page_log_ticket",
  "page_log_rma",
  "page_log_activity",
] as const;
export type PageCapability = (typeof PAGE_CAPABILITIES)[number];

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
  ...PAGE_CAPABILITIES,
] as const;
export type Capability = (typeof CAPABILITIES)[number];

const SENIOR: Audience[] = ["administrator", "coordinator", "head_technician"];
const ALL_STAFF: Audience[] = ["administrator", "coordinator", "head_technician", "technician", "sales", "rma", "store_supervisor", "stock_admin", "finance"];

export type CapabilitySection = "pricing" | "ticket" | "stock" | "pages";
export const CAPABILITY_SECTIONS: Record<CapabilitySection, { title: string; hint: string }> = {
  pricing: { title: "Harga & Data Master", hint: "Siapa yang boleh melihat dan mengubah harga service." },
  ticket: {
    title: "Tiket",
    hint: "Memperbaiki data tiket yang salah input. Setiap perubahan tercatat di Log Aktivitas beserta isi sebelumnya.",
  },
  pages: {
    title: "Halaman & Menu",
    hint: "Halaman mana yang boleh dibuka; menu di sidebar mengikuti. Membuka halaman tidak memberi hak mengubah data di dalamnya — itu tetap mengikuti aturan masing-masing. Kotak abu-abu tidak berlaku untuk kelompok itu (mis. halaman Kepala Toko terikat ke toko yang dipegangnya).",
  },
  stock: {
    title: "Stok Gudang",
    hint: "Stok gudang mana yang tampil di pencarian barang, laporan, dan halaman RMA. Gudang yang tidak dicentang tidak dikirim ke browser sama sekali, dan tidak ikut dihitung di stok total.",
  },
};

const TECHNICIANS: Audience[] = ["technician", "coordinator", "head_technician"];
const KEPALA_TOKO: Audience[] = ["store_supervisor"];
const page = (label: string, hint: string, defaults: Audience[], appliesTo?: Audience[]) => ({
  label,
  hint,
  defaults: ["administrator" as Audience, ...defaults],
  section: "pages" as const,
  ...(appliesTo ? { appliesTo: ["administrator" as Audience, ...appliesTo] } : {}),
});

const PAGE_INFO: Record<PageCapability, ReturnType<typeof page>> = {
  page_tickets_all: page(
    "Tiket · Semua Tiket",
    "Daftar semua tiket, detailnya, dan export Excel. Head Teknisi membuka detailnya di portal teknisi; selain itu detail tampil baca saja. Kepala Toko hanya melihat toko yang dipegangnya.",
    ["head_technician"],
  ),
  page_create_ticket: page("Tiket · Buat Tiket", "Form tiket baru di portal masing-masing.", [...TECHNICIANS, "sales", "rma"], [...TECHNICIANS, "sales", "rma"]),
  page_rma_dashboard: page("Klaim & RMA · Dashboard RMA", "Antrian case RMA dan halaman case. Tombol proses case tetap hanya untuk RMA dan Admin.", ["rma"]),
  page_rma_claims: page("Klaim & RMA · Tiket Klaim", "Daftar klaim garansi beserta tahap RMA-nya, dan export Excel.", ["rma"]),
  page_rma_analysis: page("Klaim & RMA · Analisa Klaim", "Klaim per brand, jenis barang dan model.", ["rma"]),
  page_toko_dashboard: page("Toko · Dashboard Toko", "Dashboard toko yang dipegang.", KEPALA_TOKO, KEPALA_TOKO),
  page_toko_tickets: page("Toko · Tiket Toko", "Tiket toko yang dipegang, baca saja, dan export Excel.", KEPALA_TOKO, KEPALA_TOKO),
  page_toko_followups: page("Toko · Tindak Lanjut", "Tiket yang perlu ditindaklanjuti di toko yang dipegang.", KEPALA_TOKO, KEPALA_TOKO),
  page_toko_claims: page("Toko · Klaim Garansi", "Klaim garansi toko yang dipegang.", KEPALA_TOKO, KEPALA_TOKO),
  page_toko_performance: page("Toko · Kinerja Teknisi", "Kinerja teknisi toko yang dipegang.", KEPALA_TOKO, KEPALA_TOKO),
  page_toko_schedule: page("Toko · Jadwal Teknisi", "Jadwal teknisi toko yang dipegang.", KEPALA_TOKO, KEPALA_TOKO),
  page_toko_team: page("Toko · Daftar User", "Teknisi dan kepala toko di toko yang dipegang.", KEPALA_TOKO, KEPALA_TOKO),
  page_stock_dashboard: page("Stok · Dashboard Stok", "Ringkasan rakitan PC dan part keluar.", ["stock_admin"]),
  page_stock_builds: page("Stok · Rakitan PC", "Semua rakitan PC per tahap, dengan quotation dan foto.", ["stock_admin"]),
  page_stock_parts: page("Stok · Part Keluar", "Part yang keluar dari service, upgrade dan rakitan, dengan foto, dan export Excel.", ["stock_admin"]),
  page_finance_vendors: page("Keuangan · Kinerja Vendor Klaim", "Lama tiap vendor memproses klaim stok toko.", ["finance"]),
  page_finance_claims: page("Keuangan · Klaim Stok Toko", "Daftar klaim stok toko dan export Excel.", ["finance"]),
  page_performance: page("Kinerja · Performance", "Laporan kinerja teknisi per periode.", []),
  page_tech_targets: page("Kinerja · Target Teknisi", "Target dan capaian teknisi per bulan. Mengubah target tetap hanya Admin.", []),
  page_leaderboard: page("Kinerja · Leaderboard", "Peringkat teknisi dan toko.", TECHNICIANS),
  page_parts_report: page("Kinerja · Laporan Part", "Part yang dipakai, yang sering dipakai, dan yang di luar katalog.", []),
  page_log_ticket: page("Log · Tiket", "Riwayat perubahan status tiket.", []),
  page_log_rma: page("Log · RMA", "Setiap langkah case RMA.", ["rma"]),
  page_log_activity: page("Log · Aktivitas", "Siapa melakukan apa: login, perubahan data, export.", []),
};

export const CAPABILITY_INFO: Record<
  Capability,
  {
    label: string;
    hint: string;
    defaults: Audience[];
    section?: CapabilitySection;
    /**
     * The only groups the setting can apply to; for the rest it is always off
     * and its box is disabled. For pages that only make sense for one role.
     */
    appliesTo?: Audience[];
  }
> = {
  view_cost: {
    label: "Lihat harga modal",
    hint: "Harga beli dari vendor/supplier, dan HPP Accurate untuk nilai stok yang tertahan di klaim.",
    // Finance too: the money held in store-stock claims is valued at harga modal.
    defaults: [...SENIOR, "finance"],
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
  ...PAGE_INFO,
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
    case "StockAdmin":
      return ["stock_admin"];
    case "Finance":
      return ["finance"];
    default:
      return [];
  }
}

export type AccessOverrides = ReadonlyMap<string, boolean>;
export const ruleKey = (capability: Capability, audience: Audience) => `${capability}:${audience}`;

/** Whether one group may, given the owner's changes over the defaults. */
export function audienceAllowed(capability: Capability, audience: Audience, overrides: AccessOverrides): boolean {
  if (audience === "administrator") return true;
  if (!appliesTo(capability, audience)) return false;
  const changed = overrides.get(ruleKey(capability, audience));
  return changed ?? CAPABILITY_INFO[capability].defaults.includes(audience);
}

/** Whether a setting can be switched on for a group at all (see `appliesTo`). */
export function appliesTo(capability: Capability, audience: Audience): boolean {
  const only = CAPABILITY_INFO[capability].appliesTo;
  return !only || only.includes(audience);
}

/** Whether a user may: any of their groups being allowed is enough. */
export function isAllowed(capability: Capability, audiences: Audience[], overrides: AccessOverrides): boolean {
  return audiences.some((a) => audienceAllowed(capability, a, overrides));
}
