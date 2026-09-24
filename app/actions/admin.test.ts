/**
 * Integration tests for adminUpdateTicketStatusAction.
 *
 * Runs against the local Postgres container; vitest.setup.ts refuses any
 * non-local DATABASE_URL. Fixtures are namespaced per run and removed in
 * afterAll.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

// The action fires this without awaiting; keep it off the network.
vi.mock("@/lib/email", () => ({
  sendTicketStatusEmail: vi.fn(async () => undefined),
  EMAIL_MILESTONES: [],
}));

const session = { userId: "", role: "Administrator", name: "Test Admin" };
vi.mock("@/lib/session", () => ({
  requireSession: async () => session,
  getSession: async () => session,
  requireRole: async (...roles: string[]) => {
    if (!roles.includes(session.role)) throw new Error("Unauthorized");
    return session;
  },
}));

const { db } = await import("@/lib/db");
const { adminUpdateTicketStatusAction } = await import("./admin");

const RUN = `admintest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
let adminId: string;
let technicianId: string;
let customerId: string;

type TicketType = "warranty_claim" | "service";
type Status = "waiting" | "on_progress" | "done" | "ready_for_pickup" | "rma_process";

async function makeTicket(
  opts: { type?: TicketType; status?: Status; withOwner?: boolean } = {},
) {
  return db.ticket.create({
    data: {
      ticket_code: `${RUN}_${Math.random().toString(36).slice(2, 10)}`,
      ticket_type: opts.type ?? "warranty_claim",
      device_type: "Laptop_Gaming",
      status: opts.status ?? "on_progress",
      technician_id: technicianId,
      user_id: opts.withOwner ? customerId : undefined,
      pickup_method: "self_pickup",
    },
    select: { id: true, ticket_code: true },
  });
}

/** The stored counters for the fixture technician, or zeros. */
async function perf() {
  const row = await db.technicianPerformance.findUnique({
    where: { technician_id: technicianId },
    select: {
      tickets_handled: true,
      success_count: true,
      failed_count: true,
      total_points_completed: true,
    },
  });
  return (
    row ?? { tickets_handled: 0, success_count: 0, failed_count: 0, total_points_completed: 0 }
  );
}

beforeAll(async () => {
  const [admin, tech, customer] = await Promise.all([
    db.user.create({
      data: {
        name: `${RUN} admin`,
        email: `${RUN}.admin@test.local`,
        phone_number: "+628100000001",
        address: "Test",
        role: "Administrator",
        password: "x",
      },
      select: { id: true },
    }),
    db.user.create({
      data: {
        name: `${RUN} tech`,
        email: `${RUN}.tech@test.local`,
        phone_number: "+628100000002",
        address: "Test",
        role: "Technician",
        password: "x",
      },
      select: { id: true },
    }),
    db.user.create({
      data: {
        name: `${RUN} customer`,
        email: `${RUN}.customer@test.local`,
        phone_number: "+628100000003",
        address: "Test",
        role: "Customer",
        password: "x",
      },
      select: { id: true },
    }),
  ]);
  adminId = admin.id;
  technicianId = tech.id;
  customerId = customer.id;

  // adminUpdateTicketStatusAction uses `update`, not `upsert`, so the row has
  // to exist before it can be incremented.
  await db.technicianPerformance.create({ data: { technician_id: technicianId } });
});

beforeEach(() => {
  session.userId = adminId;
  session.role = "Administrator";
});

afterAll(async () => {
  const tickets = await db.ticket.findMany({
    where: { ticket_code: { startsWith: RUN } },
    select: { id: true },
  });
  const ids = tickets.map((t) => t.id);
  if (ids.length > 0) {
    await db.notification.deleteMany({ where: { ticket_id: { in: ids } } });
    await db.ticketStatusLog.deleteMany({ where: { ticket_id: { in: ids } } });
    await db.ticketTimeLog.deleteMany({ where: { ticket_id: { in: ids } } });
    await db.ticketAttachment.deleteMany({ where: { ticket_id: { in: ids } } });
    await db.ticketWarrantyDetail.deleteMany({ where: { ticket_id: { in: ids } } });
    await db.ticket.deleteMany({ where: { id: { in: ids } } });
  }
  await db.technicianPerformance.deleteMany({
    where: { technician_id: { in: [technicianId, adminId] } },
  });
  await db.notification.deleteMany({ where: { user_id: { in: [customerId] } } });
  await db.user.deleteMany({ where: { id: { in: [technicianId, adminId, customerId] } } });
  await db.$disconnect();
});

// ─────────────────────────────────────────────────────────────────────────────

