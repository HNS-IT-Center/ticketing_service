/**
 * Integration tests for a PC build opened from its e-commerce quotation, and
 * for who is notified when any ticket is created (assigned technician, or the
 * store's coordinators when nobody is).
 *
 * Runs createTicketAction against the local database. The stored PDF is
 * replaced by the parsed text of the real quotation (the parser has its own
 * tests in lib/pc-build-quote), the catalogue API is replaced, and the
 * e-commerce API answers with the contract's fixture through a stubbed fetch.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fixture from "@/lib/pc-build-quote/__fixtures__/quote-hnspc-0027.json";
import apiFixture from "@/lib/ecommerce/__fixtures__/quote-api-0027.json";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock("next/headers", () => ({ headers: async () => new Map<string, string>() }));
vi.mock("@/lib/email", () => ({ sendTicketStatusEmail: vi.fn(async () => undefined), EMAIL_MILESTONES: [] }));
vi.mock("@/lib/r2", () => ({
  uploadToR2: vi.fn(async () => "https://r2.test/uploaded.jpg"),
  getExt: () => "jpg",
  getFileType: () => "image" as const,
  readFromStorage: vi.fn(async () => null),
}));

// The stored quotation: the real PDF's text, parsed by the real parser.
const stored = vi.hoisted(() => ({ missing: false, salesName: null as string | null }));
vi.mock("@/lib/pc-build-quote/read", async () => {
  const { parseQuote } = await import("@/lib/pc-build-quote/parse");
  return {
    MAX_QUOTE_PDF_BYTES: 5 * 1024 * 1024,
    readQuotePdf: vi.fn(),
    readStoredQuote: vi.fn(async () =>
      stored.missing
        ? { ok: false, error: "PDF quotation tidak ditemukan lagi. Unggah ulang PDF-nya." }
        : parseQuote(
            (fixture as { str: string; x: number; y: number }[][]).map((page, i) =>
              // The header's "Sales: …" line, when a test wants one printed.
              i === 0 && stored.salesName
                ? [...page, { str: "Sales", x: 460, y: 699 }, { str: stored.salesName, x: 487, y: 699 }]
                : page,
            ),
          ),
    ),
  };
});

// The catalogue knows the processor's SKU and nothing else.
vi.mock("@/lib/catalog/hns-data", () => {
  class CatalogUnavailableError extends Error {}
  return {
    CatalogUnavailableError,
    isCatalogConfigured: () => true,
    searchCatalog: async (q: string) =>
      q === "2606000158" ? [{ id: 9001, sku: "2606000158", name: "PROCESSOR INTEL CORE I3-12100 TRAY", category: "PROCESSOR INTEL" }] : [],
    getCatalogItem: async () => null,
  };
});

const session = { userId: "", role: "Sales", name: "Sales Uji" };
vi.mock("@/lib/session", () => ({
  requireSession: async () => session,
  getSession: async () => session,
  requireRole: async () => session,
}));

const { db } = await import("@/lib/db");
const { createTicketAction } = await import("./tickets");

const CODE = `Q${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
const QUOTE_URL = "https://r2.test/temp/u/quote-HNSPC-20261104-0027-abc.pdf";
let storeId: string;
let assemblyJobId: string;
const users: Record<"sales" | "sales2" | "tech" | "lead" | "plain", string> = { sales: "", sales2: "", tech: "", lead: "", plain: "" };

function buildForm(overrides: Record<string, string | string[] | null> = {}) {
  const fd = new FormData();
  const base: Record<string, string | string[]> = {
    store_location_id: storeId,
    technician_id: users.tech,
    customer_type: "User",
    customer_name: "Cust Rakitan",
    phone: "+6281234567890",
    ticket_type: "pc_build",
    device_type: "PC_Office",
    pickup_method: "self_pickup",
    pc_components_json: JSON.stringify([{ catalogItemId: null, name: "Kabel HDMI milik customer", quantity: 1 }]),
    quote_url: QUOTE_URL,
    // Seven lines, the last of them the assembly: six to tick.
    quote_checked_count: "6",
    build_photo_urls: ["https://r2.test/temp/u/a.jpg", "https://r2.test/temp/u/b.jpg"],
  };
  for (const [k, v] of Object.entries({ ...base, ...overrides })) {
    if (v === null) continue;
    for (const one of Array.isArray(v) ? v : [v]) fd.append(k, one);
  }
  return fd;
}

beforeAll(async () => {
  const store = await db.storeLocation.create({ data: { name: `${CODE} Store`, code: CODE, address: "Test" }, select: { id: true } });
  storeId = store.id;
  const mk = (key: keyof typeof users, role: "Sales" | "Technician", lead = false) =>
    db.user.create({
      data: {
        name: `${CODE} ${key}`,
        email: `${CODE}.${key}@test.local`.toLowerCase(),
        phone_number: "+628100000099",
        address: "Test",
        role,
        password: "x",
        is_team_leader: lead,
        ...(role === "Technician" ? { store_assignments: { create: { store_id: storeId } } } : {}),
      },
      select: { id: true },
    });
  const [s, s2, t, l, p] = await Promise.all([
    mk("sales", "Sales"),
    mk("sales2", "Sales"),
    mk("tech", "Technician"),
    mk("lead", "Technician", true),
    mk("plain", "Technician"),
  ]);
  users.sales = s.id;
  users.sales2 = s2.id;
  users.tech = t.id;
  users.lead = l.id;
  users.plain = p.id;
  session.userId = s.id;
  // Seeded by the migration that made the assembly a technician's job.
  assemblyJobId = (await db.serviceJob.findFirstOrThrow({ where: { name: "Jasa Rakit PC" }, select: { id: true } })).id;
});

afterAll(async () => {
  const ids = (await db.ticket.findMany({ where: { store_location_id: storeId }, select: { id: true } })).map((t) => t.id);
  if (ids.length) {
    await db.notification.deleteMany({ where: { ticket_id: { in: ids } } });
    await db.ticketStatusLog.deleteMany({ where: { ticket_id: { in: ids } } });
    await db.ticket.deleteMany({ where: { id: { in: ids } } }); // cascades detail, components, attachments
  }
  await db.technicianStoreAssignment.deleteMany({ where: { store_id: storeId } });
  await db.user.deleteMany({ where: { id: { in: Object.values(users) } } });
  await db.storeLocation.deleteMany({ where: { id: storeId } });
  await db.$disconnect();
});

const lastTicket = () =>
  db.ticket.findFirst({
    where: { store_location_id: storeId },
    orderBy: { created_at: "desc" },
    select: {
      id: true,
      ticket_code: true,
      status: true,
      sales_id: true,
      pc_build_detail: true,
      pc_components: { orderBy: { id: "asc" } },
      charges: { select: { kind: true, description: true, quantity: true, unit_price: true, service_job_id: true } },
      attachments: { select: { kind: true, file_type: true, file_url: true } },
      notifications: { select: { user_id: true, type: true } },
    },
  });

describe("createTicketAction — PC build from a quotation", () => {
  it("records the quotation's lines, who checked them, the PDF and the photos", async () => {
    const result = await createTicketAction(buildForm());
    expect(result).toMatchObject({ success: true });

    const t = await lastTicket();
    expect(t?.status).toBe("waiting");
    expect(t?.pc_build_detail).toMatchObject({
      quote_code: "HNSPC-20261104-0027",
      quote_url: QUOTE_URL,
      quote_source: "pdf",
      quote_revision: null,
      quote_customer: "Cust Rakitan",
      quote_total: 8635000,
      verified_by_id: users.sales,
      verified_by_name: "Sales Uji",
      first_build_url: null,
    });
    expect(t?.pc_build_detail?.verified_at).toBeInstanceOf(Date);

    // The quotation's goods in its order, then the one added by hand. The
    // assembly is not a thing in the box: it is the technician's job on the bill.
    expect(t?.pc_components.map((c) => [c.quote_label, c.sku, c.quantity])).toEqual([
      ["PROCESSOR", "2606000158", 1],
      ["MOTHERBOARD", "2504000288", 1],
      ["RAM", "2507000075", 1],
      ["CASING", "2509000273", 1],
      ["SSD / NVME", "2605000042", 1],
      ["MONITOR", "2602000029", 1],
      [null, null, 1],
    ]);
    // A PDF prints no line prices: the Daftar Jasa's default.
    expect(t?.charges).toEqual([
      { kind: "service_fee", description: "Jasa Rakit PC", quantity: 1, unit_price: 150000, service_job_id: assemblyJobId },
    ]);
    // Matched to the catalogue by exact SKU only.
    expect(t?.pc_components[0]).toMatchObject({ catalog_item_id: 9001, catalog_category: "PROCESSOR INTEL" });
    expect(t?.pc_components[1]).toMatchObject({ catalog_item_id: null });
    expect(t?.pc_components[6]).toMatchObject({ component_name: "Kabel HDMI milik customer" });

    expect(t?.attachments.map((a) => a.kind).sort()).toEqual(["build_photo", "build_photo", "quotation"]);
    expect(t?.attachments.find((a) => a.kind === "quotation")).toMatchObject({ file_type: "pdf", file_url: QUOTE_URL });

    // Assigned at intake: the technician hears about it, nobody else.
    expect(t?.notifications).toEqual([{ user_id: users.tech, type: "assigned" }]);
  });

  it("refuses a second live ticket from the same quotation", async () => {
    const result = await createTicketAction(buildForm());
    expect(result).toEqual({ error: expect.stringMatching(/HNSPC-20261104-0027 sudah dibuat tiketnya: /) });
  });

  it("allows it again once the first ticket is cancelled", async () => {
    const first = await lastTicket();
    await db.ticket.update({ where: { id: first!.id }, data: { status: "cancelled" } });
    const result = await createTicketAction(buildForm());
    expect(result).toMatchObject({ success: true });
    const t = await lastTicket();
    await db.ticket.update({ where: { id: t!.id }, data: { status: "cancelled" } });
  });

  it("refuses when not every line was ticked", async () => {
    const result = await createTicketAction(buildForm({ quote_checked_count: "5" }));
    expect(result).toEqual({ error: expect.stringContaining("Semua komponen di quotation harus dicentang") });
  });

  it("refuses without photos of the components, or with a non-image", async () => {
    expect(await createTicketAction(buildForm({ build_photo_urls: null }))).toEqual({
      error: "Lampirkan foto komponen rakitan yang dibawa sebelum tiket dibuat.",
    });
    expect(await createTicketAction(buildForm({ build_photo_urls: ["https://r2.test/x.pdf"] }))).toEqual({
      error: "Foto komponen rakitan harus berupa gambar.",
    });
  });

  it("refuses a quotation on another ticket type, or one no longer stored", async () => {
    expect(await createTicketAction(buildForm({ ticket_type: "service", notes: "x" }))).toEqual({
      error: "Quotation rakitan hanya untuk tiket Build PC.",
    });
    stored.missing = true;
    expect(await createTicketAction(buildForm())).toEqual({ error: expect.stringContaining("tidak ditemukan lagi") });
    stored.missing = false;
  });

  it("refuses a PC build without a quotation, and creates nothing", async () => {
    const before = await db.ticket.count({ where: { store_location_id: storeId } });
    const result = await createTicketAction(
      buildForm({ quote_url: null, quote_checked_count: null, build_photo_urls: null, technician_id: users.tech }),
    );
    expect(result).toEqual({ error: expect.stringContaining("wajib dibuat dari quotation") });
    expect(await db.ticket.count({ where: { store_location_id: storeId } })).toBe(before);
  });
});

describe("createTicketAction — PC build from the e-commerce API", () => {
  const body = () => JSON.parse(JSON.stringify(apiFixture)) as typeof apiFixture & Record<string, unknown>;
  let answer: Record<string, unknown> = body();
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(answer), { status: 200 }));
  const apiForm = (overrides: Record<string, string | string[] | null> = {}) =>
    buildForm({ quote_url: null, quote_ref: "HNSPC-20261104-0027", quote_revision: "3", quote_checked_count: "3", ...overrides });
  const cancelLast = async () => {
    const t = await lastTicket();
    await db.ticket.update({ where: { id: t!.id }, data: { status: "cancelled" } });
  };

  beforeAll(async () => {
    vi.stubGlobal("fetch", fetchMock);
    process.env.HNS_ECOMMERCE_URL = "https://shop.test";
    process.env.TICKETING_INTEGRATION_TOKEN = "tok";
    // Earlier tests left PDF tickets on this quotation code live.
    await db.ticket.updateMany({ where: { store_location_id: storeId }, data: { status: "cancelled" } });
  });
  afterAll(() => {
    vi.unstubAllGlobals();
    delete process.env.HNS_ECOMMERCE_URL;
    delete process.env.TICKETING_INTEGRATION_TOKEN;
  });

  it("records the quotation it asked for again, its revision and link, and bills the assembly at its sold price", async () => {
    answer = body();
    const result = await createTicketAction(apiForm());
    expect(result).toMatchObject({ success: true });

    const t = await lastTicket();
    expect(t?.pc_build_detail).toMatchObject({
      quote_code: "HNSPC-20261104-0027",
      quote_source: "api",
      quote_url: null,
      quote_revision: 3,
      quote_public_url: "https://hnsitcenter.id/q/Ab3dEf6hIj9kLm",
      quote_customer: "Cust Rakitan",
      quote_sales_name: "Sales Web",
      quote_total: 3975000,
    });
    expect(t?.pc_build_detail?.quote_priced_at?.toISOString()).toBe("2026-11-04T02:30:00.000Z");
    expect((t?.pc_build_detail?.quote_snapshot as { code?: string } | null)?.code).toBe("HNSPC-20261104-0027");
    // The Accurate code now, not the SKU printed; the variant in the name; the monitor ticked too.
    expect(t?.pc_components.map((c) => [c.quote_label, c.component_name, c.sku])).toEqual([
      ["Processor", "PROCESSOR INTEL CORE I3-12100 TRAY 3.3Ghz", "2606000158"],
      ["SSD / NVMe", "SSD NVME ENPC — 512GB · Hitam", "2605000099"],
      ["Monitor", "MONITOR XIAOMI A24i", "2602000029"],
      [null, "Kabel HDMI milik customer", null],
    ]);
    expect(t?.charges).toEqual([
      { kind: "service_fee", description: "Jasa Rakit PC", quantity: 1, unit_price: 175000, service_job_id: assemblyJobId },
    ]);
    // No PDF: only the photos are attachments.
    expect(t?.attachments.map((a) => a.kind)).toEqual(["build_photo", "build_photo"]);
    await cancelLast();
  });

  it("records neither the goods taken out of the build nor their ticks", async () => {
    answer = body();
    // The monitor (line 2) is sold on the quotation but not assembled.
    expect(await createTicketAction(apiForm({ quote_excluded: "2", quote_checked_count: "2" }))).toMatchObject({ success: true });
    const t = await lastTicket();
    expect(t?.pc_components.map((c) => c.quote_label)).toEqual(["Processor", "SSD / NVMe", null]);
    await cancelLast();
  });

  it("still asks for every line left in the build to be ticked", async () => {
    answer = body();
    expect(await createTicketAction(apiForm({ quote_excluded: "2", quote_checked_count: "3" }))).toEqual({
      error: expect.stringContaining("Semua komponen di quotation harus dicentang"),
    });
    expect(await createTicketAction(apiForm({ quote_excluded: "0,1,2", quote_checked_count: "0" }))).toEqual({
      error: expect.stringContaining("Minimal satu barang"),
    });
    expect(await createTicketAction(apiForm({ quote_excluded: "3", quote_checked_count: "3" }))).toEqual({
      error: expect.stringContaining("bukan rakitan tidak cocok"),
    });
  });

  it("refuses when the quotation was revised after it was loaded", async () => {
    answer = { ...body(), revision: 4 };
    expect(await createTicketAction(apiForm())).toEqual({ error: expect.stringContaining("direvisi sejak dimuat (revisi 3 → 4)") });
  });

  it("opens a ticket from a quotation the cashier has not closed yet", async () => {
    // Closing is marked when the finished build is scanned at the till.
    answer = { ...body(), status: "terbit" };
    expect(await createTicketAction(apiForm())).toMatchObject({ success: true });
    await cancelLast();
  });

  it("counts only the goods as lines to tick", async () => {
    answer = body();
    expect(await createTicketAction(apiForm({ quote_checked_count: "4" }))).toEqual({
      error: expect.stringContaining("Semua komponen di quotation harus dicentang"),
    });
  });

  it("refuses a second live ticket from the same quotation, whichever way it was read", async () => {
    answer = body();
    expect(await createTicketAction(apiForm())).toMatchObject({ success: true });
    expect(await createTicketAction(apiForm())).toEqual({ error: expect.stringContaining("sudah dibuat tiketnya") });
    expect(await createTicketAction(buildForm())).toEqual({ error: expect.stringContaining("sudah dibuat tiketnya") });
    await cancelLast();
  });

  it("finds the sales by their SSO subject before their name", async () => {
    await db.user.update({ where: { id: users.sales2 }, data: { sso_sub: `sub-${CODE}` } });
    answer = { ...body(), salesName: `${CODE} sales`, sales: { email: null, ssoSub: `sub-${CODE}` } };
    expect(await createTicketAction(apiForm())).toMatchObject({ success: true });
    expect((await lastTicket())?.sales_id).toBe(users.sales2);
    await cancelLast();
  });

  it("passes the e-commerce side's refusal on as a sentence", async () => {
    fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ error: "not_found" }), { status: 404 }));
    expect(await createTicketAction(apiForm())).toEqual({ error: expect.stringContaining("tidak ditemukan di ecommerce") });
  });
});

describe("createTicketAction — the quotation's sales", () => {
  const cancelLast = async () => {
    const t = await lastTicket();
    await db.ticket.update({ where: { id: t!.id }, data: { status: "cancelled" } });
  };

  it("assigns the sales printed on the quotation when none was picked", async () => {
    stored.salesName = `${CODE} SALES`; // the account is "<CODE> sales": case does not matter
    const result = await createTicketAction(buildForm());
    expect(result).toMatchObject({ success: true });
    const t = await lastTicket();
    expect(t?.sales_id).toBe(users.sales);
    expect(t?.pc_build_detail?.quote_sales_name).toBe(`${CODE} SALES`);
    await cancelLast();
  });

  it("keeps a sales picked by hand", async () => {
    const result = await createTicketAction(buildForm({ sales_id: users.sales2 }));
    expect(result).toMatchObject({ success: true });
    expect((await lastTicket())?.sales_id).toBe(users.sales2);
    await cancelLast();
  });

  it("leaves it empty when the printed name matches no Sales account", async () => {
    stored.salesName = "Orang Lain Sekali";
    const result = await createTicketAction(buildForm());
    expect(result).toMatchObject({ success: true });
    const t = await lastTicket();
    expect(t?.sales_id).toBeNull();
    expect(t?.pc_build_detail?.quote_sales_name).toBe("Orang Lain Sekali");
    await cancelLast();
    stored.salesName = null;
  });
});

describe("createTicketAction — nobody assigned", () => {
  it("tells the store's coordinators, not other technicians nor the creator", async () => {
    const result = await createTicketAction(buildForm({ technician_id: null }));
    expect(result).toMatchObject({ success: true });
    const t = await lastTicket();
    expect(t?.notifications).toEqual([{ user_id: users.lead, type: "needs_assignment" }]);
  });

  it("does not notify a technician who assigned the ticket to themselves", async () => {
    session.userId = users.tech;
    session.role = "Technician";
    const first = await lastTicket();
    await db.ticket.update({ where: { id: first!.id }, data: { status: "cancelled" } });
    const result = await createTicketAction(buildForm({ technician_id: users.tech }));
    expect(result).toMatchObject({ success: true });
    expect((await lastTicket())?.notifications).toEqual([]);
    session.userId = users.sales;
    session.role = "Sales";
  });
});
