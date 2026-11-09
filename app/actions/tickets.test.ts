/**
 * Integration tests for createTicketAction, focused on the warranty-claim path
 * and on ticket-code allocation.
 *
 * Runs against the local Postgres container; vitest.setup.ts refuses any
 * non-local DATABASE_URL. Fixtures are namespaced per run and removed in
 * afterAll.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

vi.mock("next/headers", () => ({
  headers: async () => new Map<string, string>(),
}));

vi.mock("@/lib/r2", () => ({
  uploadToR2: vi.fn(async () => "https://r2.test/uploaded.jpg"),
  getExt: () => "jpg",
  getFileType: () => "image" as const,
}));

vi.mock("@/lib/email", () => ({
  sendTicketStatusEmail: vi.fn(async () => undefined),
  EMAIL_MILESTONES: [],
}));

// The catalogue API (data.hnsitcenter.id) is replaced; everything else is real.
const catalog = vi.hoisted(() => ({ items: new Map<number, unknown>(), down: false }));
vi.mock("@/lib/catalog/hns-data", () => {
  class CatalogUnavailableError extends Error {}
  return {
    CatalogUnavailableError,
    isCatalogConfigured: () => true,
    searchCatalog: async () => [],
    getCatalogItem: async (id: number) => {
      if (catalog.down) throw new CatalogUnavailableError("catalog answered 502");
      return catalog.items.get(id) ?? null;
    },
  };
});

const session = { userId: "", role: "Technician", name: "Test Technician" };
vi.mock("@/lib/session", () => ({
  requireSession: async () => session,
  getSession: async () => session,
  requireRole: async (...roles: string[]) => {
    if (!roles.includes(session.role)) throw new Error("Unauthorized");
    return session;
  },
}));

const { db } = await import("@/lib/db");
const { createTicketAction } = await import("./tickets");

const CODE = `Y${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
let storeId: string;
let technicianId: string;

/** The payload the create form sends for a warranty claim. */
function claimForm(overrides: Record<string, string | null> = {}) {
  const fd = new FormData();
  const base: Record<string, string> = {
    store_location_id: storeId,
    technician_id: technicianId,
    customer_type: "User",
    customer_name: "JEJU",
    phone: "+6287711587127",
    ticket_type: "warranty_claim",
    device_type: "Laptop_Office",
    device_sn: "SN-TEST-12345",
    purchase_date: "2026-01-15",
    notes: "Layar berkedip sejak seminggu lalu",
    terms_accepted: "1",
    pickup_method: "self_pickup",
  };
  for (const [k, v] of Object.entries({ ...base, ...overrides })) {
    if (v !== null) fd.append(k, v);
  }
  return fd;
}

beforeAll(async () => {
  const [store, tech] = await Promise.all([
    db.storeLocation.create({
      data: { name: `${CODE} Store`, code: CODE, address: "Test" },
      select: { id: true },
    }),
    db.user.create({
      data: {
        name: `${CODE} tech`,
        email: `${CODE}.tech@test.local`,
        phone_number: "+628100000010",
        address: "Test",
        role: "Technician",
        password: "x",
      },
      select: { id: true },
    }),
  ]);
  storeId = store.id;
  technicianId = tech.id;
  session.userId = tech.id;
});

afterAll(async () => {
  const tickets = await db.ticket.findMany({
    where: { store_location_id: storeId },
    select: { id: true },
  });
  const ids = tickets.map((t) => t.id);
  if (ids.length > 0) {
    await db.notification.deleteMany({ where: { ticket_id: { in: ids } } });
    await db.ticketStatusLog.deleteMany({ where: { ticket_id: { in: ids } } });
    await db.ticketAttachment.deleteMany({ where: { ticket_id: { in: ids } } });
    await db.ticketWarrantyDetail.deleteMany({ where: { ticket_id: { in: ids } } });
    // created_by references the test user, so the lines go before it does.
    await db.ticketCharge.deleteMany({ where: { ticket_id: { in: ids } } });
    await db.ticket.deleteMany({ where: { id: { in: ids } } });
  }
  await db.technicianPerformance.deleteMany({ where: { technician_id: technicianId } });
  await db.user.deleteMany({ where: { id: technicianId } });
  await db.storeLocation.deleteMany({ where: { id: storeId } });
  await db.$disconnect();
});

