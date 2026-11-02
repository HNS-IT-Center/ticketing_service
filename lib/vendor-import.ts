/**
 * Loading the shop's claim-vendor list (prisma/data/claim-vendors.ts) into the
 * vendor table — shared by the seed and `npm run import:vendors`.
 *
 * Additive by design, so it is safe on production and safe to run again:
 * - a name not on the table is created as a claim vendor with its location;
 * - a name already there (case-insensitive, whitespace collapsed — how the
 *   unique index and the vendor forms compare names) keeps its spelling, its
 *   other roles, contact and active flag; it only gains `handles_claims` and
 *   the list's location;
 * - nothing is deleted, renamed or reactivated.
 */
import type { PrismaClient } from "@prisma/client";
import { vendorLocationFromCode, vendorLocationText, type VendorLocation } from "./vendors";

export type VendorListEntry = { name: string; location: string };

export type ExistingVendor = {
  id: string;
  name: string;
  handles_claims: boolean;
  location: VendorLocation | null;
  is_active: boolean;
};

export type VendorImportPlan = {
  create: { name: string; location: VendorLocation }[];
  update: {
    id: string;
    name: string;
    data: { handles_claims?: true; location?: VendorLocation };
    changes: string[];
  }[];
  unchanged: string[];
  /** On the table but deactivated: still updated, deliberately not reactivated. */
  inactive: string[];
  /** Lines of the list that could not be read; skipped. */
  invalid: string[];
};

export const cleanName = (name: string) => name.trim().replace(/\s+/g, " ");
const key = (name: string) => cleanName(name).toLowerCase();

export function planVendorImport(list: readonly VendorListEntry[], existing: readonly ExistingVendor[]): VendorImportPlan {
  const plan: VendorImportPlan = { create: [], update: [], unchanged: [], inactive: [], invalid: [] };
  const byKey = new Map(existing.map((v) => [key(v.name), v]));
  const seen = new Set<string>();

  for (const entry of list) {
    const name = cleanName(entry.name);
    const location = vendorLocationFromCode(entry.location);
    if (name.length < 2 || !location) {
      plan.invalid.push(`${entry.name || "(tanpa nama)"} — ${location ? "nama terlalu pendek" : `lokasi "${entry.location}" bukan LKL/ITR`}`);
      continue;
    }
    if (seen.has(key(name))) continue; // listed twice: the first line wins
    seen.add(key(name));

    const found = byKey.get(key(name));
    if (!found) {
      plan.create.push({ name, location });
      continue;
    }
    if (!found.is_active) plan.inactive.push(found.name);

    const data: VendorImportPlan["update"][number]["data"] = {};
    const changes: string[] = [];
    if (!found.handles_claims) {
      data.handles_claims = true;
      changes.push("ditandai menerima klaim");
    }
    if (found.location !== location) {
      data.location = location;
      changes.push(`lokasi ${vendorLocationText(found.location) ?? "kosong"} → ${vendorLocationText(location)}`);
    }
    if (changes.length === 0) plan.unchanged.push(found.name);
    else plan.update.push({ id: found.id, name: found.name, data, changes });
  }
  return plan;
}

/** Reads the table, plans, and — when `apply` — writes the plan. */
export async function importClaimVendors(
  db: PrismaClient,
  list: readonly VendorListEntry[],
  { apply }: { apply: boolean }
): Promise<VendorImportPlan> {
  const existing = await db.vendor.findMany({
    select: { id: true, name: true, handles_claims: true, location: true, is_active: true },
  });
  const plan = planVendorImport(list, existing);
  if (!apply) return plan;

  await db.$transaction([
    ...plan.create.map((v) =>
      db.vendor.create({ data: { name: v.name, location: v.location, handles_claims: true } })
    ),
    ...plan.update.map((v) => db.vendor.update({ where: { id: v.id }, data: v.data })),
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
  for (const v of plan.create) lines.push(`    + ${v.name} — ${vendorLocationText(v.location)}`);
  for (const v of plan.update) lines.push(`    ~ ${v.name} — ${v.changes.join(", ")}`);
  for (const name of plan.inactive) lines.push(`    ! ${name} — nonaktif di Daftar Vendor, tidak diaktifkan ulang`);
  for (const line of plan.invalid) lines.push(`    ? dilewati: ${line}`);
  return lines;
}
