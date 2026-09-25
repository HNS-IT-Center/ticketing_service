/**
 * Integration tests for the warranty-claim guards in updateTicketStatusAction.
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

vi.mock("@/lib/r2", () => ({
  uploadToR2: vi.fn(async () => "https://r2.test/proof.jpg"),
  getExt: () => "jpg",
  getFileType: () => "image" as const,
}));

// The action fires this without awaiting; keep it off the network.
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
const { updateTicketStatusAction } = await import("./technician");

const RUN = `techtest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
let technicianId: string;

type TicketType = "warranty_claim" | "service" | "cleaning";
type Status = "waiting" | "on_progress" | "done" | "rma_process";

async function makeTicket(opts: { type?: TicketType; status?: Status } = {}) {
  const ticket = await db.ticket.create({
    data: {
      ticket_code: `${RUN}_${Math.random().toString(36).slice(2, 10)}`,
      ticket_type: opts.type ?? "warranty_claim",
      device_type: "Laptop_Gaming",
      status: opts.status ?? "on_progress",
      technician_id: technicianId,
      pickup_method: "self_pickup",
    },
    select: { id: true, ticket_code: true },
  });
  if ((opts.type ?? "warranty_claim") === "warranty_claim") {
    await db.ticketWarrantyDetail.create({
      data: { ticket_id: ticket.id, purchase_date: new Date("2026-01-01") },
    });
  }
  return ticket;
}

function statusForm(ticketId: string, newStatus: string, extra: Record<string, string> = {}) {
  const fd = new FormData();
  fd.append("ticketId", ticketId);
  fd.append("newStatus", newStatus);
  for (const [k, v] of Object.entries(extra)) fd.append(k, v);
  return fd;
}

beforeAll(async () => {
  const user = await db.user.create({
    data: {
      name: `${RUN} tech`,
      email: `${RUN}.tech@test.local`,
      phone_number: "+628100000000",
      address: "Test",
      role: "Technician",
      password: "x",
    },
    select: { id: true },
  });
  technicianId = user.id;
});

beforeEach(() => {
  session.userId = technicianId;
  session.role = "Technician";
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
  await db.technicianPerformance.deleteMany({ where: { technician_id: technicianId } });
  await db.user.deleteMany({ where: { id: technicianId } });
  await db.$disconnect();
});

// ─────────────────────────────────────────────────────────────────────────────

describe("guard 1 — a ticket with the RMA desk is read-only for the technician", () => {
  it.each(["done", "cancelled", "rejected", "ready_for_pickup", "on_progress"])(
    "refuses moving an rma_process ticket to %s",
    async (target) => {
      const ticket = await makeTicket({ status: "rma_process" });
      const result = await updateTicketStatusAction(
        statusForm(ticket.id, target, { reason: "apa pun" })
      );
      expect(result).toMatchObject({ error: expect.stringContaining("sedang diproses RMA") });

      const after = await db.ticket.findUnique({
        where: { id: ticket.id },
        select: { status: true },
      });
      expect(after?.status).toBe("rma_process");
    }
  );

  it("writes no status log for a refused attempt", async () => {
    const ticket = await makeTicket({ status: "rma_process" });
    await updateTicketStatusAction(statusForm(ticket.id, "done", { reason: "x" }));
    expect(await db.ticketStatusLog.count({ where: { ticket_id: ticket.id } })).toBe(0);
  });

  it("lets the technician continue once RMA returned the ticket to done", async () => {
    const ticket = await makeTicket({ status: "done" });
    const result = await updateTicketStatusAction(statusForm(ticket.id, "ready_for_pickup"));
    expect(result).toMatchObject({ success: true });

    const after = await db.ticket.findUnique({
      where: { id: ticket.id },
      select: { status: true },
    });
    expect(after?.status).toBe("ready_for_pickup");
  });
});

describe("guard 2 — rejecting needs a reason", () => {
  it("refuses `rejected` with no reason", async () => {
    const ticket = await makeTicket();
    const result = await updateTicketStatusAction(statusForm(ticket.id, "rejected"));
    expect(result).toMatchObject({ error: expect.stringContaining("Alasan wajib") });
  });

  it("refuses `rejected` with a whitespace-only reason", async () => {
    const ticket = await makeTicket();
    const result = await updateTicketStatusAction(statusForm(ticket.id, "rejected", { reason: "   " }));
    expect(result).toMatchObject({ error: expect.stringContaining("Alasan wajib") });

    const after = await db.ticket.findUnique({ where: { id: ticket.id }, select: { status: true } });
    expect(after?.status).toBe("on_progress");
  });

  it("accepts `rejected` with a reason and records it on the status log", async () => {
    const ticket = await makeTicket({ type: "service" });
    const result = await updateTicketStatusAction(
      statusForm(ticket.id, "rejected", { reason: "Unit tidak sesuai deskripsi" })
    );
    expect(result).toMatchObject({ success: true });

    const log = await db.ticketStatusLog.findFirst({
      where: { ticket_id: ticket.id, new_status: "rejected" },
      select: { reason: true },
    });
    expect(log?.reason).toBe("Unit tidak sesuai deskripsi");
  });
});

describe("guard 3 — a warranty claim leaves on_progress ONE way", () => {
  // The technician used to be able to close a claim here as "not eligible".
  // That decision moved to the RMA desk, which is the side that knows what a
  // vendor's warranty covers. The technician examines and documents; the desk
  // judges. So `done` is refused outright rather than asked for a reason.

  it("refuses `done`", async () => {
    const ticket = await makeTicket();
    const result = await updateTicketStatusAction(statusForm(ticket.id, "done"));
    expect(result).toMatchObject({ error: expect.stringContaining("Serahkan unit ke RMA") });

    const after = await db.ticket.findUnique({ where: { id: ticket.id }, select: { status: true } });
    expect(after?.status).toBe("on_progress");
  });

  it("refuses `done` even when a reason is supplied", async () => {
    // A reason used to be the way through. It no longer is, and a caller still
    // sending one must not slip past.
    const result = await updateTicketStatusAction(
      statusForm((await makeTicket()).id, "done", { reason: "Di luar garansi" })
    );
    expect(result).toMatchObject({ error: expect.stringContaining("Serahkan unit ke RMA") });
  });

  it("writes nothing when it refuses", async () => {
    const ticket = await makeTicket();
    await updateTicketStatusAction(statusForm(ticket.id, "done", { reason: "Di luar garansi" }));

    expect(await db.ticketStatusLog.count({ where: { ticket_id: ticket.id } })).toBe(0);
    const detail = await db.ticketWarrantyDetail.findUnique({
      where: { ticket_id: ticket.id },
      select: { claim_eligible: true, ineligibility_reason: true },
    });
    // The fixture row exists; what matters is that nothing marked it ineligible.
    expect(detail?.claim_eligible).toBe(true);
    expect(detail?.ineligibility_reason).toBeNull();
  });

  it("cannot be talked into it by a client-supplied flag", async () => {
    const ticket = await makeTicket();
    const result = await updateTicketStatusAction(
      statusForm(ticket.id, "done", {
        reason: "Segel rusak",
        claim_eligible: "false",
        ineligibility_reason: "dipalsukan klien",
      })
    );
    expect(result).toMatchObject({ error: expect.any(String) });

    expect(
      (await db.ticketWarrantyDetail.findUnique({
        where: { ticket_id: ticket.id },
        select: { ineligibility_reason: true },
      }))?.ineligibility_reason,
    ).toBeNull();
  });

  it("still lets a claim returned by the desk finish its handover chain", async () => {
    // rma.ts puts the ticket back at `done` itself; from there the technician
    // carries on exactly as with any other ticket.
    const ticket = await makeTicket({ status: "done" });

    expect(await updateTicketStatusAction(statusForm(ticket.id, "ready_for_pickup"))).toMatchObject({
      success: true,
    });

    const completing = statusForm(ticket.id, "completed");
    completing.append("files", new File(["img"], "serah-terima.jpg", { type: "image/jpeg" }));
    expect(await updateTicketStatusAction(completing)).toMatchObject({ success: true });
  });

  it("leaves cancelling a claim alone", async () => {
    // Refusing `done` must not also block an ordinary cancellation.
    const ticket = await makeTicket();
    expect(
      await updateTicketStatusAction(
        statusForm(ticket.id, "cancelled", { reason: "Customer menarik klaim" })
      ),
    ).toMatchObject({ success: true });
  });
});


describe("KPI — a claim credits nothing from this action", () => {
  async function perf() {
    const row = await db.technicianPerformance.findUnique({
      where: { technician_id: technicianId },
      select: { tickets_handled: true, success_count: true, failed_count: true, total_points_completed: true },
    });
    return (
      row ?? { tickets_handled: 0, success_count: 0, failed_count: 0, total_points_completed: 0 }
    );
  }

  it("credits nothing for a refused `done`", async () => {
    const before = await perf();
    await updateTicketStatusAction(
      statusForm((await makeTicket()).id, "done", { reason: "Di luar garansi" })
    );
    expect(await perf()).toEqual(before);
  });

  it("credits nothing as a returned claim goes back to the customer", async () => {
    const ticket = await makeTicket({ status: "done" });
    const before = await perf();

    await updateTicketStatusAction(statusForm(ticket.id, "ready_for_pickup"));
    const completing = statusForm(ticket.id, "completed");
    completing.append("files", new File(["img"], "serah-terima.jpg", { type: "image/jpeg" }));
    await updateTicketStatusAction(completing);

    expect(await perf()).toEqual(before);
  });

  it("still counts a cancelled claim as a failure", async () => {
    const before = await perf();
    await updateTicketStatusAction(
      statusForm((await makeTicket()).id, "cancelled", { reason: "Customer menarik klaim" })
    );

    const after = await perf();
    expect(after.failed_count).toBe(before.failed_count + 1);
    expect(after.success_count).toBe(before.success_count);
  });

  it("credits an ordinary ticket at done, as before", async () => {
    const before = await perf();
    await updateTicketStatusAction(statusForm((await makeTicket({ type: "service" })).id, "done"));

    const after = await perf();
    // service on a Laptop_Gaming is worth 5 -- see lib/points.ts.
    expect(after.success_count).toBe(before.success_count + 1);
    expect(after.total_points_completed).toBe(before.total_points_completed + 5);
  });
});


describe("guard 3 — no effect on other ticket types", () => {
  it.each(["service", "cleaning"] as const)(
    "lets a %s ticket go on_progress → done with no reason",
    async (type) => {
      const ticket = await makeTicket({ type });
      const result = await updateTicketStatusAction(statusForm(ticket.id, "done"));
      expect(result).toMatchObject({ success: true });

      const after = await db.ticket.findUnique({
        where: { id: ticket.id },
        select: { status: true },
      });
      expect(after?.status).toBe("done");
    }
  );

  it("writes no warranty detail for a non-claim ticket closed as done", async () => {
    const ticket = await makeTicket({ type: "service" });
    await updateTicketStatusAction(statusForm(ticket.id, "done"));
    const detail = await db.ticketWarrantyDetail.findUnique({ where: { ticket_id: ticket.id } });
    expect(detail).toBeNull();
  });

  it("does not touch claim_eligible when a claim reaches done from RMA rather than on_progress", async () => {
    // RMA closing a case sets the ticket to done directly; guard 3 only fires
    // on the on_progress → done edge, so the claim stays eligible.
    const ticket = await makeTicket({ status: "done" });
    const detail = await db.ticketWarrantyDetail.findUnique({
      where: { ticket_id: ticket.id },
      select: { claim_eligible: true, ineligibility_reason: true },
    });
    expect(detail?.claim_eligible).toBe(true);
    expect(detail?.ineligibility_reason).toBeNull();
  });
});