describe("createTicketAction — warranty claim", () => {
  it("creates the ticket", async () => {
    const result = await createTicketAction(claimForm());
    expect(result).toMatchObject({ success: true });

    const ticket = await db.ticket.findFirst({
      where: { store_location_id: storeId, device_sn: "SN-TEST-12345" },
      select: { ticket_type: true, status: true, ticket_code: true, technician_id: true },
    });
    expect(ticket).toMatchObject({
      ticket_type: "warranty_claim",
      status: "waiting",
      technician_id: technicianId,
    });
    expect(ticket?.ticket_code).toMatch(new RegExp(`^${CODE}-\\d{6}$`));
  });

  it("sends the technician back to their own ticket list", async () => {
    const result = await createTicketAction(claimForm({ device_sn: "SN-REDIRECT" }));
    expect(result).toMatchObject({ redirectUrl: "/technician/tickets" });
  });

  it("refuses a claim with no serial number", async () => {
    const before = await db.ticket.count({ where: { store_location_id: storeId } });
    const result = await createTicketAction(claimForm({ device_sn: null }));

    expect(result).toMatchObject({ error: expect.stringContaining("Serial number") });
    expect(await db.ticket.count({ where: { store_location_id: storeId } })).toBe(before);
  });

  it("refuses a claim with no purchase date", async () => {
    const result = await createTicketAction(claimForm({ device_sn: "SN-NODATE", purchase_date: null }));
    expect(result).toMatchObject({ error: expect.stringContaining("Tanggal pembelian") });
  });

  it("refuses a claim whose purchase date is not a date", async () => {
    const result = await createTicketAction(
      claimForm({ device_sn: "SN-BADDATE", purchase_date: "bukan-tanggal" }),
    );
    expect(result).toMatchObject({ error: expect.stringContaining("Tanggal pembelian") });
  });

  it("leaves other ticket types free of the claim requirements", async () => {
    const fd = claimForm({ ticket_type: "service", device_sn: null, purchase_date: null });
    expect(await createTicketAction(fd)).toMatchObject({ success: true });
  });
});

