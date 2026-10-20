/**
 * The bill of a service ticket ("Rincian Biaya"), through the real actions and
 * the local database: who may change it, which prices each may set, that a
 * hidden cost never leaves the server, and the trip of external work to a
 * vendor and back.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/email", () => ({ sendTicketStatusEmail: vi.fn(async () => undefined), EMAIL_MILESTONES: [] }));
vi.mock("@/lib/r2", () => ({
  uploadToR2: vi.fn(async () => "https://r2.test/x.jpg"),
  deleteFromStorage: vi.fn(async () => true),
  getFileType: () => "image",
  getExt: () => "jpg",
}));
vi.mock("@/lib/catalog/hns-data", () => ({
  CatalogUnavailableError: class extends Error {},
  isCatalogConfigured: () => false,
  searchCatalog: async () => [],
  getCatalogItem: async () => null,
}));

const session = { userId: "", role: "Technician", name: "QC" };
vi.mock("@/lib/session", () => ({
  requireSession: async () => session,
  getSession: async () => session,
  requireRole: async (...roles: string[]) => {
    if (!roles.includes(session.role)) throw new Error("Unauthorized");
    return session;
  },
}));

const { db } = await import("@/lib/db");
const { addChargeAction, updateChargeAction, removeChargeAction, receiveExternalAction } = await import("./charges");
const { addReplacedPartAction, removeReplacedPartAction, updateTicketStatusAction } = await import("./technician");
const { adminUpdateTicketStatusAction } = await import("./admin");
const { saveAccessRulesAction } = await import("./access");
const { createServiceJobAction, updateServiceJobAction } = await import("./service-jobs");
const { loadChargesPanel, hasExternalWorkOutstanding } = await import("@/lib/charges-server");
const access = await import("@/lib/access");
const { EXTERNAL_WORK_OUTSTANDING } = await import("@/lib/charges");

const RUN = `chg${Date.now().toString(36)}`;
const ids: Record<string, string> = {};
const roles: Record<string, string> = {};
let savedRules: { capability: string; audience: string; allowed: boolean }[] = [];

async function user(key: string, role: string, flags: { is_team_leader?: boolean; is_head_technician?: boolean } = {}) {
  const u = await db.user.create({
    data: { name: `${RUN} ${key}`, email: `${RUN}.${key}@qc.local`, phone_number: "-", address: "-", role: role as never, password: "x", ...flags },
    select: { id: true },
  });
  ids[key] = u.id;
  roles[key] = role;
}
const as = (key: string) => Object.assign(session, { userId: ids[key], role: roles[key] });

async function makeTicket(over: { type?: "service" | "cleaning"; status?: "on_progress" | "completed" | "done"; store?: string } = {}) {
  const t = await db.ticket.create({
    data: {
      ticket_code: `${RUN}-${Math.random().toString(36).slice(2, 9)}`,
      ticket_type: over.type ?? "service",
      device_type: "Laptop_Office",
      status: over.status ?? "on_progress",
      technician_id: ids.tech,
      sales_id: ids.sales,
      store_location_id: ids[over.store ?? "storeA"],
      pickup_method: "self_pickup",
    },
    select: { id: true },
  });
  return t.id;
}

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}
const add = (ticketId: string, fields: Record<string, string>) => addChargeAction(form({ ticket_id: ticketId, ...fields }));
const lines = (ticketId: string) => db.ticketCharge.findMany({ where: { ticket_id: ticketId }, orderBy: { created_at: "asc" } });

/** The access settings form as the page posts it: the defaults, plus and minus some boxes. */
async function grant(plus: string[], minus: string[] = []) {
  const checked = new Set(access.CAPABILITIES.flatMap((c) => access.CAPABILITY_INFO[c].defaults.map((a) => `${c}:${a}`)));
  for (const k of plus) checked.add(k);
  for (const k of minus) checked.delete(k);
  const fd = new FormData();
  for (const k of checked) fd.set(k, "on");
  const before = { ...session };
  as("admin");
  await saveAccessRulesAction(fd);
  Object.assign(session, before);
}