describe("a ticket with the RMA desk cannot be moved from the admin portal", () => {
  // updateTicketStatusAction already refuses this for technicians. Without the
  // same guard here, that one is bypassed by asking an administrator, and the
  // ticket drifts out of `rma_process` while its RmaCase is still open.
  const TARGETS = [
    "waiting",
    "on_progress",
    "done",
    "ready_for_pickup",
    "waiting_pickup",
    "handed_to_courier",
    "delivered",
    "completed",
    "cancelled",
    "rejected",
  ] as const;

  it("refuses every status an administrator could ask for", async () => {
    for (const target of TARGETS) {
      const ticket = await makeTicket({ status: "rma_process" });
      const result = await adminUpdateTicketStatusAction(ticket.id, target);
      expect(result, target).toMatchObject({
        error: expect.stringContaining("sedang diproses RMA"),
      });

      const after = await db.ticket.findUnique({
        where: { id: ticket.id },
        select: { status: true },
      });
      expect(after?.status, target).toBe("rma_process");
    }
  });

  it("writes no status log for a refused attempt", async () => {
    const ticket = await makeTicket({ status: "rma_process" });
    await adminUpdateTicketStatusAction(ticket.id, "done");

    expect(await db.ticketStatusLog.count({ where: { ticket_id: ticket.id } })).toBe(0);
  });

  it("credits no performance for a refused attempt", async () => {
    // A service ticket closed as `done` is worth 5 points, so without the guard
    // this would move the counters.
    const before = await perf();
    const ticket = await makeTicket({ type: "service", status: "rma_process" });
    await adminUpdateTicketStatusAction(ticket.id, "done");

    expect(await perf()).toEqual(before);
  });

  it("notifies nobody for a refused attempt", async () => {
    // The ticket needs an owner, or the action would skip the notification
    // regardless of the guard and the test would prove nothing.
    const ticket = await makeTicket({ status: "rma_process", withOwner: true });
    await adminUpdateTicketStatusAction(ticket.id, "cancelled");

    expect(await db.notification.count({ where: { ticket_id: ticket.id } })).toBe(0);
  });

  it("refuses Sales as well as Administrator", async () => {
    session.role = "Sales";
    const ticket = await makeTicket({ status: "rma_process" });
    const result = await adminUpdateTicketStatusAction(ticket.id, "done");

    expect(result).toMatchObject({ error: expect.stringContaining("sedang diproses RMA") });
  });

  it("applies to non-claim tickets that somehow sit at rma_process", async () => {
    // Not reachable through the UI, but the guard keys on status rather than
    // on ticket_type, and it should stay that way.
    const ticket = await makeTicket({ type: "service", status: "rma_process" });
    const result = await adminUpdateTicketStatusAction(ticket.id, "done");

    expect(result).toMatchObject({ error: expect.stringContaining("sedang diproses RMA") });
  });
});

describe("the guard is narrow — every other status still moves", () => {
  it("leaves an ordinary claim ticket movable", async () => {
    const ticket = await makeTicket({ status: "on_progress" });
    expect(await adminUpdateTicketStatusAction(ticket.id, "done")).toMatchObject({
      success: true,
    });

    const after = await db.ticket.findUnique({
      where: { id: ticket.id },
      select: { status: true },
    });
    expect(after?.status).toBe("done");
  });

  it("leaves the handover chain alone", async () => {
    const ticket = await makeTicket({ type: "service", status: "done" });
    expect(await adminUpdateTicketStatusAction(ticket.id, "ready_for_pickup")).toMatchObject({
      success: true,
    });
    expect(await adminUpdateTicketStatusAction(ticket.id, "completed")).toMatchObject({
      success: true,
    });
  });

  it("does not add a second credit when the admin closes a picked-up ticket", async () => {
    // `completed` used to be terminal here, crediting the technician again on
    // top of the credit at `done`. See lib/kpi.ts.
    const ticket = await makeTicket({ type: "service", status: "ready_for_pickup" });
    const before = await perf();
    expect(await adminUpdateTicketStatusAction(ticket.id, "completed")).toMatchObject({
      success: true,
    });

    expect(await perf()).toEqual(before);
  });

  it("still credits a non-claim ticket closed as done", async () => {
    const before = await perf();
    const ticket = await makeTicket({ type: "service", status: "on_progress" });
    expect(await adminUpdateTicketStatusAction(ticket.id, "done")).toMatchObject({
      success: true,
    });

    const after = await perf();
    // 4, not the 5 that lib/points.ts would give: this action still carries its
    // own point table, and unifying that is fix/points-table-unification. The
    // assertion is deliberately written against what is credited today, so it
    // will fail loudly when that branch lands.
    expect(after.success_count).toBe(before.success_count + 1);
    expect(after.total_points_completed).toBe(before.total_points_completed + 4);
  });

  it("credits nothing for a claim closed as done, here as in the technician action", async () => {
    const before = await perf();
    const ticket = await makeTicket({ type: "warranty_claim", status: "on_progress" });
    expect(await adminUpdateTicketStatusAction(ticket.id, "done")).toMatchObject({
      success: true,
    });

    expect(await perf()).toEqual(before);
  });
});