describe("createTicketAction — unit ownership at intake", () => {
  const stockForm = (overrides: Record<string, string | null> = {}) =>
    claimForm({
      unit_ownership: "store_stock",
      stock_origin: "Gudang Nagoya rak B3",
      customer_name: null,
      phone: null,
      purchase_date: null,
      ...overrides,
    });

  it("opens a store-stock claim with no customer and no purchase date", async () => {
    const result = await createTicketAction(stockForm({ device_sn: "SN-STOCK-1" }));
    expect(result).toMatchObject({ success: true });

    const ticket = await db.ticket.findFirst({
      where: { store_location_id: storeId, device_sn: "SN-STOCK-1" },
      select: {
        customer_name: true,
        customer_phone: true,
        customer_email: true,
        warranty_detail: { select: { unit_ownership: true, stock_origin: true, purchase_date: true } },
      },
    });
    expect(ticket).toMatchObject({
      customer_name: null,
      customer_phone: null,
      customer_email: null,
      warranty_detail: {
        unit_ownership: "store_stock",
        stock_origin: "Gudang Nagoya rak B3",
        purchase_date: null,
      },
    });
  });

  it("discards customer fields sent with a store-stock claim rather than storing them", async () => {
    await createTicketAction(
      stockForm({
        device_sn: "SN-STOCK-2",
        customer_name: "Nama Karangan",
        phone: "+628111111111",
        customer_email: "x@test.local",
      }),
    );
    const ticket = await db.ticket.findFirst({
      where: { store_location_id: storeId, device_sn: "SN-STOCK-2" },
      select: { customer_name: true, customer_phone: true, customer_email: true },
    });
    expect(ticket).toEqual({ customer_name: null, customer_phone: null, customer_email: null });
  });

  it("refuses store stock without its origin", async () => {
    const before = await db.ticket.count({ where: { store_location_id: storeId } });
    const result = await createTicketAction(stockForm({ stock_origin: null }));
    expect(result).toMatchObject({ error: expect.stringMatching(/asal stok/i) });
    expect(await db.ticket.count({ where: { store_location_id: storeId } })).toBe(before);
  });

  it("refuses store stock on anything but a warranty claim", async () => {
    const result = await createTicketAction(
      stockForm({ ticket_type: "service", device_sn: null }),
    );
    expect(result).toMatchObject({ error: expect.stringMatching(/klaim garansi/i) });
  });

  it("refuses a customer claim without a customer name", async () => {
    const result = await createTicketAction(claimForm({ customer_name: null }));
    expect(result).toMatchObject({ error: expect.stringMatching(/nama/i) });
  });

  it("records a customer's claim as customer-owned", async () => {
    await createTicketAction(claimForm({ device_sn: "SN-CUST-OWN" }));
    const detail = await db.ticketWarrantyDetail.findFirst({
      where: { ticket: { store_location_id: storeId, device_sn: "SN-CUST-OWN" } },
      select: { unit_ownership: true, stock_origin: true },
    });
    expect(detail).toEqual({ unit_ownership: "customer", stock_origin: null });
  });
});

describe("createTicketAction — photos of the claimed unit", () => {
  const R2 = "https://r2.test/temp/u1";
  function withFiles(form: FormData, field: string, urls: string[]) {
    for (const u of urls) form.append(field, u);
    return form;
  }

  it("stores the intake upload as the invoice and the unit photos apart", async () => {
    const form = claimForm({ device_sn: "SN-PHOTOS-1" });
    withFiles(form, "preuploaded_urls", [`${R2}/nota.jpg`]);
    withFiles(form, "unit_photo_urls", [`${R2}/depan.jpg`, `${R2}/label-sn.png`]);
    expect(await createTicketAction(form)).toMatchObject({ success: true });

    const ticket = await db.ticket.findFirst({
      where: { store_location_id: storeId, device_sn: "SN-PHOTOS-1" },
      select: { attachments: { select: { file_url: true, file_type: true, kind: true }, orderBy: { file_url: "asc" } } },
    });
    expect(ticket?.attachments).toEqual([
      { file_url: `${R2}/depan.jpg`, file_type: "image", kind: "unit_photo" },
      { file_url: `${R2}/label-sn.png`, file_type: "image", kind: "unit_photo" },
      { file_url: `${R2}/nota.jpg`, file_type: "image", kind: "invoice" },
    ]);
  });

  it("refuses a unit photo that is not an image", async () => {
    const form = withFiles(claimForm({ device_sn: "SN-PHOTOS-2" }), "unit_photo_urls", [`${R2}/video.mp4`]);
    expect(await createTicketAction(form)).toMatchObject({ error: expect.stringContaining("gambar") });
  });

  it("refuses more than five unit photos", async () => {
    const urls = Array.from({ length: 6 }, (_, i) => `${R2}/f${i}.jpg`);
    const form = withFiles(claimForm({ device_sn: "SN-PHOTOS-3" }), "unit_photo_urls", urls);
    expect(await createTicketAction(form)).toMatchObject({ error: expect.stringContaining("Maksimal 5") });
  });

  it("refuses unit photos on a ticket that is not a claim", async () => {
    const form = withFiles(
      claimForm({ ticket_type: "service", device_sn: null, purchase_date: null }),
      "unit_photo_urls",
      [`${R2}/x.jpg`]
    );
    expect(await createTicketAction(form)).toMatchObject({ error: expect.stringContaining("klaim garansi") });
  });

  it("leaves the uploads of other ticket types unmarked", async () => {
    const form = withFiles(
      claimForm({ ticket_type: "service", device_sn: "SN-SERVICE-UPLOAD", purchase_date: null }),
      "preuploaded_urls",
      [`${R2}/kondisi.jpg`]
    );
    expect(await createTicketAction(form)).toMatchObject({ success: true });
    const ticket = await db.ticket.findFirst({
      where: { store_location_id: storeId, device_sn: "SN-SERVICE-UPLOAD" },
      select: { attachments: { select: { kind: true } } },
    });
    expect(ticket?.attachments).toEqual([{ kind: null }]);
  });
});