beforeAll(async () => {
  savedRules = await db.accessRule.findMany({ select: { capability: true, audience: true, allowed: true } });
  for (const key of ["storeA", "storeB"]) {
    const s = await db.storeLocation.create({ data: { name: `${RUN} ${key}`, code: `${RUN}${key}` }, select: { id: true } });
    ids[key] = s.id;
  }
  await user("admin", "Administrator");
  await user("tech", "Technician");
  await user("other", "Technician");
  await user("head", "Technician", { is_head_technician: true });
  await user("coordA", "Technician", { is_team_leader: true });
  await user("coordB", "Technician", { is_team_leader: true });
  await user("sales", "Sales");
  await user("rma", "RMA");
  await db.technicianStoreAssignment.createMany({
    data: [
      { technician_id: ids.coordA, store_id: ids.storeA },
      { technician_id: ids.coordB, store_id: ids.storeB },
    ],
  });
  for (const [key, roles] of [
    ["repairer", { repairs: true }],
    ["supplier", { supplies_parts: true }],
    ["closedRepairer", { repairs: true, is_active: false }],
    ["claimsOnly", { handles_claims: true }],
  ] as const) {
    const v = await db.vendor.create({ data: { name: `${RUN} ${key}`, ...roles }, select: { id: true } });
    ids[key] = v.id;
  }
  for (const [key, data] of [
    ["job", { name: `${RUN} Ganti LCD`, default_price: 150000, points: 2 }],
    ["job2", { name: `${RUN} Install Ulang OS`, default_price: 100000, points: 1 }],
    ["oldJob", { name: `${RUN} Jasa Lama`, default_price: 50000, points: 5, is_active: false }],
  ] as const) {
    ids[key] = (await db.serviceJob.create({ data, select: { id: true } })).id;
  }
});

beforeEach(async () => {
  await db.accessRule.deleteMany({});
  as("tech");
});

afterAll(async () => {
  await db.accessRule.deleteMany({});
  if (savedRules.length) await db.accessRule.createMany({ data: savedRules });
  await db.ticket.deleteMany({ where: { ticket_code: { startsWith: RUN } } });
  await db.vendor.deleteMany({ where: { name: { startsWith: RUN } } });
  await db.serviceJob.deleteMany({ where: { name: { startsWith: RUN } } });
  await db.user.deleteMany({ where: { email: { startsWith: RUN } } });
  await db.storeLocation.deleteMany({ where: { name: { startsWith: RUN } } });
  await db.$disconnect();
});

describe("prices and who may set them", () => {
  it("a technician adds their labour with a selling price, written as people type it", async () => {
    const t = await makeTicket();
    expect(await add(t, { kind: "service_fee", service_job_id: ids.job, unit_price: "Rp 175.000" })).toEqual({ success: true });
    expect(await lines(t)).toMatchObject([
      { kind: "service_fee", description: `${RUN} Ganti LCD`, unit_price: 175000, unit_cost: null, quantity: 1, job_points: 2 },
    ]);
  });

  it("a technician may not set a cost by default — refused, not silently dropped", async () => {
    const t = await makeTicket();
    const r = await add(t, { kind: "other", description: "Kabel", unit_price: "10000", unit_cost: "5000" });
    expect(r).toMatchObject({ error: expect.stringContaining("harga modal") });
    expect(await lines(t)).toHaveLength(0);
  });

  it("a technician saving a price leaves the cost a head technician entered alone", async () => {
    const t = await makeTicket();
    as("head");
    await add(t, { kind: "other", description: "Kabel fleksibel", unit_cost: "40000" });
    const [line] = await lines(t);
    as("tech");
    expect(await updateChargeAction(line.id, form({ unit_price: "75.000" }))).toEqual({ success: true });
    expect(await db.ticketCharge.findUnique({ where: { id: line.id } })).toMatchObject({ unit_cost: 40000, unit_price: 75000, updated_by_id: ids.tech });
  });

  it("an empty price clears it; garbage is refused", async () => {
    const t = await makeTicket();
    await add(t, { kind: "service_fee", service_job_id: ids.job, unit_price: "100000" });
    const [line] = await lines(t);
    expect(await updateChargeAction(line.id, form({ unit_price: "seratus" }))).toMatchObject({ error: expect.stringContaining("tidak valid") });
    expect(await updateChargeAction(line.id, form({ unit_price: "" }))).toEqual({ success: true });
    expect((await lines(t))[0].unit_price).toBeNull();
  });

  it("setting a cost needs seeing it too: edit_cost alone is not enough", async () => {
    const t = await makeTicket();
    await grant(["edit_cost:technician"]);
    expect(await add(t, { kind: "other", description: "Kabel", unit_cost: "5000" })).toMatchObject({ error: expect.stringContaining("harga modal") });
    await grant(["edit_cost:technician", "view_cost:technician"]);
    expect(await add(t, { kind: "other", description: "Kabel", unit_cost: "5000" })).toEqual({ success: true });
  });

  it("the owner can take the selling price away from technicians", async () => {
    const t = await makeTicket();
    await grant([], ["edit_price:technician"]);
    expect(await add(t, { kind: "service_fee", service_job_id: ids.job, unit_price: "1" })).toMatchObject({ error: expect.stringContaining("harga jual") });
    // Still allowed to record the job — at the price the Daftar Jasa gives it.
    expect(await add(t, { kind: "service_fee", service_job_id: ids.job })).toEqual({ success: true });
    expect((await lines(t))[0].unit_price).toBe(150000);
  });
});

