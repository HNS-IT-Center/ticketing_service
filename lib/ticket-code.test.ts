/**
 * Integration tests for ticket-code allocation.
 *
 * Runs against the local Postgres container; vitest.setup.ts refuses any
 * non-local DATABASE_URL. Fixtures use a store code unique to the run so they
 * cannot collide with seeded or real tickets.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { db } = await import("@/lib/db");
const { nextStoreTicketCode, isTicketCodeCollision } = await import("./ticket-code");

// Store codes are alphanumeric in production (e.g. "NGW") and feed straight
// into the ticket code, so the fixture keeps that shape.
const CODE = `Z${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
let storeId: string;

/** A ticket with an explicit number and an explicit creation time. */
async function makeTicket(seq: number, createdAt: Date) {
  return db.ticket.create({
    data: {
      ticket_code: `${CODE}-${String(seq).padStart(6, "0")}`,
      ticket_type: "service",
      device_type: "Laptop_Gaming",
      status: "waiting",
      store_location_id: storeId,
      created_at: createdAt,
    },
    select: { id: true, ticket_code: true },
  });
}

beforeAll(async () => {
  const store = await db.storeLocation.create({
    data: { name: `${CODE} Store`, code: CODE, address: "Test" },
    select: { id: true },
  });
  storeId = store.id;
});

afterAll(async () => {
  await db.ticket.deleteMany({ where: { store_location_id: storeId } });
  await db.storeLocation.deleteMany({ where: { id: storeId } });
  await db.$disconnect();
});

describe("nextStoreTicketCode", () => {
  it("starts at 1 for a store with no tickets", async () => {
    expect(await nextStoreTicketCode(CODE)).toBe(`${CODE}-000001`);
  });

  it("continues from the highest number", async () => {
    const base = new Date("2026-09-01T00:00:00Z");
    await makeTicket(1, new Date(base.getTime() + 1000));
    await makeTicket(2, new Date(base.getTime() + 2000));

    expect(await nextStoreTicketCode(CODE)).toBe(`${CODE}-000003`);
  });

  it("uses the highest number, not the newest row", async () => {
    // The exact shape of the reported failure: a store holding 1..9 whose most
    // recently created row is number 3, because the higher-numbered rows were
    // written with backdated timestamps. Ordering by created_at produced
    // NGW-000004 forever, which already existed -> P2002.
    const old = new Date("2026-08-01T00:00:00Z");
    const recent = new Date("2026-09-20T00:00:00Z");
    for (const seq of [4, 5, 6, 7, 8, 9]) {
      await makeTicket(seq, old);
    }
    await makeTicket(3, recent); // newest row, low number

    const newest = await db.ticket.findFirst({
      where: { store_location_id: storeId },
      orderBy: { created_at: "desc" },
      select: { ticket_code: true },
    });
    expect(newest?.ticket_code).toBe(`${CODE}-000003`); // the trap

    expect(await nextStoreTicketCode(CODE)).toBe(`${CODE}-000010`);
  });

  it("does not reuse a number after a deletion in the middle", async () => {
    // The old fallback branch used `count + 1`, which collides here.
    await db.ticket.deleteMany({
      where: { ticket_code: { in: [`${CODE}-000005`, `${CODE}-000006`] } },
    });

    expect(await nextStoreTicketCode(CODE)).toBe(`${CODE}-000010`);
  });

  it("never returns a code that already exists", async () => {
    const code = await nextStoreTicketCode(CODE);
    expect(await db.ticket.findUnique({ where: { ticket_code: code } })).toBeNull();
  });

  it("does not let one store's codes bleed into another's", async () => {
    // `NG-` must not match `NGW-000009`. The hyphen in the prefix is what keeps
    // a store whose code is a prefix of another store's code separate.
    const shortCode = CODE.slice(0, 3);
    const sibling = await db.storeLocation.create({
      data: { name: `${shortCode} Sibling`, code: shortCode, address: "Test" },
      select: { id: true },
    });

    try {
      // The long-code store already has up to 9; the short-code store has none.
      expect(await nextStoreTicketCode(shortCode)).toBe(`${shortCode}-000001`);
    } finally {
      await db.ticket.deleteMany({ where: { store_location_id: sibling.id } });
      await db.storeLocation.delete({ where: { id: sibling.id } });
    }
  });
});

describe("isTicketCodeCollision", () => {
  it("recognises a Prisma unique violation on ticket_code", () => {
    expect(
      isTicketCodeCollision({
        code: "P2002",
        meta: { target: ["ticket_code"] },
        message: "Unique constraint failed on the constraint: `Ticket_ticket_code_key`",
      }),
    ).toBe(true);
  });

  it("ignores a unique violation on some other column", () => {
    expect(
      isTicketCodeCollision({
        code: "P2002",
        meta: { target: ["public_share_token"] },
        message: "Unique constraint failed on the constraint: `Ticket_public_share_token_key`",
      }),
    ).toBe(false);
  });

  it("ignores errors that are not unique violations", () => {
    expect(isTicketCodeCollision({ code: "P2025", message: "Record not found" })).toBe(false);
    expect(isTicketCodeCollision(new Error("network down"))).toBe(false);
    expect(isTicketCodeCollision(null)).toBe(false);
    expect(isTicketCodeCollision(undefined)).toBe(false);
  });
});