describe("createTicketAction — ticket codes", () => {
  it("numbers tickets sequentially within a store", async () => {
    const seen: string[] = [];
    for (let i = 0; i < 3; i++) {
      const result = await createTicketAction(claimForm({ device_sn: `SN-SEQ-${i}` }));
      expect(result).toMatchObject({ success: true });
      const t = await db.ticket.findFirst({
        where: { device_sn: `SN-SEQ-${i}` },
        select: { ticket_code: true },
      });
      seen.push(t!.ticket_code);
    }

    const nums = seen.map((c) => parseInt(c.slice(CODE.length + 1), 10));
    expect(nums[1]).toBe(nums[0] + 1);
    expect(nums[2]).toBe(nums[1] + 1);
  });

  it("does not reuse a number when the newest row carries a low one", async () => {
    // The reported production failure: a backdated row leaves a low number on
    // the newest ticket, and allocation by created_at then repeats it forever.
    const highest = await db.ticket.findFirst({
      where: { ticket_code: { startsWith: `${CODE}-` } },
      orderBy: { ticket_code: "desc" },
      select: { ticket_code: true },
    });
    const highestNum = parseInt(highest!.ticket_code.slice(CODE.length + 1), 10);

    // Make the LOWEST-numbered ticket the most recently created one.
    await db.ticket.update({
      where: { ticket_code: `${CODE}-000001` },
      data: { created_at: new Date() },
    });

    const result = await createTicketAction(claimForm({ device_sn: "SN-AFTER-BACKDATE" }));
    expect(result).toMatchObject({ success: true });

    const created = await db.ticket.findFirst({
      where: { device_sn: "SN-AFTER-BACKDATE" },
      select: { ticket_code: true },
    });
    expect(created?.ticket_code).toBe(
      `${CODE}-${String(highestNum + 1).padStart(6, "0")}`,
    );
  });

  it("gives every ticket in the store a distinct code", async () => {
    const all = await db.ticket.findMany({
      where: { store_location_id: storeId },
      select: { ticket_code: true },
    });
    expect(new Set(all.map((t) => t.ticket_code)).size).toBe(all.length);
  });
});