describe("what reaches the browser", () => {
  it("a technician's panel carries no cost at all; a head technician's does", async () => {
    const t = await makeTicket();
    as("head");
    await add(t, { kind: "other", description: "Kabel", unit_cost: "40000", unit_price: "60000" });
    const ticket = await db.ticket.findUniqueOrThrow({ where: { id: t } });

    const techView = await loadChargesPanel(ids.tech, ticket);
    expect(techView?.perms).toMatchObject({ canEdit: true, canEditPrice: true, canViewCost: false, canViewMargin: false });
    expect(techView?.lines[0]).not.toHaveProperty("unit_cost");
    expect(JSON.stringify(techView)).not.toContain("40000");

    const headView = await loadChargesPanel(ids.head, ticket);
    expect(headView?.perms).toMatchObject({ canViewCost: true, canEditCost: true, canViewMargin: true });
    expect(headView?.lines[0]).toMatchObject({ unit_cost: 40000, unit_price: 60000 });
  });

  it("margin is never shown without cost, whatever the settings say", async () => {
    await grant(["view_margin:technician"]);
    const ticket = await db.ticket.findUniqueOrThrow({ where: { id: await makeTicket() } });
    expect((await loadChargesPanel(ids.tech, ticket))?.perms.canViewMargin).toBe(false);
  });

  it("a ticket that is not a service has no bill", async () => {
    const ticket = await db.ticket.findUniqueOrThrow({ where: { id: await makeTicket({ type: "cleaning" }) } });
    expect(await loadChargesPanel(ids.tech, ticket)).toBeNull();
    expect(await add(ticket.id, { kind: "service_fee", service_job_id: ids.job })).toMatchObject({ error: expect.stringContaining("tiket service") });
  });
});

describe("whose bill it is", () => {
  it("refuses a technician who does not hold the ticket, and RMA", async () => {
    const t = await makeTicket();
    for (const key of ["other", "rma"]) {
      as(key);
      expect(await add(t, { kind: "service_fee", service_job_id: ids.job })).toMatchObject({ error: expect.stringContaining("tidak dapat") });
    }
  });

  it("a coordinator edits their own store's tickets only", async () => {
    const t = await makeTicket({ store: "storeA" });
    as("coordB");
    expect(await add(t, { kind: "service_fee", service_job_id: ids.job })).toMatchObject({ error: expect.stringContaining("tidak dapat") });
    as("coordA");
    expect(await add(t, { kind: "service_fee", service_job_id: ids.job, unit_cost: "1000" })).toEqual({ success: true });
  });

  it("the assigned sales may record a line, but not price it by default", async () => {
    const t = await makeTicket();
    as("sales");
    expect(await add(t, { kind: "service_fee", service_job_id: ids.job, unit_price: "1" })).toMatchObject({ error: expect.stringContaining("harga jual") });
    expect(await add(t, { kind: "service_fee", service_job_id: ids.job })).toEqual({ success: true });
  });

  it("a completed ticket's bill is closed to the technician, open to a head technician", async () => {
    const t = await makeTicket({ status: "completed" });
    expect(await add(t, { kind: "service_fee", service_job_id: ids.job })).toMatchObject({ error: expect.stringContaining("tidak dapat") });
    as("head");
    expect(await add(t, { kind: "service_fee", service_job_id: ids.job })).toEqual({ success: true });
  });
});

