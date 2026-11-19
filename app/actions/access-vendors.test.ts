/**
 * Access settings and the vendor list, through the real actions and database.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));

const session = { userId: "", role: "Administrator", name: "QC" };
vi.mock("@/lib/session", () => ({
  requireSession: async () => session,
  getSession: async () => session,
  requireRole: async (...roles: string[]) => {
    // As lib/session.ts: an Owner passes wherever an Administrator would.
    if (!roles.includes(session.role) && !(session.role === "Owner" && roles.includes("Administrator"))) {
      throw new Error("Unauthorized");
    }
    return session;
  },
}));

const { db } = await import("@/lib/db");
const { createAccessRoleAction, updateAccessRoleAction, deleteAccessRoleAction } = await import("./access");
const { createVendorAction, updateVendorAction } = await import("./vendors");
const access = await import("@/lib/access");

const RUN = `acv${Date.now().toString(36)}`;
const ids: Record<string, string> = {};
// The local database may hold settings someone made while trying the page;
// they are put back afterwards.
let savedRules: { capability: string; audience: string; allowed: boolean }[] = [];

async function user(key: string, role: string, flags: { is_team_leader?: boolean; is_head_technician?: boolean } = {}) {
  const u = await db.user.create({
    data: { name: `${RUN} ${key}`, email: `${RUN}.${key}@qc.local`, phone_number: "-", address: "-", role: role as never, password: "x", ...flags },
    select: { id: true },
  });
  ids[key] = u.id;
}
const as = (key: string, role: string) => Object.assign(session, { userId: ids[key], role });
const vendorForm = (name: string, extra: Record<string, string> = {}) => {
  const fd = new FormData();
  fd.set("name", name);
  fd.set("supplies_parts", "1");
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  return fd;
};

/** The Role & Izin panel's form. */
function roleForm(name: string, base: string, grants: string[], description = "") {
  const fd = new FormData();
  fd.set("name", name);
  fd.set("base", base);
  fd.set("description", description);
  for (const g of grants) fd.append("grant", g);
  return fd;
}

beforeAll(async () => {
  savedRules = await db.accessRule.findMany({ select: { capability: true, audience: true, allowed: true } });
  await user("owner", "Owner");
  await user("admin", "Administrator");
  await user("tech", "Technician");
  await user("head", "Technician", { is_head_technician: true });
  await user("coord", "Technician", { is_team_leader: true });
  await user("rma", "RMA");
});

beforeEach(async () => {
  await db.accessRule.deleteMany({});
  as("owner", "Owner");
});

afterAll(async () => {
  await db.accessRule.deleteMany({});
  if (savedRules.length) await db.accessRule.createMany({ data: savedRules });
  await db.vendor.deleteMany({ where: { name: { startsWith: RUN } } });
  await db.user.deleteMany({ where: { email: { startsWith: RUN } } });
  await db.accessRole.deleteMany({ where: { name: { startsWith: RUN } } });
  await db.$disconnect();
});

describe("access rules (pure)", () => {
  const none = new Map<string, boolean>();
  it("puts a technician in every group they belong to", () => {
    expect(access.audiencesOf({ role: "Technician", is_team_leader: true, is_head_technician: true })).toEqual([
      "technician",
      "coordinator",
      "head_technician",
    ]);
  });
  it("defaults: cost for seniors only, selling price for technicians too", () => {
    expect(access.isAllowed("view_cost", ["technician"], none)).toBe(false);
    expect(access.isAllowed("view_cost", ["technician", "head_technician"], none)).toBe(true);
    expect(access.isAllowed("edit_price", ["technician"], none)).toBe(true);
    expect(access.isAllowed("view_cost", ["sales"], none)).toBe(false);
  });
  it("the owner always may, whatever is stored; an administrator can be narrowed", () => {
    const deny = new Map([
      ["view_cost:owner", false],
      ["view_cost:administrator", false],
    ]);
    expect(access.isAllowed("view_cost", ["owner"], deny)).toBe(true);
    expect(access.isAllowed("view_cost", ["administrator"], deny)).toBe(false);
    expect(access.isAllowed("view_cost", ["administrator"], none)).toBe(true);
  });
});