describe("createTicketAction — the unit picked from the Accurate catalogue", () => {
  const vivobook = {
    id: 9101,
    sku: "LPT-ASUS-A416",
    name: "ASUS VIVOBOOK 14 A416 I3",
    category: "LAPTOP ASUS",
    brand: null,
    type: "INVENTORY",
    unit: "PCS",
    serialized: true,
    stockTotal: 0,
    warehouses: [], claimWarehouses: [],
  };
  const unitOf = (sn: string) =>
    db.ticket.findFirstOrThrow({
      where: { store_location_id: storeId, device_sn: sn },
      select: { device_name: true, device_sku: true, device_catalog_item_id: true, device_catalog_category: true },
    });

  it("records the catalogue's name, SKU and category, not what the browser sent", async () => {
    catalog.items.set(vivobook.id, vivobook);
    const fd = claimForm({
      ticket_type: "service",
      device_sn: "SN-CATALOG-1",
      purchase_date: null,
      device_name: "laptop asus biru",
      device_catalog_item_id: String(vivobook.id),
    });
    expect(await createTicketAction(fd)).toMatchObject({ success: true });
    expect(await unitOf("SN-CATALOG-1")).toEqual({
      device_name: "ASUS VIVOBOOK 14 A416 I3",
      device_sku: "LPT-ASUS-A416",
      device_catalog_item_id: 9101,
      device_catalog_category: "LAPTOP ASUS",
    });
  });

  it("works for a warranty claim too", async () => {
    catalog.items.set(vivobook.id, vivobook);
    const fd = claimForm({ device_sn: "SN-CATALOG-2", device_catalog_item_id: String(vivobook.id) });
    expect(await createTicketAction(fd)).toMatchObject({ success: true });
    expect((await unitOf("SN-CATALOG-2")).device_sku).toBe("LPT-ASUS-A416");
  });

  it("keeps a typed unit as typed, with no catalogue fields", async () => {
    const fd = claimForm({ ticket_type: "service", device_sn: "SN-TYPED-1", purchase_date: null, device_name: "Laptop rakitan lama" });
    expect(await createTicketAction(fd)).toMatchObject({ success: true });
    expect(await unitOf("SN-TYPED-1")).toEqual({
      device_name: "Laptop rakitan lama",
      device_sku: null,
      device_catalog_item_id: null,
      device_catalog_category: null,
    });
  });

  it("refuses an id the catalogue does not know, or that is not an id", async () => {
    for (const id of ["424242", "abc", "-3"]) {
      const fd = claimForm({ ticket_type: "service", device_sn: `SN-BAD-${id}`, purchase_date: null, device_catalog_item_id: id });
      expect(await createTicketAction(fd), id).toMatchObject({ error: expect.stringMatching(/katalog/i) });
    }
    expect(await db.ticket.count({ where: { store_location_id: storeId, device_sn: { startsWith: "SN-BAD-" } } })).toBe(0);
  });

  it("says so when the catalogue is down, and creates nothing", async () => {
    catalog.down = true;
    try {
      const fd = claimForm({ ticket_type: "service", device_sn: "SN-DOWN-1", purchase_date: null, device_catalog_item_id: "9101" });
      expect(await createTicketAction(fd)).toMatchObject({ error: expect.stringContaining("ketik nama unit secara manual") });
      expect(await db.ticket.count({ where: { device_sn: "SN-DOWN-1" } })).toBe(0);
    } finally {
      catalog.down = false;
    }
  });

  it("stores a catalogue name longer than the old 191-character column", async () => {
    const long = { ...vivobook, id: 9102, sku: "LONG-1", name: "X".repeat(240) };
    catalog.items.set(long.id, long);
    const fd = claimForm({ ticket_type: "service", device_sn: "SN-LONG-1", purchase_date: null, device_catalog_item_id: "9102" });
    expect(await createTicketAction(fd)).toMatchObject({ success: true });
    expect((await unitOf("SN-LONG-1")).device_name).toHaveLength(240);
  });
});

