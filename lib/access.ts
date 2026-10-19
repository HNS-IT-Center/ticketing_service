/**
 * What each group of staff may see and change in service pricing.
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
] as const;
export type Audience = (typeof AUDIENCES)[number];

export const AUDIENCE_LABELS: Record<Audience, string> = {
  administrator: "Admin",
  coordinator: "Koordinator Toko",
  head_technician: "Head Teknisi",
  technician: "Teknisi",
  sales: "Sales",
  rma: "RMA",
};

export const CAPABILITIES = [
  "view_cost",
  "edit_cost",
  "edit_price",
  "view_margin",
  "view_finance_report",
  "print_invoice",
  "manage_vendors",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

const SENIOR: Audience[] = ["administrator", "coordinator", "head_technician"];

export const CAPABILITY_INFO: Record<Capability, { label: string; hint: string; defaults: Audience[] }> = {
  view_cost: {
    label: "Lihat harga modal",
    hint: "Harga beli dari vendor/supplier.",
    defaults: SENIOR,
  },
  edit_cost: {
    label: "Isi / ubah harga modal",
    hint: "Selama harga beli belum tersedia dari Accurate, harga modal diisi manual.",
    defaults: SENIOR,
  },
  edit_price: {
    label: "Isi harga jual / markup",
    hint: "Harga yang ditagihkan ke customer.",
    defaults: [...SENIOR, "technician"],
  },
  view_margin: {
    label: "Lihat margin",
    hint: "Selisih harga jual dan harga modal.",
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
    hint: "Tambah, ubah dan nonaktifkan vendor/supplier.",
    defaults: SENIOR,
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
