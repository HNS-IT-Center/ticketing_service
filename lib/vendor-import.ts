/**
 * Loading the shop's vendor list (prisma/data/vendors.ts) into the vendor
 * table — shared by the seed and `npm run import:vendors`.
 *
 * Safe on production and safe to run again:
 * - a name not on the table is created with the list's roles, location and
 *   contact — unless one of its `formerly` names is there, which is renamed;
 * - a name already there (case-insensitive, whitespace collapsed — how the
 *   unique index and the vendor forms compare names) keeps its spelling and
 *   active flag, and is brought to the list's roles, location and contact. The
 *   roles are set exactly: the list's kind says what a vendor is used for, so a
 *   role it does not name is taken away (owner, 2026-11-04). Bills and cases
 *   that already name the vendor keep it — the roles gate only new picks;
 * - nothing is deleted or reactivated, and a contact the list leaves blank is
 *   left as it is.
 *
 * Run it dry first: every change, a removed role included, is listed.
 */
import type { PrismaClient } from "@prisma/client";
import type { VendorKind, VendorListEntry } from "../prisma/data/vendors";
import {
  VENDOR_ROLE_INFO,
  VENDOR_ROLES,
  vendorLocationFromCode,
  vendorLocationText,
  type VendorLocation,
  type VendorRoles,
} from "./vendors";

export type { VendorListEntry };

export type ExistingVendor = VendorRoles & {
  id: string;
  name: string;
  location: VendorLocation | null;
  contact: string | null;
  is_active: boolean;
};

type VendorData = Partial<VendorRoles> & { name?: string; location?: VendorLocation; contact?: string };

export type VendorImportPlan = {
  create: (VendorRoles & { name: string; location: VendorLocation; contact: string | null })[];
  update: { id: string; name: string; data: VendorData; changes: string[] }[];
  unchanged: string[];
  /** On the table but deactivated: still updated, deliberately not reactivated. */
  inactive: string[];
  /** Lines of the list that could not be read; skipped. */
  invalid: string[];
};

/** What each kind on the list is used for — the list's third column. */
export function rolesForKind(kind: VendorKind): VendorRoles {
  switch (kind) {
    case "claim":
      return { supplies_parts: false, repairs: false, handles_claims: true };
    case "service_center":
      return { supplies_parts: false, repairs: true, handles_claims: true };
    case "parts":
      return { supplies_parts: true, repairs: false, handles_claims: false };
    case "external":
      return { supplies_parts: false, repairs: true, handles_claims: false };
    default: {
      const _exhaustive: never = kind;
      throw new Error(`Unknown vendor kind: ${String(_exhaustive)}`);
    }
  }
}

export const cleanName = (name: string) => name.trim().replace(/\s+/g, " ");
const key = (name: string) => cleanName(name).toLowerCase();

/** A phone number written 62… is stored +62…, the project's phone format; anything else as written. */
export function cleanContact(contact: string | undefined): string | null {
  const c = (contact ?? "").trim();
  if (!c) return null;
  return /^62\d+$/.test(c) ? `+${c}` : c;
}