describe("createTicketAction — PC build components and upgrade items from the catalogue", () => {
  const item = (id: number, sku: string, name: string, category: string) => ({
    id, sku, name, category, brand: null, type: "INVENTORY", unit: "PCS", serialized: false, stockTotal: 3, warehouses: [], claimWarehouses: [],
  });
  const gpu = item(9201, "VGA-RTX4060", "MSI RTX 4060 VENTUS 2X 8GB", "VGA CARD");
  const ram = item(9202, "RAM-DDR4-8", "RAM KINGSTON 8GB DDR4 3200", "MEMORY");
  let upgradeRam: string;
  let upgradeSsd: string;

  const ticketBySn = (sn: string) =>
    db.ticket.findFirst({
      where: { store_location_id: storeId, device_sn: sn },
      select: {
        id: true,
        pc_components: { select: { component_name: true, catalog_item_id: true, sku: true, catalog_category: true, quantity: true } },
        upgrade_details: {
          select: { upgrade_id: true, item_name: true, catalog_item_id: true, sku: true, catalog_category: true, quantity: true },
        },
      },
    });
  const build = (sn: string, extra: Record<string, string | null>) =>
    claimForm({ ticket_type: "pc_build", device_type: "PC_Office", device_sn: sn, purchase_date: null, ...extra });
  const upgrade = (sn: string, extra: Record<string, string | null>) =>
    claimForm({ ticket_type: "upgrade", device_sn: sn, purchase_date: null, ...extra });
  const byName = <T extends { component_name: string }>(rows: T[]) => [...rows].sort((a, b) => a.component_name.localeCompare(b.component_name));

  beforeAll(async () => {
    catalog.items.set(gpu.id, gpu);
    catalog.items.set(ram.id, ram);
    [upgradeRam, upgradeSsd] = await Promise.all([
      db.upgrade.create({ data: { name: `${CODE} RAM`, points: 2 }, select: { id: true } }).then((u) => u.id),
      db.upgrade.create({ data: { name: `${CODE} SSD`, points: 2 }, select: { id: true } }).then((u) => u.id),
    ]);
  });

  afterAll(async () => {
    // The upgrades are referenced without a cascade, so their tickets go first.
    await db.ticket.deleteMany({ where: { store_location_id: storeId, ticket_type: "upgrade" } });
    await db.upgrade.deleteMany({ where: { id: { in: [upgradeRam, upgradeSsd] } } });
  });

  it("records a picked component with the catalogue's name, SKU and quantity, and a typed one as typed", async () => {
    const posted = [
      { catalogItemId: gpu.id, name: "rtx yang murah", quantity: 1 },
      { catalogItemId: null, name: "Casing bawaan customer", quantity: 1 },
      { catalogItemId: ram.id, name: "", quantity: 2 },
    ];
    expect(await createTicketAction(build("SN-PCB-1", { pc_components_json: JSON.stringify(posted) }))).toMatchObject({ success: true });
    const t = await ticketBySn("SN-PCB-1");
    expect(byName(t!.pc_components)).toEqual([
      { component_name: "Casing bawaan customer", catalog_item_id: null, sku: null, catalog_category: null, quantity: 1 },
      { component_name: "MSI RTX 4060 VENTUS 2X 8GB", catalog_item_id: gpu.id, sku: "VGA-RTX4060", catalog_category: "VGA CARD", quantity: 1 },
      { component_name: "RAM KINGSTON 8GB DDR4 3200", catalog_item_id: ram.id, sku: "RAM-DDR4-8", catalog_category: "MEMORY", quantity: 2 },
    ]);
  });

  it("still accepts the plain names a form loaded before this release posts", async () => {
    const fd = build("SN-PCB-OLD", {});
    fd.append("pcComponents", "RTX 4060");
    fd.append("pcComponents", "i5-13400F");
    expect(await createTicketAction(fd)).toMatchObject({ success: true });
    const t = await ticketBySn("SN-PCB-OLD");
    expect(byName(t!.pc_components).map((c) => [c.component_name, c.sku, c.quantity])).toEqual([
      ["i5-13400F", null, 1],
      ["RTX 4060", null, 1],
    ]);
  });

  it("refuses an id the catalogue does not know, a broken list, or a catalogue that is down — and creates nothing", async () => {
    const unknown = JSON.stringify([{ catalogItemId: 777777, name: "x", quantity: 1 }]);
    expect(await createTicketAction(build("SN-PCB-BAD-1", { pc_components_json: unknown }))).toMatchObject({
      error: expect.stringMatching(/tidak ditemukan di katalog/),
    });
    expect(await createTicketAction(build("SN-PCB-BAD-2", { pc_components_json: "[{" }))).toMatchObject({
      error: expect.stringMatching(/tidak terbaca/),
    });
    catalog.down = true;
    try {
      const picked = JSON.stringify([{ catalogItemId: gpu.id, name: "", quantity: 1 }]);
      expect(await createTicketAction(build("SN-PCB-BAD-3", { pc_components_json: picked }))).toMatchObject({
        error: expect.stringContaining("ketik namanya secara manual"),
      });
    } finally {
      catalog.down = false;
    }
    expect(await db.ticket.count({ where: { store_location_id: storeId, device_sn: { startsWith: "SN-PCB-BAD-" } } })).toBe(0);
  });

  it("records the item fitted for each upgrade, and an upgrade chosen without one", async () => {
    const selections = [
      { upgradeId: upgradeRam, item: { catalogItemId: ram.id, name: "ram", quantity: 2 } },
      { upgradeId: upgradeSsd, item: null },
    ];
    expect(await createTicketAction(upgrade("SN-UPG-1", { upgrade_selections_json: JSON.stringify(selections) }))).toMatchObject({
      success: true,
    });
    const t = await ticketBySn("SN-UPG-1");
    const byUpgrade = Object.fromEntries(t!.upgrade_details.map((d) => [d.upgrade_id, d]));
    expect(byUpgrade[upgradeRam]).toEqual({
      upgrade_id: upgradeRam, item_name: "RAM KINGSTON 8GB DDR4 3200", catalog_item_id: ram.id, sku: "RAM-DDR4-8",
      catalog_category: "MEMORY", quantity: 2,
    });
    expect(byUpgrade[upgradeSsd]).toEqual({
      upgrade_id: upgradeSsd, item_name: null, catalog_item_id: null, sku: null, catalog_category: null, quantity: 1,
    });
  });

  it("still accepts the upgrade ids a form loaded before this release posts, and refuses one upgrade chosen twice", async () => {
    const fd = upgrade("SN-UPG-OLD", {});
    fd.append("upgrade_ids", upgradeSsd);
    expect(await createTicketAction(fd)).toMatchObject({ success: true });
    expect((await ticketBySn("SN-UPG-OLD"))!.upgrade_details).toMatchObject([{ upgrade_id: upgradeSsd, item_name: null }]);

    const twice = JSON.stringify([{ upgradeId: upgradeRam, item: null }, { upgradeId: upgradeRam, item: null }]);
    expect(await createTicketAction(upgrade("SN-UPG-TWICE", { upgrade_selections_json: twice }))).toMatchObject({
      error: expect.stringMatching(/dua kali/),
    });
    expect(await ticketBySn("SN-UPG-TWICE")).toBeNull();
  });
});

