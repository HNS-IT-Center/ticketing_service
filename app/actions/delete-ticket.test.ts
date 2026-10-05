/**
 * Integration tests for deleteTicketAction.
 *
 * Runs against the local MariaDB container; vitest.setup.ts refuses any
 * non-local DATABASE_URL. Every fixture is namespaced per run and removed in
 * afterAll, so no seeded or production-copied row is touched.
 *
 * The point of these is not that the row disappears — `delete` does that. It is
 * that the three things the owner was warned about on 2026-10-03 are actually
 * handled: the audit row outlives the cascade, the stored point counters are
 * put back, and the attachment files are asked to go too.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

vi.mock("@/lib/email", () => ({
  sendTicketStatusEmail: vi.fn(async () => undefined),
  EMAIL_MILESTONES: [],
}));

// Storage is a network dependency. The spy records what the action asked to
// delete, which is the behaviour under test; the real client is never built.
const deleted: string[] = [];
let storageWorks = true;
vi.mock("@/lib/r2", () => ({
  deleteFromStorage: vi.fn(async (url: string) => {
    deleted.push(url);
    return storageWorks;
  }),
  uploadToR2: vi.fn(async () => "https://r2.test/x.jpg"),
  getFileType: () => "image",
  getExt: () => "jpg",
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
const { deleteTicketAction, checkTicketDeletionAction } = await import("./admin");

const RUN = `deltest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
let adminId: string;
let technicianId: string;

type Opts = {
  type?: "service" | "warranty_claim";
  status?: "waiting" | "on_progress" | "done" | "rma_process";
  attachments?: string[];
  logs?: { new_status: string }[];
};

async function makeTicket(opts: Opts = {}) {
  const ticket = await db.ticket.create({
    data: {
      ticket_code: `${RUN}_${Math.random().toString(36).slice(2, 10)}`,
      ticket_type: opts.type ?? "service",
      device_type: "Laptop_Gaming",
      status: opts.status ?? "done",
      technician_id: technicianId,
      pickup_method: "self_pickup",
    },
    select: { id: true, ticket_code: true },
  });

  for (const log of opts.logs ?? []) {
    await db.ticketStatusLog.create({
      data: {
        ticket_id: ticket.id,
        new_status: log.new_status as never,
        changed_by: technicianId,
      },
    });
  }

  for (const url of opts.attachments ?? []) {
    await db.ticketAttachment.create({
      data: { ticket_id: ticket.id, file_url: url, file_type: "image" },
    });
  }

  return ticket;
}

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
  return row ?? {
    tickets_handled: 0,
    success_count: 0,
    failed_count: 0,
    total_points_completed: 0,
  };
}

beforeAll(async () => {
  const [admin, tech] = await Promise.all([
    db.user.create({
      data: {
        name: `${RUN} admin`,
        email: `${RUN}.admin@test.local`,
        phone_number: "+628100000011",
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
        phone_number: "+628100000012",
        address: "Test",
        role: "Technician",
        password: "x",
      },
      select: { id: true },
    }),
  ]);
  adminId = admin.id;
  technicianId = tech.id;

  await db.technicianPerformance.create({
    data: {
      technician_id: technicianId,
      tickets_handled: 10,
      success_count: 8,
      failed_count: 2,
      total_points_completed: 50,
    },
  });
});

beforeEach(() => {
  session.userId = adminId;
  session.role = "Administrator";
  session.name = "Test Admin";
  deleted.length = 0;
  storageWorks = true;
});

afterAll(async () => {
  const tickets = await db.ticket.findMany({
    where: { ticket_code: { startsWith: RUN } },
    select: { id: true },
  });
  const ids = tickets.map((t) => t.id);
  if (ids.length > 0) {
    await db.ticket.deleteMany({ where: { id: { in: ids } } });
  }
  await db.deletedTicketLog.deleteMany({ where: { ticket_code: { startsWith: RUN } } });
  await db.technicianPerformance.deleteMany({ where: { technician_id: technicianId } });
  await db.user.deleteMany({ where: { email: { startsWith: RUN } } });
});

describe("guards", () => {
  it("refuses anyone who is not an administrator", async () => {
    session.role = "Technician";
    const ticket = await makeTicket();
    await expect(deleteTicketAction(ticket.id, "coba", ticket.ticket_code)).rejects.toThrow(
      "Unauthorized"
    );
    expect(await db.ticket.findUnique({ where: { id: ticket.id } })).not.toBeNull();
  });

  it("refuses an empty reason", async () => {
    const ticket = await makeTicket();
    const result = await deleteTicketAction(ticket.id, "   ", ticket.ticket_code);
    expect(result.error).toBe("Alasan penghapusan wajib diisi.");
    expect(await db.ticket.findUnique({ where: { id: ticket.id } })).not.toBeNull();
  });

  it("refuses a confirmation that is not the ticket code, so a mis-click cannot delete", async () => {
    const ticket = await makeTicket();
    const result = await deleteTicketAction(ticket.id, "salah input", "hapus");
    expect(result.error).toContain(ticket.ticket_code);
    expect(await db.ticket.findUnique({ where: { id: ticket.id } })).not.toBeNull();
  });

  it("is not satisfied by a near-miss confirmation", async () => {
    const ticket = await makeTicket();
    const result = await deleteTicketAction(
      ticket.id,
      "salah input",
      ticket.ticket_code.toLowerCase() + "x"
    );
    expect(result.error).toBeTruthy();
    expect(await db.ticket.findUnique({ where: { id: ticket.id } })).not.toBeNull();
  });

  it("accepts a confirmation with stray whitespace", async () => {
    const ticket = await makeTicket();
    const result = await deleteTicketAction(ticket.id, "salah input", `  ${ticket.ticket_code} `);
    expect(result.success).toBe(true);
  });

  it("reports a ticket that is already gone instead of throwing", async () => {
    const result = await deleteTicketAction("tidak-ada", "x", "x");
    expect(result.error).toBe("Tiket tidak ditemukan.");
  });
});

describe("the audit row outlives the ticket", () => {
  it("records who deleted what, and why", async () => {
    const ticket = await makeTicket({ logs: [{ new_status: "done" }] });

    await deleteTicketAction(ticket.id, "tiket ganda", ticket.ticket_code);

    expect(await db.ticket.findUnique({ where: { id: ticket.id } })).toBeNull();

    const log = await db.deletedTicketLog.findFirst({
      where: { ticket_code: ticket.ticket_code },
    });
    expect(log).not.toBeNull();
    expect(log!.reason).toBe("tiket ganda");
    expect(log!.deleted_by_id).toBe(adminId);
    expect(log!.deleted_by_name).toBe("Test Admin");
    expect(log!.ticket_type).toBe("service");
  });

  it("keeps a count of everything the cascade destroyed", async () => {
    const ticket = await makeTicket({
      logs: [{ new_status: "on_progress" }, { new_status: "done" }],
      attachments: ["/uploads/a.jpg", "/uploads/b.jpg"],
    });

    await deleteTicketAction(ticket.id, "salah input", ticket.ticket_code);

    const log = await db.deletedTicketLog.findFirst({
      where: { ticket_code: ticket.ticket_code },
    });
    const snapshot = log!.snapshot as Record<string, unknown>;
    const destroyed = snapshot.destroyed as Record<string, number>;

    expect(destroyed.status_logs).toBe(2);
    expect(destroyed.attachments).toBe(2);
    // The URLs survive the row, so an orphan in the bucket can still be traced.
    expect(snapshot.attachment_urls).toEqual(["/uploads/a.jpg", "/uploads/b.jpg"]);
  });

  it("survives the cascade — it holds no foreign key to the ticket", async () => {
    const ticket = await makeTicket();
    await deleteTicketAction(ticket.id, "x", ticket.ticket_code);

    // The whole point: the ticket is gone and this row is still readable.
    expect(await db.ticket.findUnique({ where: { id: ticket.id } })).toBeNull();
    expect(
      await db.deletedTicketLog.count({ where: { ticket_code: ticket.ticket_code } })
    ).toBe(1);
  });
});

describe("point counters are put back", () => {
  it("reverses a credited service ticket by its own point value", async () => {
    const before = await perf();
    const ticket = await makeTicket({ type: "service", logs: [{ new_status: "done" }] });

    const result = await deleteTicketAction(ticket.id, "x", ticket.ticket_code);

    const after = await perf();
    expect(result.pointsReversed).toBe(5); // service, not Other_Device
    expect(after.total_points_completed).toBe(before.total_points_completed - 5);
    expect(after.success_count).toBe(before.success_count - 1);
    expect(after.tickets_handled).toBe(before.tickets_handled - 1);
  });

  it("reverses a warranty claim on its handover log, not on `done`", async () => {
    const before = await perf();
    // The shape that makes a claim easy to double-count: it is paid at
    // rma_process and later reaches done, which pays nothing.
    const ticket = await makeTicket({
      type: "warranty_claim",
      status: "done",
      logs: [{ new_status: "rma_process" }, { new_status: "done" }],
    });

    const result = await deleteTicketAction(ticket.id, "x", ticket.ticket_code);

    const after = await perf();
    expect(result.pointsReversed).toBe(2); // credited once, worth 2
    expect(after.success_count).toBe(before.success_count - 1);
  });

  it("reverses a failure as a failure, with no points", async () => {
    const before = await perf();
    const ticket = await makeTicket({ status: "waiting", logs: [{ new_status: "cancelled" }] });

    const result = await deleteTicketAction(ticket.id, "x", ticket.ticket_code);

    const after = await perf();
    expect(result.pointsReversed).toBe(0);
    expect(after.failed_count).toBe(before.failed_count - 1);
    expect(after.total_points_completed).toBe(before.total_points_completed);
  });

  it("leaves the counters alone for a ticket that never earned anything", async () => {
    const before = await perf();
    const ticket = await makeTicket({ status: "waiting", logs: [{ new_status: "on_progress" }] });

    await deleteTicketAction(ticket.id, "x", ticket.ticket_code);

    expect(await perf()).toEqual(before);
  });

  it("never drives a counter negative, however far it has already drifted", async () => {
    await db.technicianPerformance.update({
      where: { technician_id: technicianId },
      data: { tickets_handled: 0, success_count: 0, failed_count: 0, total_points_completed: 1 },
    });
    const ticket = await makeTicket({ type: "service", logs: [{ new_status: "done" }] });

    await deleteTicketAction(ticket.id, "x", ticket.ticket_code);

    const after = await perf();
    expect(after.total_points_completed).toBe(0);
    expect(after.success_count).toBe(0);
    expect(after.tickets_handled).toBe(0);
  });
});

describe("attachment files", () => {
  it("asks storage to remove every attachment", async () => {
    const ticket = await makeTicket({ attachments: ["/uploads/one.jpg", "/uploads/two.jpg"] });

    const result = await deleteTicketAction(ticket.id, "x", ticket.ticket_code);

    expect(deleted).toEqual(["/uploads/one.jpg", "/uploads/two.jpg"]);
    expect(result.orphanedFiles).toBe(0);
  });

  it("still reports success when storage refuses, and counts the orphans", async () => {
    storageWorks = false;
    const ticket = await makeTicket({ attachments: ["/uploads/stuck.jpg"] });

    const result = await deleteTicketAction(ticket.id, "x", ticket.ticket_code);

    // The rows are already gone; a storage failure must not look like the
    // delete did not happen.
    expect(result.success).toBe(true);
    expect(result.orphanedFiles).toBe(1);
    expect(await db.ticket.findUnique({ where: { id: ticket.id } })).toBeNull();
  });
});

describe("checkTicketDeletionAction", () => {
  it("counts what would be destroyed without destroying it", async () => {
    const ticket = await makeTicket({
      logs: [{ new_status: "on_progress" }, { new_status: "done" }],
      attachments: ["/uploads/x.jpg"],
    });

    const result = await checkTicketDeletionAction(ticket.id);

    expect(result.destroys?.statusLogs).toBe(2);
    expect(result.destroys?.attachments).toBe(1);
    expect(result.credits?.earningLogs).toBe(1);
    expect(await db.ticket.findUnique({ where: { id: ticket.id } })).not.toBeNull();
  });

  it("refuses a non-administrator", async () => {
    session.role = "Sales";
    const ticket = await makeTicket();
    await expect(checkTicketDeletionAction(ticket.id)).rejects.toThrow("Unauthorized");
  });
});