describe("part lines follow the parts", () => {
  it("recording a part creates its line, unpriced, named after the item", async () => {
    const t = await makeTicket();
    const fd = form({ ticket_id: t, part: "battery", item_name: "ASUS C31N1915", quantity: "2" });
    expect(await addReplacedPartAction(fd)).toEqual({ success: true });
    const part = await db.ticketReplacedPart.findFirstOrThrow({ where: { ticket_id: t } });
    expect(await lines(t)).toMatchObject([
      { kind: "part", description: "ASUS C31N1915", quantity: 2, replaced_part_id: part.id, unit_price: null },
    ]);
  });

  it("a part line keeps its name and quantity, takes a supplier and prices, and is removed only with its part", async () => {
    const t = await makeTicket();
    await addReplacedPartAction(form({ ticket_id: t, part: "lcd", item_name: "" }));
    const [line] = await lines(t);
    expect(line.description).toBe("LCD / Layar");

    expect(
      await updateChargeAction(line.id, form({ description: "renamed", quantity: "9", vendor_id: ids.supplier, unit_price: "900000" }))
    ).toEqual({ success: true });
    expect(await db.ticketCharge.findUnique({ where: { id: line.id } })).toMatchObject({
      description: "LCD / Layar",
      quantity: 1,
      vendor_id: ids.supplier,
      unit_price: 900000,
    });
    expect(await updateChargeAction(line.id, form({ vendor_id: ids.repairer }))).toMatchObject({ error: expect.stringContaining("Supplier part") });

    expect(await removeChargeAction(line.id)).toMatchObject({ error: expect.stringContaining("Part yang Diganti") });
    const part = await db.ticketReplacedPart.findFirstOrThrow({ where: { ticket_id: t } });
    expect(await removeReplacedPartAction(part.id)).toEqual({ success: true });
    expect(await lines(t)).toHaveLength(0);
  });

  it("a hand-added line can be removed, and a part line cannot be added by hand", async () => {
    const t = await makeTicket();
    expect(await add(t, { kind: "part", description: "LCD" })).toMatchObject({ error: expect.stringContaining("Part yang Diganti") });
    await add(t, { kind: "other", description: "Kabel" });
    const [line] = await lines(t);
    expect(await removeChargeAction(line.id)).toEqual({ success: true });
    expect(await lines(t)).toHaveLength(0);
  });
});

describe("external work: to the vendor and back", () => {
  it("needs an active repairer from the list", async () => {
    const t = await makeTicket();
    const base = { kind: "external_service", description: "Perbaikan IC power" };
    expect(await add(t, base)).toMatchObject({ error: expect.stringContaining("Pilih vendor") });
    expect(await add(t, { ...base, vendor_id: ids.supplier })).toMatchObject({ error: expect.stringContaining("Service eksternal") });
    // A vendor that only takes warranty claims is not paid for service work.
    expect(await add(t, { ...base, vendor_id: ids.claimsOnly })).toMatchObject({ error: expect.stringContaining("Service eksternal") });
    expect(await add(t, { kind: "other", description: "Kabel", vendor_id: ids.claimsOnly })).toMatchObject({ error: expect.stringContaining("tidak ditandai") });
    expect(await add(t, { ...base, vendor_id: ids.closedRepairer })).toMatchObject({ error: expect.stringContaining("nonaktif") });
    expect(await add(t, { ...base, vendor_id: "nope" })).toMatchObject({ error: expect.stringContaining("tidak ditemukan") });
    expect(await lines(t)).toHaveLength(0);
  });

  it("is at the vendor once sent, and the ticket cannot be finished meanwhile — from either portal", async () => {
    const t = await makeTicket();
    expect(await add(t, { kind: "external_service", description: "Perbaikan IC power", vendor_id: ids.repairer, external_note: "Mati total" })).toEqual({
      success: true,
    });
    const [line] = await lines(t);
    expect(line.sent_at).toBeInstanceOf(Date);
    expect(line.returned_at).toBeNull();
    expect(await hasExternalWorkOutstanding(t)).toBe(true);

    expect(await updateTicketStatusAction(form({ ticketId: t, newStatus: "done" }))).toEqual({ error: EXTERNAL_WORK_OUTSTANDING });
    as("admin");
    expect(await adminUpdateTicketStatusAction(t, "done")).toEqual({ error: EXTERNAL_WORK_OUTSTANDING });
    expect((await db.ticket.findUniqueOrThrow({ where: { id: t } })).status).toBe("on_progress");
  });

  it("comes back once: the result, the vendor's note, and the prices known by then", async () => {
    const t = await makeTicket();
    await add(t, { kind: "external_service", description: "Reball VGA", vendor_id: ids.repairer });
    const [line] = await lines(t);

    expect(await receiveExternalAction(line.id, form({}))).toMatchObject({ error: expect.stringContaining("hasil") });
    expect(await receiveExternalAction(line.id, form({ external_result: "not_repaired" }))).toMatchObject({
      error: expect.stringContaining("keterangan"),
    });
    expect(await receiveExternalAction(line.id, form({ external_result: "repaired", unit_price: "850.000" }))).toEqual({ success: true });
    expect(await db.ticketCharge.findUnique({ where: { id: line.id } })).toMatchObject({ external_result: "repaired", unit_price: 850000 });
    expect((await db.ticketCharge.findUniqueOrThrow({ where: { id: line.id } })).returned_at).toBeInstanceOf(Date);
    expect(await hasExternalWorkOutstanding(t)).toBe(false);

    expect(await receiveExternalAction(line.id, form({ external_result: "repaired" }))).toMatchObject({ error: expect.stringContaining("sudah dicatat") });
  });

  it("an external line cannot be emptied of its vendor", async () => {
    const t = await makeTicket();
    await add(t, { kind: "external_service", description: "Reball VGA", vendor_id: ids.repairer });
    const [line] = await lines(t);
    expect(await updateChargeAction(line.id, form({ vendor_id: "" }))).toMatchObject({ error: expect.stringContaining("Pilih vendor") });
  });

  it("a vendor deactivated after the work was sent stays on the line", async () => {
    const t = await makeTicket();
    await add(t, { kind: "external_service", description: "Reball VGA", vendor_id: ids.repairer });
    const [line] = await lines(t);
    await db.vendor.update({ where: { id: ids.repairer }, data: { is_active: false } });
    try {
      expect(await updateChargeAction(line.id, form({ vendor_id: ids.repairer, unit_price: "1" }))).toEqual({ success: true });
    } finally {
      await db.vendor.update({ where: { id: ids.repairer }, data: { is_active: true } });
    }
  });
});

