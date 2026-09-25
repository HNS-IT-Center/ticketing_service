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
