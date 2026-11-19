import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { db } = await import("@/lib/db");
const { CAPABILITIES, audiencesOf, isAllowed } = await import("./access");
const { SYSTEM_ROLES, accessRoleBackfillSql, isRoleBase, roleCan, systemRoleIdFor } = await import("./access-roles");

/**
 * The guarantee the migration rests on (docs/plan-rbac-dan-tema.md): for every
 * account, what it may do after the move to roles equals what it might do
 * before — including whatever the owner had changed in the old settings.
 * Runs the migration's own data step against this machine's database with
 * deliberately awkward settings, then puts everything back.
 */

const RUN = `arm${Date.now().toString(36)}`;
const SYSTEM_IDS = SYSTEM_ROLES.map((r) => r.id);

type Saved = {
  rules: { capability: string; audience: string; allowed: boolean }[];
  grants: { role_id: string; capability: string }[];
  users: { id: string; access_role_id: string | null }[];
};
let saved: Saved;

const OVERRIDES: [string, string, boolean][] = [
  ["view_cost", "administrator", false], // the owner narrowed Admin
  ["page_log_activity", "administrator", false],
  ["page_rma_claims", "technician", true], // widened technicians
  ["edit_price", "technician", false],
  ["view_cost", "coordinator", true],
  ["page_log_activity", "head_technician", true],
  ["print_invoice", "sales", false],
  ["page_tickets_all", "store_supervisor", true],
  ["view_stock_griya", "finance", true],
  ["page_toko_dashboard", "technician", true], // cannot apply: must be ignored
  ["no_such_capability", "sales", true], // unknown: must be ignored
];

const FIXTURES = [
  { key: "admin", role: "Administrator" },
  { key: "tech", role: "Technician" },
  { key: "coord", role: "Technician", is_team_leader: true },
  { key: "head", role: "Technician", is_head_technician: true },
  { key: "both", role: "Technician", is_team_leader: true, is_head_technician: true },
  { key: "sales", role: "Sales" },
  { key: "rma", role: "RMA" },
  { key: "spv", role: "StoreSupervisor" },
  { key: "stock", role: "StockAdmin" },
  { key: "fin", role: "Finance" },
  { key: "owner", role: "Owner" },
  { key: "pending", role: "Pending" },
] as const;

async function runBackfill() {
  const statements = accessRoleBackfillSql()
    .split("\n")
    .filter((l) => !l.startsWith("--"))
    .join("\n")
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
  // One connection: the step uses temporary tables.
  await db.$transaction(async (tx) => {
    for (const s of statements) await tx.$executeRawUnsafe(s);
  });
}

beforeAll(async () => {
  saved = {
    rules: await db.accessRule.findMany({ select: { capability: true, audience: true, allowed: true } }),
    grants: await db.accessRoleGrant.findMany({ where: { role_id: { in: SYSTEM_IDS } }, select: { role_id: true, capability: true } }),
    users: await db.user.findMany({ select: { id: true, access_role_id: true } }),
  };
  for (const f of FIXTURES) {
    await db.user.create({
      data: {
        name: `${RUN} ${f.key}`,
        email: `${RUN}.${f.key}@qc.local`,
        phone_number: "-",
        address: "-",
        role: f.role,
        is_team_leader: "is_team_leader" in f ? f.is_team_leader : false,
        is_head_technician: "is_head_technician" in f ? f.is_head_technician : false,
      },
    });
  }
  await db.accessRule.deleteMany({});
  await db.accessRule.createMany({ data: OVERRIDES.map(([capability, audience, allowed]) => ({ capability, audience, allowed })) });
  // As if the migration had never run: no grants on the old groups' roles, no account holding one.
  await db.accessRoleGrant.deleteMany({ where: { role_id: { in: SYSTEM_IDS } } });
  await db.user.updateMany({ data: { access_role_id: null } });
});

afterAll(async () => {
  await db.user.deleteMany({ where: { email: { startsWith: RUN } } });
  await db.accessRule.deleteMany({});
  if (saved.rules.length) await db.accessRule.createMany({ data: saved.rules });
  await db.accessRoleGrant.deleteMany({ where: { role_id: { in: SYSTEM_IDS } } });
  if (saved.grants.length) await db.accessRoleGrant.createMany({ data: saved.grants });
  for (const u of saved.users) await db.user.update({ where: { id: u.id }, data: { access_role_id: u.access_role_id } });
  await db.$disconnect();
});

describe("moving to roles changes nobody's access", () => {
  it("gives every account exactly what the old settings gave it", async () => {
    await runBackfill();
    const overrides = new Map(OVERRIDES.map(([c, a, v]) => [`${c}:${a}`, v]));
    const users = await db.user.findMany({
      select: {
        email: true,
        role: true,
        is_team_leader: true,
        is_head_technician: true,
        access_role_id: true,
        access_role: { select: { base: true, grants: { select: { capability: true } } } },
      },
    });
    let compared = 0;
    for (const u of users) {
      expect(u.access_role_id, u.email).toBe(systemRoleIdFor(u));
      if (!u.access_role) continue;
      expect(isRoleBase(u.access_role.base) && u.access_role.base === u.role, u.email).toBe(true);
      const before = CAPABILITIES.filter((c) => isAllowed(c, audiencesOf(u), overrides));
      const can = roleCan(u.access_role.base as never, u.access_role.grants.map((g) => g.capability));
      const after = CAPABILITIES.filter((c) => can(c));
      expect(after, u.email).toEqual(before);
      compared++;
    }
    expect(compared).toBeGreaterThanOrEqual(FIXTURES.length - 2);
    // The settings above really were applied, not just the defaults.
    const admin = users.find((u) => u.email === `${RUN}.admin@qc.local`)!;
    expect(admin.access_role!.grants.map((g) => g.capability)).not.toContain("view_cost");
    const tech = users.find((u) => u.email === `${RUN}.tech@qc.local`)!;
    expect(tech.access_role!.grants.map((g) => g.capability)).toEqual(expect.arrayContaining(["page_rma_claims"]));
  });

  it("does not undo a role edited after it ran", async () => {
    await db.accessRoleGrant.delete({ where: { role_id_capability: { role_id: "role_sales", capability: "page_create_ticket" } } });
    const before = await db.accessRoleGrant.count();
    await runBackfill();
    expect(await db.accessRoleGrant.count()).toBe(before);
    expect(await db.accessRoleGrant.findUnique({ where: { role_id_capability: { role_id: "role_sales", capability: "page_create_ticket" } } })).toBeNull();
  });
});
