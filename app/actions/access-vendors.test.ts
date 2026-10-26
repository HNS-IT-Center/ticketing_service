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
    if (!roles.includes(session.role)) throw new Error("Unauthorized");
    return session;
  },
}));

const { db } = await import("@/lib/db");
const { saveAccessRulesAction } = await import("./access");
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

/** The form as the settings page posts it, from a set of checked boxes. */
function matrix(checked: Set<string>) {
  const fd = new FormData();
  for (const c of access.CAPABILITIES) for (const a of access.AUDIENCES) {
    if (checked.has(`${c}:${a}`)) fd.set(`${c}:${a}`, "on");
  }
  return fd;
}
const defaults = () =>
  new Set(access.CAPABILITIES.flatMap((c) => access.CAPABILITY_INFO[c].defaults.map((a) => `${c}:${a}`)));

beforeAll(async () => {
  savedRules = await db.accessRule.findMany({ select: { capability: true, audience: true, allowed: true } });
  await user("admin", "Administrator");
  await user("tech", "Technician");
  await user("head", "Technician", { is_head_technician: true });
  await user("coord", "Technician", { is_team_leader: true });
  await user("rma", "RMA");
});

beforeEach(async () => {
  await db.accessRule.deleteMany({});
  as("admin", "Administrator");
});

afterAll(async () => {
  await db.accessRule.deleteMany({});
  if (savedRules.length) await db.accessRule.createMany({ data: savedRules });
  await db.vendor.deleteMany({ where: { name: { startsWith: RUN } } });
  await db.user.deleteMany({ where: { email: { startsWith: RUN } } });
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
  it("an administrator always may, whatever is stored", () => {
    const denyAdmin = new Map([["view_cost:administrator", false]]);
    expect(access.isAllowed("view_cost", ["administrator"], denyAdmin)).toBe(true);
  });
});

describe("saveAccessRulesAction", () => {
  it("stores nothing when the form equals the defaults", async () => {
    await saveAccessRulesAction(matrix(defaults()));
    expect(await db.accessRule.count()).toBe(0);
  });

  it("stores only what differs, and going back removes the row", async () => {
    const changed = defaults();
    changed.add("view_cost:technician");
    changed.delete("print_invoice:sales");
    await saveAccessRulesAction(matrix(changed));
    const rows = await db.accessRule.findMany({ select: { capability: true, audience: true, allowed: true }, orderBy: { capability: "asc" } });
    expect(rows).toEqual([
      { capability: "print_invoice", audience: "sales", allowed: false },
      { capability: "view_cost", audience: "technician", allowed: true },
    ]);
    await saveAccessRulesAction(matrix(defaults()));
    expect(await db.accessRule.count()).toBe(0);
  });

  it("only an administrator may save", async () => {
    as("head", "Technician");
    await expect(saveAccessRulesAction(matrix(defaults()))).rejects.toThrow();
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
    const changed = defaults();
    changed.add("manage_vendors:technician");
    await saveAccessRulesAction(matrix(changed));
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
