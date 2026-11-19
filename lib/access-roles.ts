import type { Role } from "@prisma/client";
import {
  AUDIENCES,
  CAPABILITIES,
  CAPABILITY_INFO,
  appliesTo,
  type Audience,
  type Capability,
} from "./access";

/**
 * Roles made in Pengguna & Akses → Role & Izin (owner, 2026-11-18;
 * docs/plan-rbac-dan-tema.md). A role is a name, a base type and the full list
 * of what it may open. The base type is one of the app's built-in roles and
 * keeps deciding *behaviour* — a technician holds tickets and earns points, a
 * kepala toko is bound to their stores — while the grants decide *access*.
 *
 * Pure: the server, the editor in the browser, the migration SQL and the tests
 * all read the same tables.
 */

/** The built-in roles a made role can be based on. Not Owner, Customer or Pending. */
export const ROLE_BASES = ["Administrator", "Technician", "Sales", "RMA", "StoreSupervisor", "StockAdmin", "Finance"] as const satisfies readonly Role[];
export type RoleBase = (typeof ROLE_BASES)[number];

export function isRoleBase(v: string): v is RoleBase {
  return (ROLE_BASES as readonly string[]).includes(v);
}

/** Which group of the per-capability tables a base type reads. */
export const BASE_AUDIENCE: Record<RoleBase, Audience> = {
  Administrator: "administrator",
  Technician: "technician",
  Sales: "sales",
  RMA: "rma",
  StoreSupervisor: "store_supervisor",
  StockAdmin: "stock_admin",
  Finance: "finance",
};

export const BASE_LABELS: Record<RoleBase, string> = {
  Administrator: "Admin",
  Technician: "Teknisi",
  Sales: "Sales",
  RMA: "RMA",
  StoreSupervisor: "Kepala Toko",
  StockAdmin: "Admin Stok",
  Finance: "Finance",
};

/** What each base type does, shown beside the picker. */
export const BASE_HINTS: Record<RoleBase, string> = {
  Administrator: "Portal admin, semua toko. Halaman yang terbuka mengikuti izin.",
  Technician: "Memegang dan mengerjakan tiket, punya poin, shift, dan target.",
  Sales: "Membuat tiket dan mengurus serah terima tiket yang ia pegang.",
  RMA: "Meja klaim garansi: memproses case dan ditunjuk sebagai PIC.",
  StoreSupervisor: "Terikat ke toko yang dipasangkan; semua datanya dari toko itu. Baca saja.",
  StockAdmin: "Memantau rakitan PC dan part keluar, semua toko. Baca saja.",
  Finance: "Klaim stok toko dan uang yang tertahan di vendor. Baca saja.",
};

/** Every capability a role of this base can hold, in the app's order. */
export function grantableFor(base: RoleBase): Capability[] {
  return CAPABILITIES.filter((c) => appliesTo(c, BASE_AUDIENCE[base]));
}

/** The starting set for a new role of this base: what the built-in role had by default. */
export function templateFor(base: RoleBase): Capability[] {
  const audience = BASE_AUDIENCE[base];
  return grantableFor(base).filter((c) => CAPABILITY_INFO[c].defaults.includes(audience));
}

/** A posted list, made safe to store: known, applicable to the base, once each, in order. */
export function cleanGrants(base: RoleBase, caps: Iterable<string>): Capability[] {
  const wanted = new Set(caps);
  return grantableFor(base).filter((c) => wanted.has(c));
}

/** What a holder of a role may do. A grant that no longer applies to the base is ignored. */
export function roleCan(base: RoleBase, grants: Iterable<string>): (capability: Capability) => boolean {
  const held = new Set(cleanGrants(base, grants));
  return (capability) => held.has(capability);
}

// ── The roles that existed before ──────────────────────────────────────────

export type SystemRole = {
  id: string;
  name: string;
  description: string;
  base: RoleBase;
  /** The old groups whose settings, together, become this role's grants. */
  audiences: Audience[];
};

/**
 * One role per old group, so moving to made roles changes nobody's access. A
 * coordinator or head technician was a technician with a flag, and gained the
 * union of both groups; they get a role holding exactly that union. The flags
 * stay on the account: they still decide behaviour (approving requests in
 * one's stores).
 */
