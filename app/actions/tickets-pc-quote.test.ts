/**
 * Integration tests for a PC build opened from its e-commerce quotation, and
 * for who is notified when any ticket is created (assigned technician, or the
 * store's coordinators when nobody is).
 *
 * Runs createTicketAction against the local database. The stored PDF is
 * replaced by the parsed text of the real quotation (the parser has its own
 * tests in lib/pc-build-quote), and the catalogue API is replaced.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fixture from "@/lib/pc-build-quote/__fixtures__/quote-hnspc-0027.json";

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
    quote_checked_count: "7",
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
      quote_customer: "Cust Rakitan",
      quote_total: 8635000,
      verified_by_id: users.sales,
      verified_by_name: "Sales Uji",
      first_build_url: null,
    });
    expect(t?.pc_build_detail?.verified_at).toBeInstanceOf(Date);

    // Seven from the quotation in its order, then the one added by hand.
    expect(t?.pc_components.map((c) => [c.quote_label, c.sku, c.quantity])).toEqual([
      ["PROCESSOR", "2606000158", 1],
      ["MOTHERBOARD", "2504000288", 1],
      ["RAM", "2507000075", 1],
      ["CASING", "2509000273", 1],
      ["SSD / NVME", "2605000042", 1],
      ["MONITOR", "2602000029", 1],
      ["JASA RAKIT", null, 1],
      [null, null, 1],
    ]);
    // Matched to the catalogue by exact SKU only.
    expect(t?.pc_components[0]).toMatchObject({ catalog_item_id: 9001, catalog_category: "PROCESSOR INTEL" });
    expect(t?.pc_components[1]).toMatchObject({ catalog_item_id: null });
    expect(t?.pc_components[7]).toMatchObject({ component_name: "Kabel HDMI milik customer" });

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
    const result = await createTicketAction(buildForm({ quote_checked_count: "6" }));
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

  it("still opens a PC build without a quotation, as before", async () => {
    const result = await createTicketAction(
      buildForm({ quote_url: null, quote_checked_count: null, build_photo_urls: null, technician_id: users.tech }),
    );
    expect(result).toMatchObject({ success: true });
    const t = await lastTicket();
    expect(t?.pc_build_detail?.quote_code).toBeNull();
    expect(t?.pc_components.map((c) => c.component_name)).toEqual(["Kabel HDMI milik customer"]);
    await db.ticket.update({ where: { id: t!.id }, data: { status: "cancelled" } });
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