describe("input checks", () => {
  it("refuses an empty description, a silly quantity, and an unknown kind", async () => {
    const t = await makeTicket();
    expect(await add(t, { kind: "other", description: "  " })).toMatchObject({ error: expect.stringContaining("Keterangan") });
    expect(await add(t, { kind: "service_fee", service_job_id: ids.job, quantity: "0" })).toMatchObject({ error: expect.stringContaining("Jumlah") });
    expect(await add(t, { kind: "service_fee", service_job_id: ids.job, quantity: "1.5" })).toMatchObject({ error: expect.stringContaining("Jumlah") });
    expect(await add(t, { kind: "refund", description: "x" })).toMatchObject({ error: expect.any(String) });
    expect(await add(t, { kind: "other", description: "x".repeat(301) })).toMatchObject({ error: expect.stringContaining("maksimal") });
    expect(await lines(t)).toHaveLength(0);
  });

  it("reports a missing ticket or line instead of throwing", async () => {
    expect(await add("missing", { kind: "service_fee", service_job_id: ids.job })).toMatchObject({ error: expect.stringContaining("tidak ditemukan") });
    expect(await updateChargeAction("missing", form({}))).toMatchObject({ error: expect.stringContaining("tidak ditemukan") });
    expect(await removeChargeAction("missing")).toMatchObject({ error: expect.stringContaining("tidak ditemukan") });
    expect(await receiveExternalAction("missing", form({}))).toMatchObject({ error: expect.stringContaining("tidak ditemukan") });
  });
});

