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
// The catalogue API (data.hnsitcenter.id) is replaced; everything else is real.
const catalog = vi.hoisted(() => ({ items: new Map<number, unknown>(), down: false }));
vi.mock("@/lib/catalog/hns-data", () => {
  class CatalogUnavailableError extends Error {}
  return {
    CatalogUnavailableError,
    isCatalogConfigured: () => false,
    searchCatalog: async () => [],
    getCatalogItem: async (id: number) => {
      if (catalog.down) throw new CatalogUnavailableError("catalog answered 502");
      return catalog.items.get(id) ?? null;
    },
  };
});

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
const { addReplacedPartAction, updateTicketStatusAction } = await import("./technician");
const { adminUpdateTicketStatusAction } = await import("./admin");
const { saveAccessRulesAction } = await import("./access");
const { deleteVendorAction } = await import("./vendors");
const { deleteServiceJobAction } = await import("./service-jobs");
const { createServiceJobAction, updateServiceJobAction, setServiceJobAccurateItemAction, applyAccurateItemToUnmappedAction } =
  await import("./service-jobs");
const { loadChargesPanel, loadTicketCharges, hasExternalWorkOutstanding } = await import("@/lib/charges-server");
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
  // Marking a ticket done credits its technician (the reminder tests do).
  await db.technicianPerformance.deleteMany({ where: { technician: { email: { startsWith: RUN } } } });
  // Lines the activity-log tests wrote under this run's accounts.
  await db.activityLog.deleteMany({ where: { actor_id: { in: Object.values(ids) } } });
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

  it("a part line takes a supplier and prices, and its quantity is the part's — written to both", async () => {
    const t = await makeTicket();
    await addReplacedPartAction(form({ ticket_id: t, part: "lcd", item_name: "" }));
    const [line] = await lines(t);
    expect(line.description).toBe("LCD / Layar");

    // A free description is not a part line's to take: its name comes from the part.
    expect(
      await updateChargeAction(line.id, form({ description: "renamed", quantity: "2", vendor_id: ids.supplier, unit_price: "900000" }))
    ).toEqual({ success: true });
    expect(await db.ticketCharge.findUnique({ where: { id: line.id } })).toMatchObject({
      description: "LCD / Layar",
      quantity: 2,
      vendor_id: ids.supplier,
      unit_price: 900000,
    });
    expect((await db.ticketReplacedPart.findFirstOrThrow({ where: { ticket_id: t } })).quantity).toBe(2);
    expect(await updateChargeAction(line.id, form({ vendor_id: ids.repairer }))).toMatchObject({ error: expect.stringContaining("Supplier part") });
  });

  it("a part with no code yet can be renamed and re-categorised; one with a code keeps the catalogue's name", async () => {
    const t = await makeTicket();
    await addReplacedPartAction(form({ ticket_id: t, part: "lcd", item_name: "LCD" }));
    const [line] = await lines(t);
    expect(await updateChargeAction(line.id, form({ part: "battery", item_name: "Baterai 3 cell" }))).toEqual({ success: true });
    expect(await db.ticketReplacedPart.findFirstOrThrow({ where: { ticket_id: t } })).toMatchObject({ part: "battery", item_name: "Baterai 3 cell" });
    expect((await db.ticketCharge.findUniqueOrThrow({ where: { id: line.id } })).description).toBe("Baterai 3 cell");
    expect(await updateChargeAction(line.id, form({ part: "other", item_name: "" }))).toMatchObject({ error: expect.stringContaining("wajib") });

    await db.ticketReplacedPart.updateMany({ where: { ticket_id: t }, data: { sku: "BAT-1", item_name: "BATERAI KATALOG" } });
    await db.ticketCharge.update({ where: { id: line.id }, data: { description: "BATERAI KATALOG" } });
    expect(await updateChargeAction(line.id, form({ item_name: "diketik lagi", quantity: "3" }))).toEqual({ success: true });
    expect(await db.ticketReplacedPart.findFirstOrThrow({ where: { ticket_id: t } })).toMatchObject({ item_name: "BATERAI KATALOG", quantity: 3 });
    expect((await db.ticketCharge.findUniqueOrThrow({ where: { id: line.id } })).description).toBe("BATERAI KATALOG");
  });

  it("removing a part line from the bill removes the part, its photos and their files", async () => {
    const { deleteFromStorage } = await import("@/lib/r2");
    const t = await makeTicket();
    const photo = new File([new Uint8Array([1, 2, 3])], "box.jpg", { type: "image/jpeg" });
    const fd = form({ ticket_id: t, part: "lcd", item_name: "LCD" });
    fd.append("photos", photo);
    expect(await addReplacedPartAction(fd)).toEqual({ success: true });
    const [line] = await lines(t);
    vi.mocked(deleteFromStorage).mockClear();

    as("admin");
    expect(await removeChargeAction(line.id)).toEqual({ success: true });
    expect(await lines(t)).toHaveLength(0);
    expect(await db.ticketReplacedPart.count({ where: { ticket_id: t } })).toBe(0);
    expect(vi.mocked(deleteFromStorage)).toHaveBeenCalledWith("https://r2.test/x.jpg");

    // Still guarded by the bill rule.
    as("tech");
    await addReplacedPartAction(form({ ticket_id: t, part: "lcd", item_name: "LCD" }));
    as("other");
    expect(await removeChargeAction((await lines(t))[0].id)).toMatchObject({ error: expect.stringContaining("tidak dapat") });
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

describe("what a part usually sells for", () => {
  /** A part recorded the way the technician records it, then priced. */
  async function pricedPart(ticketId: string, sku: string | null, name: string, price: number | null) {
    await addReplacedPartAction(form({ ticket_id: ticketId, part: "battery", item_name: name }));
    const part = await db.ticketReplacedPart.findFirstOrThrow({
      where: { ticket_id: ticketId },
      orderBy: { created_at: "desc" },
      select: { id: true, charge: { select: { id: true } } },
    });
    if (sku) await db.ticketReplacedPart.update({ where: { id: part.id }, data: { sku } });
    if (price !== null) await db.ticketCharge.update({ where: { id: part.charge!.id }, data: { unit_price: price } });
    return part.charge!.id;
  }

  it("gives whoever sets prices the recent prices of the same item, from other bills", async () => {
    const sku = `${RUN}-BAT`;
    for (const price of [400000, 500000, 450000]) await pricedPart(await makeTicket(), sku, "Baterai X", price);
    const t = await makeTicket();
    const mine = await pricedPart(t, sku, "Baterai X", null);
    const ticket = await db.ticket.findUniqueOrThrow({ where: { id: t } });

    const techView = await loadChargesPanel(ids.tech, ticket);
    const line = techView!.lines.find((l) => l.id === mine)!;
    expect(line.price_reference).toMatchObject({ basis: "sku", count: 3, min: 400000, max: 500000, median: 450000 });
  });

  it("is not given to someone who cannot set prices, nor printed on the invoice", async () => {
    const sku = `${RUN}-BAT2`;
    await pricedPart(await makeTicket(), sku, "Baterai Y", 300000);
    const t = await makeTicket();
    const mine = await pricedPart(t, sku, "Baterai Y", null);
    const ticket = await db.ticket.findUniqueOrThrow({ where: { id: t } });

    const salesView = await loadChargesPanel(ids.sales, ticket);
    expect(salesView!.lines.find((l) => l.id === mine)).not.toHaveProperty("price_reference");
    const invoiceLines = await loadTicketCharges(t, false);
    expect(invoiceLines.find((l) => l.id === mine)).not.toHaveProperty("price_reference");
  });
});

describe("Accurate codes for the cashier", () => {
  const jasaService = { id: 100688, sku: "100688", name: "JASA SERVICE", category: "JASA", brand: null, type: "SERVICE", unit: null, serialized: false, stockTotal: 0, warehouses: [], claimWarehouses: [] };
  const pengecekan = { ...jasaService, id: 101003, sku: "101003", name: "Penggantian & Pengecekan" };
  const accurateForm = (id: string) => form({ accurate_item_id: id });

  it("maps a job to an Accurate item read from the catalogue, and the line carries its code", async () => {
    catalog.items.set(jasaService.id, jasaService);
    as("head");
    expect(await setServiceJobAccurateItemAction(ids.job, accurateForm("100688"))).toEqual({ success: true });
    expect(await db.serviceJob.findUniqueOrThrow({ where: { id: ids.job } })).toMatchObject({
      accurate_item_id: 100688,
      accurate_sku: "100688",
      accurate_name: "JASA SERVICE",
    });
    as("tech");
    const t = await makeTicket();
    await add(t, { kind: "service_fee", service_job_id: ids.job });
    await addReplacedPartAction(form({ ticket_id: t, part: "battery", item_name: "Baterai" }));
    const part = await db.ticketReplacedPart.findFirstOrThrow({ where: { ticket_id: t } });
    await db.ticketReplacedPart.update({ where: { id: part.id }, data: { sku: "2508000007" } });
    await add(t, { kind: "other", description: "Kabel" });

    const lines = await loadTicketCharges(t, false);
    const byKind = Object.fromEntries(lines.map((l) => [l.kind, l.accurate_code]));
    expect(byKind).toEqual({ service_fee: "100688", part: "2508000007", other: null });
  });

  it("can be cleared, and refuses an unknown item or a catalogue that is down", async () => {
    as("admin");
    expect(await setServiceJobAccurateItemAction(ids.job, accurateForm(""))).toEqual({ success: true });
    expect((await db.serviceJob.findUniqueOrThrow({ where: { id: ids.job } })).accurate_sku).toBeNull();
    expect(await setServiceJobAccurateItemAction(ids.job, accurateForm("999999"))).toMatchObject({ error: expect.stringContaining("tidak ditemukan") });
    catalog.down = true;
    try {
      expect(await setServiceJobAccurateItemAction(ids.job, accurateForm("100688"))).toMatchObject({
        error: expect.stringContaining("tidak dapat dihubungi"),
      });
    } finally {
      catalog.down = false;
    }
  });

  it("applies one item to every job not yet mapped, leaving mapped ones alone", async () => {
    catalog.items.set(jasaService.id, jasaService);
    catalog.items.set(pengecekan.id, pengecekan);
    as("admin");
    // The action reaches every job in the database, the real ones included:
    // remember which were unmapped and put them back afterwards.
    const realUnmapped = (
      await db.serviceJob.findMany({ where: { accurate_item_id: null, NOT: { name: { startsWith: RUN } } }, select: { id: true } })
    ).map((j) => j.id);
    try {
      await setServiceJobAccurateItemAction(ids.job2, accurateForm("101003"));
      const r = await applyAccurateItemToUnmappedAction(accurateForm("100688"));
      expect(r).toMatchObject({ success: true });
      expect((await db.serviceJob.findUniqueOrThrow({ where: { id: ids.job2 } })).accurate_sku).toBe("101003");
      expect((await db.serviceJob.findUniqueOrThrow({ where: { id: ids.job } })).accurate_sku).toBe("100688");
      expect(await applyAccurateItemToUnmappedAction(accurateForm(""))).toMatchObject({ error: expect.stringContaining("Pilih item") });
    } finally {
      await db.serviceJob.updateMany({
        where: { id: { in: realUnmapped } },
        data: { accurate_item_id: null, accurate_sku: null, accurate_name: null },
      });
    }
  });

  it("is for whoever manages the Daftar Jasa only", async () => {
    as("tech");
    expect(await setServiceJobAccurateItemAction(ids.job, accurateForm("100688"))).toMatchObject({ error: expect.stringContaining("akses") });
    expect(await applyAccurateItemToUnmappedAction(accurateForm("100688"))).toMatchObject({ error: expect.stringContaining("akses") });
  });
});

describe("a part's Accurate code, entered once the item is received", () => {
  const battery = {
    id: 880001, sku: "2507000123", name: "BATERAI ASUS C31N1915 FOR SERVIS", category: "SPAREPART SERVICE",
    brand: null, type: "INVENTORY", unit: "PCS", serialized: false, stockTotal: 0, warehouses: [], claimWarehouses: [],
  };

  /** A battery recorded the way it is before Accurate has it: a plain name, no code, already priced. */
  async function typedPart(status: "on_progress" | "completed" = "on_progress") {
    const t = await makeTicket();
    as("tech");
    expect(await addReplacedPartAction(form({ ticket_id: t, part: "battery", item_name: "Baterai", quantity: "1" }))).toEqual({ success: true });
    const charge = (await lines(t))[0];
    await db.ticketCharge.update({ where: { id: charge.id }, data: { unit_price: 450000, unit_cost: 300000 } });
    if (status !== "on_progress") await db.ticket.update({ where: { id: t }, data: { status } });
    return { t, chargeId: charge.id };
  }
  const link = async (chargeId: string, itemId = battery.id) => {
    const { linkPartCatalogAction } = await import("./charges");
    return linkPartCatalogAction(chargeId, itemId);
  };

  beforeEach(() => {
    catalog.items.set(battery.id, battery);
  });

  it("takes the catalogue's code and name, on the part and its bill line, and leaves the money alone", async () => {
    const { t, chargeId } = await typedPart();
    expect(await link(chargeId)).toEqual({ success: true });
    expect(await db.ticketReplacedPart.findFirstOrThrow({ where: { ticket_id: t } })).toMatchObject({
      catalog_item_id: battery.id,
      sku: battery.sku,
      catalog_category: battery.category,
      item_name: battery.name,
      quantity: 1,
    });
    expect(await db.ticketCharge.findUniqueOrThrow({ where: { id: chargeId } })).toMatchObject({
      description: battery.name,
      unit_price: 450000,
      unit_cost: 300000,
      quantity: 1,
    });
    // And the invoice now has a code for the cashier.
    const [row] = await loadTicketCharges(t, false);
    expect(row).toMatchObject({ accurate_code: battery.sku, is_part: true });
  });

  it("is open to the holding technician after the customer has collected the unit", async () => {
    const { chargeId } = await typedPart("completed");
    as("tech");
    expect(await link(chargeId)).toEqual({ success: true });
  });

  it("is refused to a technician who does not hold the ticket", async () => {
    const { chargeId } = await typedPart();
    as("other");
    expect(await link(chargeId)).toMatchObject({ error: expect.stringContaining("tidak dapat") });
  });

  it("is open to an administrator and a head technician", async () => {
    const a = await typedPart("completed");
    as("admin");
    expect(await link(a.chargeId)).toEqual({ success: true });
    const h = await typedPart("completed");
    as("head");
    expect(await link(h.chargeId)).toEqual({ success: true });
  });

  it("does not overwrite a code already there", async () => {
    const { chargeId } = await typedPart();
    expect(await link(chargeId)).toEqual({ success: true });
    catalog.items.set(880002, { ...battery, id: 880002, sku: "OTHER", name: "OTHER" });
    expect(await link(chargeId, 880002)).toMatchObject({ error: expect.stringContaining("sudah punya kode") });
    expect((await db.ticketCharge.findUniqueOrThrow({ where: { id: chargeId } })).description).toBe(battery.name);
  });

  it("records one item when two people link at once", async () => {
    const { t, chargeId } = await typedPart();
    catalog.items.set(880002, { ...battery, id: 880002, sku: "OTHER", name: "OTHER" });
    const results = await Promise.all([link(chargeId), link(chargeId, 880002)]);
    expect(results.filter((r) => "success" in r)).toHaveLength(1);
    const part = await db.ticketReplacedPart.findFirstOrThrow({ where: { ticket_id: t } });
    const charge = await db.ticketCharge.findUniqueOrThrow({ where: { id: chargeId } });
    // Whichever won, the part and its line agree.
    expect(charge.description).toBe(part.item_name);
  });

  it("refuses an id the catalogue does not hold, and says so when the catalogue is down", async () => {
    const { chargeId } = await typedPart();
    expect(await link(chargeId, 999999)).toMatchObject({ error: expect.stringContaining("tidak ditemukan") });
    catalog.down = true;
    try {
      expect(await link(chargeId)).toMatchObject({ error: expect.stringContaining("tidak dapat dihubungi") });
    } finally {
      catalog.down = false;
    }
  });

  it("lets an administrator add the part from the bill, priced, and give it its code later", async () => {
    const { addPartChargeAction, linkPartCatalogAction } = await import("./charges");
    const t = await makeTicket();
    as("admin");
    expect(
      await addPartChargeAction(form({ ticket_id: t, part: "battery", item_name: "Baterai", quantity: "1", unit_price: "450000", vendor_id: ids.supplier }))
    ).toEqual({ success: true });
    const part = await db.ticketReplacedPart.findFirstOrThrow({ where: { ticket_id: t }, include: { charge: true } });
    expect(part).toMatchObject({ part: "battery", item_name: "Baterai", sku: null, recorded_by_id: ids.admin });
    expect(part.charge).toMatchObject({ kind: "part", description: "Baterai", unit_price: 450000, vendor_id: ids.supplier });

    expect(await linkPartCatalogAction(part.charge!.id, battery.id)).toEqual({ success: true });
    expect(await db.ticketCharge.findUniqueOrThrow({ where: { id: part.charge!.id } })).toMatchObject({
      description: battery.name,
      unit_price: 450000,
    });
  });

  it("adds a part picked from the catalogue under the catalogue's name and code", async () => {
    const { addPartChargeAction } = await import("./charges");
    const t = await makeTicket();
    as("admin");
    expect(await addPartChargeAction(form({ ticket_id: t, part: "battery", catalog_item_id: String(battery.id), item_name: "ignored" }))).toEqual({
      success: true,
    });
    expect(await db.ticketReplacedPart.findFirstOrThrow({ where: { ticket_id: t } })).toMatchObject({
      sku: battery.sku,
      item_name: battery.name,
    });
  });

  it("refuses a part from someone who may not change the bill, and an 'other' part with no name", async () => {
    const { addPartChargeAction } = await import("./charges");
    const t = await makeTicket();
    as("other");
    expect(await addPartChargeAction(form({ ticket_id: t, part: "lcd" }))).toMatchObject({ error: expect.stringContaining("tidak dapat") });
    as("admin");
    expect(await addPartChargeAction(form({ ticket_id: t, part: "other" }))).toMatchObject({ error: expect.stringContaining("Nama barang wajib") });
    expect(await addPartChargeAction(form({ ticket_id: t, part: "lcd", vendor_id: ids.repairer }))).toMatchObject({
      error: expect.any(String),
    });
    expect(await db.ticketReplacedPart.count({ where: { ticket_id: t } })).toBe(0);
  });

  it("the technician enters a part once — item, price, supplier, note and photos in one form", async () => {
    const { addPartChargeAction } = await import("./charges");
    const t = await makeTicket();
    as("tech");
    const fd = form({ ticket_id: t, part: "battery", item_name: "Baterai", quantity: "1", unit_price: "450000", vendor_id: ids.supplier, notes: "baterai lama kembung" });
    fd.append("photos", new File([new Uint8Array([1, 2, 3])], "dus.jpg", { type: "image/jpeg" }));
    fd.append("photos", new File([new Uint8Array([4, 5, 6])], "label.jpg", { type: "image/jpeg" }));
    expect(await addPartChargeAction(fd)).toEqual({ success: true });

    const part = await db.ticketReplacedPart.findFirstOrThrow({ where: { ticket_id: t }, include: { charge: true, photos: true } });
    expect(part).toMatchObject({ part: "battery", item_name: "Baterai", notes: "baterai lama kembung", recorded_by_id: ids.tech });
    expect(part.photos).toHaveLength(2);
    // Priced on the way in: nothing left to fill in on the bill afterwards.
    expect(part.charge).toMatchObject({ unit_price: 450000, vendor_id: ids.supplier });
  });

  it("refuses part photos that are not images, or too many, and records nothing", async () => {
    const { addPartChargeAction } = await import("./charges");
    const t = await makeTicket();
    as("tech");
    const video = form({ ticket_id: t, part: "lcd" });
    video.append("photos", new File([new Uint8Array([1])], "clip.mp4", { type: "video/mp4" }));
    expect(await addPartChargeAction(video)).toMatchObject({ error: expect.stringContaining("gambar") });
    const many = form({ ticket_id: t, part: "lcd" });
    for (let i = 0; i < 6; i++) many.append("photos", new File([new Uint8Array([i])], `${i}.jpg`, { type: "image/jpeg" }));
    expect(await addPartChargeAction(many)).toMatchObject({ error: expect.stringContaining("Maksimal") });
    expect(await db.ticketReplacedPart.count({ where: { ticket_id: t } })).toBe(0);
  });

  it("is only for part lines", async () => {
    const t = await makeTicket();
    await add(t, { kind: "other", description: "Kabel", unit_price: "10000" });
    expect(await link((await lines(t))[0].id)).toMatchObject({ error: expect.stringContaining("Part tidak ditemukan") });
  });
});

describe("finished with a part still uncoded: the technician holding it is reminded", () => {
  const reminders = (ticketId: string) =>
    db.notification.findMany({ where: { ticket_id: ticketId, message: { contains: "kode Accurate" } } });

  /** `done` needs a proof photo; the storage itself is mocked above. */
  function doneForm(ticketId: string) {
    const fd = form({ ticketId, newStatus: "done" });
    fd.append("files", new File(["x"], "proof.jpg", { type: "image/jpeg" }));
    return fd;
  }

  async function withPart(sku: string | null) {
    const t = await makeTicket();
    as("tech");
    expect(await addReplacedPartAction(form({ ticket_id: t, part: "battery", item_name: "Baterai", quantity: "1" }))).toEqual({ success: true });
    if (sku) await db.ticketReplacedPart.updateMany({ where: { ticket_id: t }, data: { sku } });
    return t;
  }

  it("when the technician marks it done", async () => {
    const t = await withPart(null);
    expect(await updateTicketStatusAction(doneForm(t))).toMatchObject({ success: true });
    const [n] = await reminders(t);
    expect(n).toMatchObject({ user_id: ids.tech, type: "status_update", is_read: false });
    expect(n.message).toContain("1 part belum punya kode Accurate");
  });

  it("when an administrator marks it done — still to the technician, not the admin", async () => {
    const t = await withPart(null);
    as("admin");
    expect(await adminUpdateTicketStatusAction(t, "done")).not.toHaveProperty("error");
    expect((await reminders(t)).map((n) => n.user_id)).toEqual([ids.tech]);
  });

  it("not when every part has its code", async () => {
    const t = await withPart("2507000123");
    expect(await updateTicketStatusAction(doneForm(t))).toMatchObject({ success: true });
    expect(await reminders(t)).toHaveLength(0);
  });
});

describe("deleting from Data Master, and the activity log", () => {
  beforeAll(() => {
    process.env.ACTIVITY_LOG_IN_TESTS = "1";
  });
  afterAll(() => {
    delete process.env.ACTIVITY_LOG_IN_TESTS;
  });

  const logged = (actor: string, action: string) =>
    db.activityLog.findMany({
      where: { actor_id: ids[actor], action },
      orderBy: { created_at: "desc" },
      select: { summary: true, entity_type: true, entity_id: true, entity_label: true },
    });

  it("refuses to delete a vendor or a job a bill uses, and says to deactivate it", async () => {
    const t = await makeTicket();
    as("tech");
    expect(await add(t, { kind: "external_service", description: "Reball IC", vendor_id: ids.repairer })).toEqual({ success: true });
    expect(await add(t, { kind: "service_fee", service_job_id: ids.job2 })).toEqual({ success: true });

    as("admin");
    expect(await deleteVendorAction(ids.repairer)).toMatchObject({ error: expect.stringContaining("Nonaktifkan") });
    expect(await deleteServiceJobAction(ids.job2)).toMatchObject({ error: expect.stringContaining("Nonaktifkan") });
    expect(await db.vendor.count({ where: { id: ids.repairer } })).toBe(1);
    expect(await db.serviceJob.count({ where: { id: ids.job2 } })).toBe(1);
  });

  it("deletes an unused one for good, and logs who did it", async () => {
    as("admin");
    const v = await db.vendor.create({ data: { name: `${RUN} Belum Dipakai`, supplies_parts: true }, select: { id: true } });
    const j = await db.serviceJob.create({ data: { name: `${RUN} Jasa Baru`, points: 1 }, select: { id: true } });
    expect(await deleteVendorAction(v.id)).toEqual({ success: true });
    expect(await deleteServiceJobAction(j.id)).toEqual({ success: true });
    expect(await db.vendor.count({ where: { id: v.id } })).toBe(0);
    expect(await db.serviceJob.count({ where: { id: j.id } })).toBe(0);

    expect(await logged("admin", "vendor.delete")).toEqual([
      expect.objectContaining({ entity_type: "vendor", entity_id: v.id, entity_label: `${RUN} Belum Dipakai` }),
    ]);
    expect((await logged("admin", "service_job.delete"))[0].summary).toContain(`${RUN} Jasa Baru`);
  });

  it("a technician may not delete from the lists", async () => {
    as("tech");
    expect(await deleteVendorAction(ids.supplier)).toMatchObject({ error: expect.stringContaining("akses") });
    expect(await deleteServiceJobAction(ids.oldJob)).toMatchObject({ error: expect.stringContaining("akses") });
  });

  it("logs a bill line under the ticket, without the cost price", async () => {
    await grant(["edit_cost:technician", "view_cost:technician"]);
    const t = await makeTicket();
    as("tech");
    expect(await add(t, { kind: "other", description: "Kabel SATA", unit_price: "25000", unit_cost: "9000" })).toEqual({ success: true });
    const [entry] = await logged("tech", "charge.add");
    expect(entry).toMatchObject({ entity_type: "ticket", entity_id: t });
    expect(entry.entity_label).toMatch(new RegExp(`^${RUN}-`));
    expect(entry.summary).toContain("Kabel SATA");
    expect(entry.summary).toContain("25.000");
    expect(entry.summary).not.toContain("9.000");
  });

  it("logs a status change with both statuses in words", async () => {
    const t = await makeTicket({ status: "on_progress" });
    as("admin");
    expect(await adminUpdateTicketStatusAction(t, "cancelled", "Customer batal")).toMatchObject({ success: true });
    const [entry] = await logged("admin", "ticket.status");
    expect(entry.entity_id).toBe(t);
    expect(entry.summary).toContain("→");
    expect(entry.summary).toContain("Customer batal");
    expect(entry.summary).not.toContain("on_progress");
  });
});