export function planVendorImport(list: readonly VendorListEntry[], existing: readonly ExistingVendor[]): VendorImportPlan {
  const plan: VendorImportPlan = { create: [], update: [], unchanged: [], inactive: [], invalid: [] };
  const byKey = new Map(existing.map((v) => [key(v.name), v]));
  const listed = new Set(list.map((e) => key(e.name)));
  const seen = new Set<string>();
  const taken = new Set<string>(); // table rows already matched by an earlier line

  for (const entry of list) {
    const name = cleanName(entry.name);
    const location = vendorLocationFromCode(entry.location);
    if (name.length < 2 || !location) {
      plan.invalid.push(`${entry.name || "(tanpa nama)"} — ${location ? "nama terlalu pendek" : `lokasi "${entry.location}" bukan LKL/ITR`}`);
      continue;
    }
    if (seen.has(key(name))) continue; // listed twice: the first line wins
    seen.add(key(name));

    const roles = rolesForKind(entry.kind);
    const contact = cleanContact(entry.contact);

    let found = byKey.get(key(name));
    let renameFrom: string | null = null;
    if (!found) {
      // A former name is taken over only when nobody else on the list claims it.
      const former = (entry.formerly ?? [])
        .map((f) => byKey.get(key(f)))
        .find((v) => v && !taken.has(v.id) && !listed.has(key(v.name)));
      if (former) {
        found = former;
        renameFrom = former.name;
      }
    }
    if (!found) {
      plan.create.push({ name, location, contact, ...roles });
      continue;
    }
    taken.add(found.id);
    if (!found.is_active) plan.inactive.push(found.name);

    const data: VendorData = {};
    const changes: string[] = [];
    if (renameFrom) {
      data.name = name;
      changes.push(`nama "${renameFrom}" → "${name}"`);
    }
    const added = VENDOR_ROLES.filter((r) => roles[r] && !found[r]);
    const removed = VENDOR_ROLES.filter((r) => !roles[r] && found[r]);
    for (const r of [...added, ...removed]) data[r] = roles[r];
    if (added.length + removed.length > 0) {
      const parts = [
        ...added.map((r) => `+ ${VENDOR_ROLE_INFO[r].label}`),
        ...removed.map((r) => `− ${VENDOR_ROLE_INFO[r].label}`),
      ];
      changes.push(`peran ${parts.join(", ")}`);
    }
    if (found.location !== location) {
      data.location = location;
      changes.push(`lokasi ${vendorLocationText(found.location) ?? "kosong"} → ${vendorLocationText(location)}`);
    }
    if (contact && (found.contact ?? "").trim() !== contact) {
      data.contact = contact;
      changes.push(`kontak ${found.contact?.trim() || "kosong"} → ${contact}`);
    }
    if (changes.length === 0) plan.unchanged.push(found.name);
    else plan.update.push({ id: found.id, name: renameFrom ?? found.name, data, changes });
  }
  return plan;
}

/** Reads the table, plans, and — when `apply` — writes the plan. */
export async function importVendors(
  db: PrismaClient,
  list: readonly VendorListEntry[],
  { apply }: { apply: boolean }
): Promise<VendorImportPlan> {
  const existing = await db.vendor.findMany({
    select: {
      id: true,
      name: true,
      supplies_parts: true,
      repairs: true,
      handles_claims: true,
      location: true,
      contact: true,
      is_active: true,
    },
  });
  const plan = planVendorImport(list, existing);
  if (!apply) return plan;

  await db.$transaction([
    ...plan.update.map((v) => db.vendor.update({ where: { id: v.id }, data: v.data })),
    ...plan.create.map((v) => db.vendor.create({ data: v })),
  ]);
  return plan;
}

/** The plan as lines for a terminal. */
export function describeVendorImport(plan: VendorImportPlan): string[] {
  const lines = [
    `  baru        : ${plan.create.length}`,
    `  diperbarui  : ${plan.update.length}`,
    `  sudah sesuai: ${plan.unchanged.length}`,
  ];
  for (const v of plan.create) {
    const roles = VENDOR_ROLES.filter((r) => v[r]).map((r) => VENDOR_ROLE_INFO[r].label);
    lines.push(`    + ${v.name} — ${vendorLocationText(v.location)}, ${roles.join(" + ")}${v.contact ? `, ${v.contact}` : ""}`);
  }
  for (const v of plan.update) lines.push(`    ~ ${v.name} — ${v.changes.join("; ")}`);
  for (const name of plan.inactive) lines.push(`    ! ${name} — nonaktif di Daftar Vendor, tidak diaktifkan ulang`);
  for (const line of plan.invalid) lines.push(`    ? dilewati: ${line}`);
  return lines;
}