export const SYSTEM_ROLES: readonly SystemRole[] = [
  { id: "role_admin", name: "Admin", base: "Administrator", audiences: ["administrator"], description: "Admin toko: mengelola tiket, akun, dan toko." },
  { id: "role_technician", name: "Teknisi", base: "Technician", audiences: ["technician"], description: "Mengerjakan tiket service, cleaning, upgrade, rakitan, dan klaim." },
  { id: "role_coordinator", name: "Koordinator Toko", base: "Technician", audiences: ["technician", "coordinator"], description: "Teknisi yang menyetujui permintaan tiket di toko yang dipegangnya." },
  { id: "role_head_technician", name: "Head Teknisi", base: "Technician", audiences: ["technician", "head_technician"], description: "Teknisi senior: melihat semua tiket dan mengelola harga service." },
  {
    id: "role_coordinator_head",
    name: "Koordinator & Head Teknisi",
    base: "Technician",
    audiences: ["technician", "coordinator", "head_technician"],
    description: "Koordinator toko yang juga Head Teknisi.",
  },
  { id: "role_sales", name: "Sales", base: "Sales", audiences: ["sales"], description: "Membuat tiket untuk customer dan memantau tiket yang ia pegang." },
  { id: "role_rma", name: "RMA", base: "RMA", audiences: ["rma"], description: "Meja klaim garansi: memverifikasi, mengirim ke vendor, dan menutup case." },
  { id: "role_store_supervisor", name: "Kepala Toko", base: "StoreSupervisor", audiences: ["store_supervisor"], description: "Memantau toko yang dipegangnya, baca saja." },
  { id: "role_stock_admin", name: "Admin Stok", base: "StockAdmin", audiences: ["stock_admin"], description: "Memantau rakitan PC dan part yang keluar, semua toko, baca saja." },
  { id: "role_finance", name: "Finance", base: "Finance", audiences: ["finance"], description: "Memantau klaim stok toko dan uang yang tertahan di vendor." },
];

/** The role an existing account moves to. Null for Owner, Customer and Pending. */
export function systemRoleIdFor(user: { role: string; is_team_leader?: boolean | null; is_head_technician?: boolean | null }): string | null {
  switch (user.role) {
    case "Administrator":
      return "role_admin";
    case "Technician":
      if (user.is_team_leader && user.is_head_technician) return "role_coordinator_head";
      if (user.is_team_leader) return "role_coordinator";
      if (user.is_head_technician) return "role_head_technician";
      return "role_technician";
    case "Sales":
      return "role_sales";
    case "RMA":
      return "role_rma";
    case "StoreSupervisor":
      return "role_store_supervisor";
    case "StockAdmin":
      return "role_stock_admin";
    case "Finance":
      return "role_finance";
    default:
      return null;
  }
}

// ── The migration's data step ──────────────────────────────────────────────

export const BACKFILL_BEGIN = "-- >>> access-role backfill: generated by accessRoleBackfillSql() in lib/access-roles.ts, do not edit by hand";
export const BACKFILL_END = "-- <<< access-role backfill";