describe("labour comes from the Daftar Jasa", () => {
  it("refuses a labour line with no job, an unknown one, or one switched off", async () => {
    const t = await makeTicket();
    for (const extra of [{}, { service_job_id: "" }, { service_job_id: "nope" }, { service_job_id: ids.oldJob }] as Record<string, string>[]) {
      expect(await add(t, { kind: "service_fee", description: "Jasa ketik bebas", ...extra })).toMatchObject({
        error: expect.stringMatching(/Daftar Jasa/),
      });
    }
    expect(await lines(t)).toHaveLength(0);
  });

  it("the sales, who may not set prices, gets the job's default price", async () => {
    const t = await makeTicket();
    as("sales");
    expect(await add(t, { kind: "service_fee", service_job_id: ids.job2 })).toEqual({ success: true });
    expect(await lines(t)).toMatchObject([{ description: `${RUN} Install Ulang OS`, unit_price: 100000, job_points: 1 }]);
  });

  it("choosing another job renames the line, gives its points, and — without a price sent — its price", async () => {
    const t = await makeTicket();
    as("sales");
    await add(t, { kind: "service_fee", service_job_id: ids.job });
    const [line] = await lines(t);
    expect(await updateChargeAction(line.id, form({ service_job_id: ids.job2 }))).toEqual({ success: true });
    expect(await db.ticketCharge.findUniqueOrThrow({ where: { id: line.id } })).toMatchObject({
      service_job_id: ids.job2,
      description: `${RUN} Install Ulang OS`,
      job_points: 1,
      unit_price: 100000,
    });
  });

  it("a line keeps the points it was given after the job is re-weighted, so last month does not move", async () => {
    const t = await makeTicket();
    await add(t, { kind: "service_fee", service_job_id: ids.job, unit_price: "150000" });
    await db.serviceJob.update({ where: { id: ids.job }, data: { points: 9 } });
    try {
      const [line] = await lines(t);
      expect(await updateChargeAction(line.id, form({ service_job_id: ids.job, unit_price: "160000" }))).toEqual({ success: true });
      expect(await db.ticketCharge.findUniqueOrThrow({ where: { id: line.id } })).toMatchObject({ job_points: 2, unit_price: 160000 });
    } finally {
      await db.serviceJob.update({ where: { id: ids.job }, data: { points: 2 } });
    }
  });

  it("a job switched off after it was recorded stays on the line", async () => {
    const t = await makeTicket();
    await add(t, { kind: "service_fee", service_job_id: ids.job2 });
    await db.serviceJob.update({ where: { id: ids.job2 }, data: { is_active: false } });
    try {
      const [line] = await lines(t);
      expect(await updateChargeAction(line.id, form({ service_job_id: ids.job2, quantity: "2" }))).toEqual({ success: true });
      expect((await db.ticketCharge.findUniqueOrThrow({ where: { id: line.id } })).quantity).toBe(2);
    } finally {
      await db.serviceJob.update({ where: { id: ids.job2 }, data: { is_active: true } });
    }
  });

  it("a typed description cannot overwrite a job's name", async () => {
    const t = await makeTicket();
    await add(t, { kind: "service_fee", service_job_id: ids.job });
    const [line] = await lines(t);
    expect(await updateChargeAction(line.id, form({ description: "nama lain" }))).toEqual({ success: true });
    expect((await db.ticketCharge.findUniqueOrThrow({ where: { id: line.id } })).description).toBe(`${RUN} Ganti LCD`);
  });
});

describe("the Daftar Jasa itself", () => {
  const jobForm = (fields: Record<string, string>) => form(fields);

  it("a head technician may add a job; a plain technician may not", async () => {
    as("head");
    expect(await createServiceJobAction(jobForm({ name: `${RUN} Ganti Engsel`, default_price: "Rp 85.000", points: "3" }))).toMatchObject({
      success: true,
    });
    expect(await db.serviceJob.findUniqueOrThrow({ where: { name: `${RUN} Ganti Engsel` } })).toMatchObject({
      default_price: 85000,
      points: 3,
      is_active: true,
    });
    as("tech");
    expect(await createServiceJobAction(jobForm({ name: `${RUN} Lain` }))).toMatchObject({ error: expect.stringContaining("akses") });
  });

  it("refuses the same name in another case, bad points and a bad price", async () => {
    as("admin");
    expect(await createServiceJobAction(jobForm({ name: `${RUN} GANTI LCD` }))).toMatchObject({ error: expect.stringContaining("sudah ada") });
    expect(await createServiceJobAction(jobForm({ name: `${RUN} Poin Aneh`, points: "-1" }))).toMatchObject({ error: expect.stringContaining("Poin") });
    expect(await createServiceJobAction(jobForm({ name: `${RUN} Poin Aneh`, points: "1.5" }))).toMatchObject({ error: expect.stringContaining("Poin") });
    expect(await createServiceJobAction(jobForm({ name: `${RUN} Harga Aneh`, default_price: "seratus" }))).toMatchObject({
      error: expect.stringContaining("Harga"),
    });
  });

  it("switches a job off without deleting it", async () => {
    as("admin");
    const r = await createServiceJobAction(jobForm({ name: `${RUN} Sementara` }));
    const id = (r as { job: { id: string } }).job.id;
    expect(await updateServiceJobAction(id, jobForm({ name: `${RUN} Sementara`, points: "0" }))).toEqual({ success: true });
    expect(await db.serviceJob.findUniqueOrThrow({ where: { id } })).toMatchObject({ is_active: false });
  });
});