describe("Role & Izin — made roles", () => {
  it("only the owner may make, change or remove a role", async () => {
    as("admin", "Administrator");
    await expect(createAccessRoleAction(roleForm(`${RUN} Kasir`, "Sales", []))).rejects.toThrow();
    as("head", "Technician");
    await expect(deleteAccessRoleAction("role_sales")).rejects.toThrow();
  });

  it("keeps only what applies to the base, and refuses a duplicate name", async () => {
    const made = await createAccessRoleAction(roleForm(`${RUN} Kasir`, "Sales", ["print_invoice", "page_toko_dashboard", "manage_users", "nope"]));
    expect(made).toMatchObject({ success: true });
    const id = (made as { id: string }).id;
    const grants = await db.accessRoleGrant.findMany({ where: { role_id: id }, select: { capability: true } });
    expect(grants.map((g) => g.capability)).toEqual(["print_invoice"]);
    expect(await createAccessRoleAction(roleForm(`${RUN} kasir`, "Sales", []))).toMatchObject({ error: expect.stringContaining("Sudah ada") });
    expect(await createAccessRoleAction(roleForm("Owner", "Sales", []))).toMatchObject({ error: expect.any(String) });
    expect(await createAccessRoleAction(roleForm(`${RUN} X`, "Owner", []))).toMatchObject({ error: expect.stringContaining("tipe dasar") });
  });

  it("gives an account exactly what its role holds, at once", async () => {
    const made = (await createAccessRoleAction(roleForm(`${RUN} Teknisi Vendor`, "Technician", ["manage_vendors"]))) as { id: string };
    await db.user.update({ where: { id: ids.tech }, data: { access_role_id: made.id } });
    as("tech", "Technician");
    expect(await createVendorAction(vendorForm(`${RUN} Lewat Role`))).toMatchObject({ success: true });
    as("owner", "Owner");
    await updateAccessRoleAction(made.id, roleForm(`${RUN} Teknisi Vendor`, "Technician", []));
    as("tech", "Technician");
    expect(await createVendorAction(vendorForm(`${RUN} Dicabut`))).toMatchObject({ error: expect.stringContaining("akses") });
    as("owner", "Owner");
    // The base cannot move while someone holds the role, and the role cannot go.
    expect(await updateAccessRoleAction(made.id, roleForm(`${RUN} Teknisi Vendor`, "Sales", []))).toMatchObject({ error: expect.stringContaining("Tipe dasar") });
    expect(await deleteAccessRoleAction(made.id)).toMatchObject({ error: expect.stringContaining("masih dipakai") });
    await db.user.update({ where: { id: ids.tech }, data: { access_role_id: null } });
    expect(await deleteAccessRoleAction(made.id)).toEqual({ success: true });
  });
});

describe("vendors", () => {
  it("a head technician may add one; a plain technician may not", async () => {
    as("head", "Technician");
    expect(await createVendorAction(vendorForm(`${RUN} Sparepart Jaya`))).toMatchObject({ success: true });
    as("tech", "Technician");
    expect(await createVendorAction(vendorForm(`${RUN} Lain`))).toMatchObject({ error: expect.stringContaining("akses") });
  });

  it("refuses the same name in another case", async () => {
    await createVendorAction(vendorForm(`${RUN} Service IC Batam`));
    const again = await createVendorAction(vendorForm(`${RUN} SERVICE IC BATAM`));
    expect(again).toMatchObject({ error: expect.stringContaining("sudah ada") });
  });

  it("a technician gains the right when the owner grants it", async () => {
    await db.accessRule.create({ data: { capability: "manage_vendors", audience: "technician", allowed: true } });
    as("tech", "Technician");
    expect(await createVendorAction(vendorForm(`${RUN} Diberi Akses`))).toMatchObject({ success: true });
  });

  it("stores every role ticked, and refuses a vendor with none", async () => {
    const r = await createVendorAction(vendorForm(`${RUN} Distributor`, { handles_claims: "1" }));
    const id = (r as { vendor: { id: string } }).vendor.id;
    expect(await db.vendor.findUniqueOrThrow({ where: { id } })).toMatchObject({
      supplies_parts: true,
      repairs: false,
      handles_claims: true,
    });
    const none = new FormData();
    none.set("name", `${RUN} Tanpa Peran`);
    expect(await createVendorAction(none)).toMatchObject({ error: expect.stringContaining("minimal satu peran") });
  });

  it("the RMA desk may add claim vendors by default", async () => {
    as("rma", "RMA");
    const fd = new FormData();
    fd.set("name", `${RUN} Synnex`);
    fd.set("handles_claims", "1");
    expect(await createVendorAction(fd)).toMatchObject({ success: true });
  });

  it("deactivates a vendor without deleting it", async () => {
    const r = await createVendorAction(vendorForm(`${RUN} Lama`));
    const id = (r as { vendor: { id: string } }).vendor.id;
    expect(await updateVendorAction(id, vendorForm(`${RUN} Lama`))).toMatchObject({ success: true });
    expect(await db.vendor.findUnique({ where: { id }, select: { is_active: true } })).toEqual({ is_active: false });
  });
});