const q = (s: string) => `'${s.replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
const rows = (values: string[][]) => values.map((v) => `(${v.map(q).join(", ")})`).join(",\n  ");

/**
 * The SQL that creates the roles above and their grants from the settings the
 * database holds *at the moment it runs* — the defaults below, minus every
 * AccessRule the owner turned off, plus every one turned on — and gives every
 * existing staff account its role. Same rule as `isAllowed` in lib/access.ts,
 * written as joins. Idempotent: a role that already holds grants is left as
 * it is (so a re-run never undoes the owner's later edits), and an account
 * that already has a role keeps it. The temporary tables name their collation:
 * left to the server default (utf8mb4_uca1400_ai_ci on 11.8) they cannot be
 * joined to the app's utf8mb4_unicode_ci tables ("Illegal mix of collations").
 */
export function accessRoleBackfillSql(): string {
  const audiences = AUDIENCES.filter((a) => a !== "owner");
  const applies = audiences.flatMap((a) => CAPABILITIES.filter((c) => appliesTo(c, a)).map((c) => [a, c]));
  const defaults = audiences.flatMap((a) =>
    CAPABILITIES.filter((c) => appliesTo(c, a) && CAPABILITY_INFO[c].defaults.includes(a)).map((c) => [a, c]),
  );
  const roleAudience = SYSTEM_ROLES.flatMap((r) => r.audiences.map((a) => [r.id, a, BASE_AUDIENCE[r.base]]));
  const roleRows = SYSTEM_ROLES.map((r) => `(${[r.id, r.name, r.description, r.base, "all"].map(q).join(", ")}, NOW(3), NOW(3))`).join(",\n  ");
  const cases: [string, string][] = [
    ["`role` = 'Administrator'", "role_admin"],
    ["`role` = 'Technician' AND `is_team_leader` = 1 AND `is_head_technician` = 1", "role_coordinator_head"],
    ["`role` = 'Technician' AND `is_team_leader` = 1", "role_coordinator"],
    ["`role` = 'Technician' AND `is_head_technician` = 1", "role_head_technician"],
    ["`role` = 'Technician'", "role_technician"],
    ["`role` = 'Sales'", "role_sales"],
    ["`role` = 'RMA'", "role_rma"],
    ["`role` = 'StoreSupervisor'", "role_store_supervisor"],
    ["`role` = 'StockAdmin'", "role_stock_admin"],
    ["`role` = 'Finance'", "role_finance"],
  ];
  return [
    BACKFILL_BEGIN,
    `INSERT IGNORE INTO \`AccessRole\` (\`id\`, \`name\`, \`description\`, \`base\`, \`location\`, \`created_at\`, \`updated_at\`) VALUES\n  ${roleRows};`,
    "CREATE TEMPORARY TABLE `_ar_applies` (`audience` VARCHAR(32) NOT NULL, `capability` VARCHAR(64) NOT NULL, PRIMARY KEY (`audience`, `capability`)) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;",
    `INSERT INTO \`_ar_applies\` (\`audience\`, \`capability\`) VALUES\n  ${rows(applies)};`,
    "CREATE TEMPORARY TABLE `_ar_allowed` (`audience` VARCHAR(32) NOT NULL, `capability` VARCHAR(64) NOT NULL, PRIMARY KEY (`audience`, `capability`)) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;",
    `INSERT INTO \`_ar_allowed\` (\`audience\`, \`capability\`) VALUES\n  ${rows(defaults)};`,
    "DELETE `al` FROM `_ar_allowed` `al` JOIN `AccessRule` `r` ON `r`.`audience` = `al`.`audience` AND `r`.`capability` = `al`.`capability` WHERE `r`.`allowed` = 0;",
    "INSERT IGNORE INTO `_ar_allowed` (`audience`, `capability`) SELECT `r`.`audience`, `r`.`capability` FROM `AccessRule` `r` JOIN `_ar_applies` `p` ON `p`.`audience` = `r`.`audience` AND `p`.`capability` = `r`.`capability` WHERE `r`.`allowed` = 1;",
    "CREATE TEMPORARY TABLE `_ar_role_audience` (`role_id` VARCHAR(64) NOT NULL, `audience` VARCHAR(32) NOT NULL, `base_audience` VARCHAR(32) NOT NULL, PRIMARY KEY (`role_id`, `audience`)) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;",
    `INSERT INTO \`_ar_role_audience\` (\`role_id\`, \`audience\`, \`base_audience\`) VALUES\n  ${rows(roleAudience)};`,
    [
      "INSERT IGNORE INTO `AccessRoleGrant` (`role_id`, `capability`)",
      "SELECT DISTINCT `ra`.`role_id`, `al`.`capability` FROM `_ar_role_audience` `ra`",
      "JOIN `_ar_allowed` `al` ON `al`.`audience` = `ra`.`audience`",
      "JOIN `_ar_applies` `bp` ON `bp`.`audience` = `ra`.`base_audience` AND `bp`.`capability` = `al`.`capability`",
      "WHERE NOT EXISTS (SELECT 1 FROM `AccessRoleGrant` `g` WHERE `g`.`role_id` = `ra`.`role_id`);",
    ].join("\n"),
    [
      "UPDATE `User` SET `access_role_id` = CASE",
      ...cases.map(([when, id]) => `  WHEN ${when} THEN ${q(id)}`),
      "END",
      "WHERE `access_role_id` IS NULL AND `role` IN ('Administrator', 'Technician', 'Sales', 'RMA', 'StoreSupervisor', 'StockAdmin', 'Finance');",
    ].join("\n"),
    "DROP TEMPORARY TABLE `_ar_role_audience`;",
    "DROP TEMPORARY TABLE `_ar_allowed`;",
    "DROP TEMPORARY TABLE `_ar_applies`;",
    BACKFILL_END,
  ].join("\n");
}

// ── The account form's Role select ─────────────────────────────────────────

export type RoleOption = { value: string; label: string; base: Role };

/**
 * The Role select of the account form: made roles by name (A–Z), then the
 * three that are not made roles. Each option knows its base, so the form can
 * show the technician fields for any technician-based role. `allowed` decides
 * which the person filling it in may give (lib/admin-roles mayManageAccount).
 */
export function roleSelectOptions(
  roles: readonly { id: string; name: string; base: RoleBase }[],
  allowed: (base: Role) => boolean,
  current?: { value: string; label: string; base: Role } | null,
): RoleOption[] {
  const made = roles.map((r) => ({ value: r.id, label: r.name, base: r.base as Role }));
  const plain: RoleOption[] = [
    { value: "Pending", label: "Menunggu role", base: "Pending" },
    { value: "Owner", label: "Owner", base: "Owner" },
    { value: "Customer", label: "Customer", base: "Customer" },
  ];
  const options = [...made, ...plain].filter((o) => allowed(o.base));
  if (current && !options.some((o) => o.value === current.value)) options.unshift(current);
  return options;
}
