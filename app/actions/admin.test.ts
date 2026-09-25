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

describe("a warranty claim cannot be closed from the admin portal at all", () => {
  // This guard used to ask an administrator for a reason and record the claim
  // as ineligible on their word. That decision moved to the RMA desk, so the
  // admin portal now refuses the move rather than offering a second, quieter
  // way to make it.

  async function detail(ticketId: string) {
    return db.ticketWarrantyDetail.findUnique({
      where: { ticket_id: ticketId },
      select: { claim_eligible: true, ineligibility_reason: true },
    });
  }

  it("refuses `done` from on_progress", async () => {
    const ticket = await makeTicket({ type: "warranty_claim", status: "on_progress" });
    const result = await adminUpdateTicketStatusAction(ticket.id, "done");

    expect(result).toMatchObject({ error: expect.stringContaining("Serahkan unit ke RMA") });

    const after = await db.ticket.findUnique({
      where: { id: ticket.id },
      select: { status: true },
    });
    expect(after?.status).toBe("on_progress");
    expect(await db.ticketStatusLog.count({ where: { ticket_id: ticket.id } })).toBe(0);
    expect(await detail(ticket.id)).toBeNull();
  });

  it("refuses `done` from waiting too", async () => {
    // The technician action does not need `waiting` in its guard because
    // HANDOVER_CHAIN rejects waiting -> done first. This action has no chain.
    const ticket = await makeTicket({ type: "warranty_claim", status: "waiting" });
    expect(await adminUpdateTicketStatusAction(ticket.id, "done")).toMatchObject({
      error: expect.stringContaining("Serahkan unit ke RMA"),
    });

    const after = await db.ticket.findUnique({
      where: { id: ticket.id },
      select: { status: true },
    });
    expect(after?.status).toBe("waiting");
  });

  it("refuses even when a reason is supplied", async () => {
    // A reason used to be the way through; a caller still sending one must not
    // slip past.
    const ticket = await makeTicket({ type: "warranty_claim", status: "on_progress" });
    expect(
      await adminUpdateTicketStatusAction(ticket.id, "done", "Kerusakan akibat cairan"),
    ).toMatchObject({ error: expect.stringContaining("Serahkan unit ke RMA") });

    expect(await detail(ticket.id)).toBeNull();
  });

  it("never marks a claim ineligible from this action", async () => {
    const ticket = await makeTicket({ type: "warranty_claim", status: "on_progress" });
    await adminUpdateTicketStatusAction(ticket.id, "done", "Segel rusak");

    expect(await detail(ticket.id)).toBeNull();
  });

  it("applies to Sales too", async () => {
    session.role = "Sales";
    const ticket = await makeTicket({ type: "warranty_claim", status: "on_progress" });
    expect(await adminUpdateTicketStatusAction(ticket.id, "done")).toMatchObject({
      error: expect.stringContaining("Serahkan unit ke RMA"),
    });
  });

  it("does not block a non-claim ticket", async () => {
    const ticket = await makeTicket({ type: "service", status: "on_progress" });
    expect(await adminUpdateTicketStatusAction(ticket.id, "done")).toMatchObject({
      success: true,
    });
    expect(await detail(ticket.id)).toBeNull();
  });

  it("does not block a claim already past on_progress", async () => {
    // A claim the desk returned sits at `done`; moving it along the handover
    // chain is not an eligibility decision.
    const ticket = await makeTicket({ type: "warranty_claim", status: "done" });
    expect(await adminUpdateTicketStatusAction(ticket.id, "ready_for_pickup")).toMatchObject({
      success: true,
    });
  });

  it("leaves Approve and Reject at waiting alone", async () => {
    const a = await makeTicket({ type: "warranty_claim", status: "waiting" });
    expect(await adminUpdateTicketStatusAction(a.id, "on_progress")).toMatchObject({
      success: true,
    });

    const b = await makeTicket({ type: "warranty_claim", status: "waiting" });
    expect(await adminUpdateTicketStatusAction(b.id, "rejected")).toMatchObject({
      success: true,
    });
  });
});

describe("the guard is narrow — every other status still moves", () => {
  it("leaves an ordinary ticket movable", async () => {
    // A claim is no longer closable here at all, so the narrowness of the guard
    // is shown with a service ticket instead.
    const ticket = await makeTicket({ type: "service", status: "on_progress" });
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

  it("credits nothing for a claim from this action", async () => {
    // Every paid moment for a claim is the handover, which this action cannot
    // perform. See lib/kpi.ts.
    const before = await perf();
    const ticket = await makeTicket({ type: "warranty_claim", status: "on_progress" });
    await adminUpdateTicketStatusAction(ticket.id, "done", "Di luar garansi");

    expect(await perf()).toEqual(before);
  });

  it("does not credit again as the ineligible claim goes back to the customer", async () => {
    const ticket = await makeTicket({ type: "warranty_claim", status: "on_progress" });
    await adminUpdateTicketStatusAction(ticket.id, "done", "Di luar garansi");

    // Snapshot after the one credit, so anything the chain adds shows up.
    const before = await perf();
    await adminUpdateTicketStatusAction(ticket.id, "ready_for_pickup");
    await adminUpdateTicketStatusAction(ticket.id, "completed");

    expect(await perf()).toEqual(before);
  });

  it("credits nothing when the reason is missing, so the refusal costs nothing", async () => {
    const before = await perf();
    const ticket = await makeTicket({ type: "warranty_claim", status: "on_progress" });
    await adminUpdateTicketStatusAction(ticket.id, "done");

    expect(await perf()).toEqual(before);
  });

  it("does not credit a claim that merely passes through done from the RMA desk", async () => {
    // rma.ts writes this `done` itself when a case closes; the handover was
    // already paid for. Simulated here by a claim already sitting at `done`
    // with claim_eligible left at its default of true.
    const ticket = await makeTicket({ type: "warranty_claim", status: "done" });
    await db.ticketWarrantyDetail.create({
      data: { ticket_id: ticket.id, purchase_date: new Date("2026-01-01") },
    });

    const before = await perf();
    expect(await adminUpdateTicketStatusAction(ticket.id, "ready_for_pickup")).toMatchObject({
      success: true,
    });
    expect(await adminUpdateTicketStatusAction(ticket.id, "completed")).toMatchObject({
      success: true,
    });

    expect(await perf()).toEqual(before);
  });
});