describe("createTicketAction — the check fee goes on the bill", () => {
  const serviceForm = (overrides: Record<string, string | null> = {}) =>
    claimForm({ ticket_type: "service", device_sn: null, purchase_date: null, ...overrides });
  const chargesOf = async (sn: string) => {
    const t = await db.ticket.findFirst({ where: { store_location_id: storeId, device_sn: sn }, select: { id: true } });
    return db.ticketCharge.findMany({
      where: { ticket_id: t!.id },
      select: { kind: true, description: true, quantity: true, unit_price: true, service_job: { select: { name: true } }, created_by_id: true },
    });
  };

  it("adds one Diagnosa / Pengecekan line priced at the recorded fee", async () => {
    expect(await createTicketAction(serviceForm({ device_sn: "SN-FEE-1", is_overnight_check: "1" }))).toMatchObject({ success: true });
    const lines = await chargesOf("SN-FEE-1");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      kind: "service_fee",
      description: "Diagnosa / Pengecekan",
      quantity: 1,
      unit_price: 50000,
      created_by_id: technicianId,
    });
  });

  it("adds nothing when no fee was recorded", async () => {
    expect(await createTicketAction(serviceForm({ device_sn: "SN-FEE-0" }))).toMatchObject({ success: true });
    expect(await chargesOf("SN-FEE-0")).toEqual([]);
  });

  it("does not bill a claim that was sent the flag", async () => {
    expect(await createTicketAction(claimForm({ device_sn: "SN-FEE-CLAIM", is_overnight_check: "1" }))).toMatchObject({ success: true });
    expect(await chargesOf("SN-FEE-CLAIM")).toEqual([]);
  });
});
