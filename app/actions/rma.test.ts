/**
 * Integration tests for the RMA server actions.
 *
 * These run against the local Postgres container — vitest.setup.ts aborts the
 * whole run if DATABASE_URL points anywhere but this machine. Every test builds
 * its own fixtures under a unique prefix and afterAll removes them, so no
 * seeded or pre-existing row is touched.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

// lib/db.ts imports "server-only", which throws outside a React Server Component.
vi.mock("server-only", () => ({}));

// revalidatePath needs a request context these tests do not have.
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

// R2 is a network dependency; the actions only care about the returned URL.
vi.mock("@/lib/r2", () => ({
  uploadToR2: vi.fn(async () => "https://r2.test/uploaded-invoice.pdf"),
  getExt: () => "pdf",
  getFileType: () => "pdf" as const,
}));

// updateTicketStatusAction, imported below for the credit-parity test, fires
// this without awaiting it. rma.ts itself sends no email.
vi.mock("@/lib/email", () => ({
  sendTicketStatusEmail: vi.fn(async () => undefined),
  EMAIL_MILESTONES: [],
}));

// Mutable session the tests swap between roles.
const session = { userId: "", role: "", name: "Test User" };
vi.mock("@/lib/session", () => ({
  requireSession: async () => session,
  getSession: async () => session,
  requireRole: async (...roles: string[]) => {
    if (!roles.includes(session.role)) throw new Error("Unauthorized");
    return session;
  },
}));

const { db } = await import("@/lib/db");
const { handoverToRmaAction, transitionRmaAction } = await import("./rma");
const { updateTicketStatusAction } = await import("./technician");

const RUN = `rmatest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
// Store codes are alphanumeric in production (e.g. "NGW") and feed straight into
// rma_code, so the fixture uses the same shape rather than the RUN prefix.
const STORE_CODE = `T${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

let storeId: string;
let technicianId: string;
let otherTechnicianId: string;
let rmaUserId: string;
let adminId: string;

/** A fresh warranty_claim ticket assigned to `technicianId` and in progress. */
const intakeInvoiceUrl = (ticketId: string) => `https://r2.test/intake-invoice-${ticketId}.pdf`;

async function makeTicket(
  overrides: {
    status?: "waiting" | "on_progress";
    ticket_type?: "warranty_claim" | "service";
    withInvoice?: boolean;
  } = {}
) {
  const ticket = await db.ticket.create({
    data: {
      ticket_code: `${RUN}_${Math.random().toString(36).slice(2, 10)}`,
      ticket_type: overrides.ticket_type ?? "warranty_claim",
      device_type: "Laptop_Gaming",
      status: overrides.status ?? "on_progress",
      technician_id: technicianId,
      store_location_id: storeId,
      device_sn: "SN-TEST-0001",
    },
    select: { id: true, ticket_code: true },
  });

  // Intake attaches the invoice through the normal attachment mechanism, which
  // is what the handover form later points at.
  if (overrides.withInvoice !== false) {
    await db.ticketAttachment.create({
      data: { ticket_id: ticket.id, file_url: intakeInvoiceUrl(ticket.id), file_type: "pdf" },
    });
  }
  return ticket;
}

/** Service form payload that passes every validation. */
function validForm(ticketId: string, extra: Record<string, string> = {}) {
  const fd = new FormData();
  fd.append("ticketId", ticketId);
  fd.append("unit_ownership", "customer");
  fd.append("sn_verified", "1");
  fd.append("physical_condition", "Lecet ringan di sudut kiri");
  fd.append("fault_description", "Layar berkedip saat booting");
  fd.append("test_result", "Reproduksi konsisten pada 3 kali percobaan");
  fd.append("purchase_invoice_url", intakeInvoiceUrl(ticketId));
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  return fd;
}

function transitionForm(rmaCaseId: string, toStatus: string, extra: Record<string, string> = {}) {
  const fd = new FormData();
  fd.append("rmaCaseId", rmaCaseId);
  fd.append("toStatus", toStatus);
  for (const [k, v] of Object.entries(extra)) fd.append(k, v);
  return fd;
}

/** Drive a case to a given status using the real action, as RMA staff. */
async function driveTo(rmaCaseId: string, path: [string, Record<string, string>][]) {
  const previous = { ...session };
  session.userId = rmaUserId;
  session.role = "RMA";
  for (const [to, extra] of path) {
    const result = await transitionRmaAction(transitionForm(rmaCaseId, to, extra));
    if ("error" in result && result.error) throw new Error(`driveTo ${to}: ${result.error}`);
  }
  Object.assign(session, previous);
}

beforeAll(async () => {
  const store = await db.storeLocation.create({
    data: { name: `${RUN} Store`, code: STORE_CODE },
    select: { id: true },
  });
  storeId = store.id;

  const mkUser = async (role: "Technician" | "RMA" | "Administrator", tag: string) =>
    (
      await db.user.create({
        data: {
          name: `${RUN} ${tag}`,
          email: `${RUN}.${tag}@test.local`,
          phone_number: "+628100000000",
          address: "Test",
          role,
          password: "x",
        },
        select: { id: true },
      })
    ).id;

  technicianId = await mkUser("Technician", "tech");
  otherTechnicianId = await mkUser("Technician", "tech2");
  rmaUserId = await mkUser("RMA", "rma");
  adminId = await mkUser("Administrator", "admin");
});

// Each test starts as the assigned technician unless it says otherwise.
beforeEach(() => {
  session.userId = technicianId;
  session.role = "Technician";
});

afterAll(async () => {
  const tickets = await db.ticket.findMany({
    where: { ticket_code: { startsWith: RUN } },
    select: { id: true },
  });
  const ticketIds = tickets.map((t) => t.id);
  const userIds = [technicianId, otherTechnicianId, rmaUserId, adminId].filter(Boolean);

  if (ticketIds.length > 0) {
    const cases = await db.rmaCase.findMany({
      where: { ticket_id: { in: ticketIds } },
      select: { id: true },
    });
    const caseIds = cases.map((c) => c.id);
    if (caseIds.length > 0) {
      await db.rmaEvent.deleteMany({ where: { rma_case_id: { in: caseIds } } });
      await db.rmaCase.deleteMany({ where: { id: { in: caseIds } } });
    }
    await db.notification.deleteMany({ where: { ticket_id: { in: ticketIds } } });
    await db.ticketStatusLog.deleteMany({ where: { ticket_id: { in: ticketIds } } });
    await db.ticketAttachment.deleteMany({ where: { ticket_id: { in: ticketIds } } });
    await db.ticket.deleteMany({ where: { id: { in: ticketIds } } });
  }
  // Handover credits the technician, so a performance row now points at the
  // fixture user and blocks the delete.
  await db.technicianPerformance.deleteMany({
    where: { technician_id: { in: userIds } },
  });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.storeLocation.deleteMany({ where: { id: storeId } });
  await db.$disconnect();
});

// ─────────────────────────────────────────────────────────────────────────────

describe("handoverToRmaAction — authorization", () => {
  it("refuses a technician who is not assigned to the ticket", async () => {
    const ticket = await makeTicket();
    session.userId = otherTechnicianId;
    const result = await handoverToRmaAction(validForm(ticket.id));
    expect(result).toMatchObject({ error: expect.stringContaining("assigned technician") });
  });

  it("allows an Administrator who is not the assigned technician", async () => {
    const ticket = await makeTicket();
    session.userId = adminId;
    session.role = "Administrator";
    const result = await handoverToRmaAction(validForm(ticket.id));
    expect(result).toMatchObject({ success: true });
  });
});

describe("handoverToRmaAction — preconditions", () => {
  it("refuses a ticket that is not a warranty claim", async () => {
    const ticket = await makeTicket({ ticket_type: "service" });
    const result = await handoverToRmaAction(validForm(ticket.id));
    expect(result).toMatchObject({ error: expect.stringContaining("warranty claim") });
  });

  it("refuses a ticket that is not in progress", async () => {
    const ticket = await makeTicket({ status: "waiting" });
    const result = await handoverToRmaAction(validForm(ticket.id));
    expect(result).toMatchObject({ error: expect.stringContaining("in progress") });
  });

  it("refuses an unknown ticket", async () => {
    const result = await handoverToRmaAction(validForm("does-not-exist"));
    expect(result).toMatchObject({ error: "Ticket not found" });
  });
});

describe("handoverToRmaAction — service form validation", () => {
  it("refuses when the serial number has not been verified", async () => {
    const ticket = await makeTicket();
    const fd = validForm(ticket.id);
    fd.set("sn_verified", "0");
    const result = await handoverToRmaAction(fd);
    expect(result).toMatchObject({ error: expect.stringContaining("Serial number") });

    // nothing was written
    expect(await db.rmaCase.count({ where: { ticket_id: ticket.id } })).toBe(0);
    const after = await db.ticket.findUnique({ where: { id: ticket.id }, select: { status: true } });
    expect(after?.status).toBe("on_progress");
  });

  it("refuses a customer-owned unit with no invoice at all", async () => {
    const ticket = await makeTicket();
    const fd = validForm(ticket.id);
    fd.delete("purchase_invoice_url");
    const result = await handoverToRmaAction(fd);
    expect(result).toMatchObject({ error: expect.stringContaining("invoice") });
    expect(await db.rmaCase.count({ where: { ticket_id: ticket.id } })).toBe(0);
  });

  it("accepts a customer-owned unit when intake already attached the invoice", async () => {
    const ticket = await makeTicket();
    const result = await handoverToRmaAction(validForm(ticket.id));
    expect(result).toMatchObject({ success: true });

    const rmaCase = await db.rmaCase.findUnique({
      where: { ticket_id: ticket.id },
      select: { purchase_invoice_url: true },
    });
    // reused the intake URL, no new upload
    expect(rmaCase?.purchase_invoice_url).toBe(intakeInvoiceUrl(ticket.id));
  });

  it("uploads a new invoice only when intake did not provide one", async () => {
    const ticket = await makeTicket();
    const fd = validForm(ticket.id);
    fd.delete("purchase_invoice_url");
    fd.append("invoice_files", new File(["pdf-bytes"], "nota.pdf", { type: "application/pdf" }));

    const result = await handoverToRmaAction(fd);
    expect(result).toMatchObject({ success: true });

    const rmaCase = await db.rmaCase.findUnique({
      where: { ticket_id: ticket.id },
      select: { purchase_invoice_url: true },
    });
    expect(rmaCase?.purchase_invoice_url).toBe("https://r2.test/uploaded-invoice.pdf");

    // also surfaced in the ticket's normal attachment list
    const attachments = await db.ticketAttachment.count({ where: { ticket_id: ticket.id } });
    expect(attachments).toBe(2); // intake invoice + the newly uploaded one
  });

  it("refuses an invoice URL that belongs to a different ticket", async () => {
    const mine = await makeTicket();
    const theirs = await makeTicket();

    const fd = validForm(mine.id);
    fd.set("purchase_invoice_url", intakeInvoiceUrl(theirs.id));

    const result = await handoverToRmaAction(fd);
    expect(result).toMatchObject({
      error: expect.stringContaining("not an attachment of this ticket"),
    });
    expect(await db.rmaCase.count({ where: { ticket_id: mine.id } })).toBe(0);
  });

  it("refuses an arbitrary invoice URL the client made up", async () => {
    const ticket = await makeTicket();
    const fd = validForm(ticket.id);
    fd.set("purchase_invoice_url", "https://evil.test/not-ours.pdf");

    const result = await handoverToRmaAction(fd);
    expect(result).toMatchObject({
      error: expect.stringContaining("not an attachment of this ticket"),
    });
    expect(await db.rmaCase.count({ where: { ticket_id: ticket.id } })).toBe(0);
  });

  it("refuses a store stock unit with no stock origin", async () => {
    const ticket = await makeTicket();
    const fd = validForm(ticket.id);
    fd.set("unit_ownership", "store_stock");
    fd.delete("purchase_invoice_url");
    const result = await handoverToRmaAction(fd);
    expect(result).toMatchObject({ error: expect.stringContaining("Stock origin") });
  });

  it("accepts a store stock unit with a stock origin and no invoice", async () => {
    const ticket = await makeTicket();
    const fd = validForm(ticket.id);
    fd.set("unit_ownership", "store_stock");
    fd.set("stock_origin", "Gudang Nagoya rak B3");
    fd.delete("purchase_invoice_url");
    const result = await handoverToRmaAction(fd);
    expect(result).toMatchObject({ success: true });
  });

  it.each([
    ["physical_condition", "Physical condition"],
    ["fault_description", "Fault description"],
    ["test_result", "Test result"],
  ])("refuses when %s is blank", async (field, label) => {
    const ticket = await makeTicket();
    const fd = validForm(ticket.id);
    fd.set(field, "   ");
    const result = await handoverToRmaAction(fd);
    expect(result).toMatchObject({ error: expect.stringContaining(label) });
  });
});

describe("handoverToRmaAction — effects and idempotence", () => {
  it("writes the case, the first event, the ticket status and the status log", async () => {
    const ticket = await makeTicket();
    const result = await handoverToRmaAction(validForm(ticket.id));
    expect(result).toMatchObject({ success: true });

    const rmaCase = await db.rmaCase.findUnique({
      where: { ticket_id: ticket.id },
      select: {
        id: true,
        rma_code: true,
        status: true,
        handed_over_by_id: true,
        events: { select: { from_status: true, to_status: true, actor_id: true } },
      },
    });
    expect(rmaCase?.status).toBe("pending_verification");
    expect(rmaCase?.handed_over_by_id).toBe(technicianId);
    expect(rmaCase?.rma_code).toMatch(/^RMA-[A-Z0-9]+-\d{4}-\d{4}$/);
    expect(rmaCase?.events).toHaveLength(1);
    expect(rmaCase?.events[0]).toMatchObject({ from_status: null, to_status: "pending_verification" });

    const after = await db.ticket.findUnique({
      where: { id: ticket.id },
      select: { status: true, work_completed_at: true },
    });
    expect(after?.status).toBe("rma_process");
    expect(after?.work_completed_at).toBeInstanceOf(Date);

    const log = await db.ticketStatusLog.findFirst({
      where: { ticket_id: ticket.id, new_status: "rma_process" },
      select: { old_status: true, changed_by: true },
    });
    expect(log).toMatchObject({ old_status: "on_progress", changed_by: technicianId });
  });

  it("refuses a second handover of the same ticket", async () => {
    const ticket = await makeTicket();
    expect(await handoverToRmaAction(validForm(ticket.id))).toMatchObject({ success: true });

    // The ticket is now rma_process, so the status guard fires first.
    const second = await handoverToRmaAction(validForm(ticket.id));
    expect(second).toMatchObject({ error: expect.stringContaining("in progress") });
    expect(await db.rmaCase.count({ where: { ticket_id: ticket.id } })).toBe(1);
  });

  it("issues sequential rma_codes within the same store and month", async () => {
    const a = await makeTicket();
    const b = await makeTicket();
    const ra = await handoverToRmaAction(validForm(a.id));
    const rb = await handoverToRmaAction(validForm(b.id));
    expect(ra).toMatchObject({ success: true });
    expect(rb).toMatchObject({ success: true });

    const seq = (code: string) => parseInt(code.slice(code.lastIndexOf("-") + 1), 10);
    if ("rmaCode" in ra && "rmaCode" in rb && ra.rmaCode && rb.rmaCode) {
      expect(seq(rb.rmaCode)).toBe(seq(ra.rmaCode) + 1);
    }
  });
});

describe("handoverToRmaAction — technician KPI", () => {
  /** The stored counters for the assigned technician, or zeros. */
  async function perf() {
    const row = await db.technicianPerformance.findUnique({
      where: { technician_id: technicianId },
      select: { tickets_handled: true, success_count: true, failed_count: true, total_points_completed: true },
    });
    return (
      row ?? { tickets_handled: 0, success_count: 0, failed_count: 0, total_points_completed: 0 }
    );
  }

  it("credits the assigned technician at handover, not when the case closes", async () => {
    const before = await perf();
    const ticket = await makeTicket();
    expect(await handoverToRmaAction(validForm(ticket.id))).toMatchObject({ success: true });

    const after = await perf();
    // warranty_claim is worth 2 points -- see lib/points.ts.
    expect(after.tickets_handled).toBe(before.tickets_handled + 1);
    expect(after.success_count).toBe(before.success_count + 1);
    expect(after.failed_count).toBe(before.failed_count);
    expect(after.total_points_completed).toBe(before.total_points_completed + 2);
  });

  it("credits nothing when the handover is refused", async () => {
    const before = await perf();
    const ticket = await makeTicket();
    const fd = validForm(ticket.id);
    fd.set("sn_verified", "0");
    expect(await handoverToRmaAction(fd)).toMatchObject({ error: expect.any(String) });

    expect(await perf()).toEqual(before);
  });

  it("credits a claim exactly once even if handover is attempted twice", async () => {
    const before = await perf();
    const ticket = await makeTicket();
    expect(await handoverToRmaAction(validForm(ticket.id))).toMatchObject({ success: true });
    expect(await handoverToRmaAction(validForm(ticket.id))).toMatchObject({
      error: expect.any(String),
    });

    const after = await perf();
    expect(after.success_count).toBe(before.success_count + 1);
    expect(after.total_points_completed).toBe(before.total_points_completed + 2);
  });

  it("credits the assigned technician even when an Administrator does the handover", async () => {
    const before = await perf();
    const ticket = await makeTicket();
    session.userId = adminId;
    session.role = "Administrator";
    expect(await handoverToRmaAction(validForm(ticket.id))).toMatchObject({ success: true });
    session.userId = technicianId;
    session.role = "Technician";

    const after = await perf();
    expect(after.success_count).toBe(before.success_count + 1);
  });
});

describe("KPI parity — both exits from a claim pay the same", () => {
  /** The stored counters for the assigned technician, or zeros. */
  async function perf() {
    const row = await db.technicianPerformance.findUnique({
      where: { technician_id: technicianId },
      select: { tickets_handled: true, success_count: true, failed_count: true, total_points_completed: true },
    });
    return (
      row ?? { tickets_handled: 0, success_count: 0, failed_count: 0, total_points_completed: 0 }
    );
  }

  /** Difference in the counters caused by running `act`. */
  async function creditedBy(act: () => Promise<unknown>) {
    const before = await perf();
    await act();
    const after = await perf();
    return {
      tickets_handled: after.tickets_handled - before.tickets_handled,
      success_count: after.success_count - before.success_count,
      failed_count: after.failed_count - before.failed_count,
      total_points_completed:
        after.total_points_completed - before.total_points_completed,
    };
  }

  function ineligibleForm(ticketId: string) {
    const fd = new FormData();
    fd.append("ticketId", ticketId);
    fd.append("newStatus", "done");
    fd.append("reason", "Kerusakan akibat cairan, di luar garansi");
    return fd;
  }

  it("pays a claim turned down exactly what it pays a handover", async () => {
    const handedOver = await makeTicket();
    const fromHandover = await creditedBy(async () => {
      expect(await handoverToRmaAction(validForm(handedOver.id))).toMatchObject({
        success: true,
      });
    });

    const turnedDown = await makeTicket();
    const fromIneligible = await creditedBy(async () => {
      expect(await updateTicketStatusAction(ineligibleForm(turnedDown.id))).toMatchObject({
        success: true,
      });
    });

    expect(fromIneligible).toEqual(fromHandover);
    // and it really is one credit, not zero on both sides
    expect(fromHandover).toEqual({
      tickets_handled: 1,
      success_count: 1,
      failed_count: 0,
      total_points_completed: 2,
    });
  });

  it("pays each of them exactly once across the ticket's whole life", async () => {
    // Handover, vendor decides, case closes, ticket returns to `done`.
    const ticket = await makeTicket();
    const total = await creditedBy(async () => {
      expect(await handoverToRmaAction(validForm(ticket.id))).toMatchObject({ success: true });

      const rmaCase = await db.rmaCase.findUnique({
        where: { ticket_id: ticket.id },
        select: { id: true },
      });

      session.userId = rmaUserId;
      session.role = "RMA";
      for (const to of ["verified", "submitted_to_vendor", "in_vendor_process"] as const) {
        const fd = new FormData();
        fd.append("rmaCaseId", rmaCase!.id);
        fd.append("toStatus", to);
        if (to === "submitted_to_vendor") {
          fd.append("vendor_name", "Vendor Uji");
          fd.append("vendor_rma_number", "V-001");
        }
        expect(await transitionRmaAction(fd), to).toMatchObject({ success: true });
      }
      for (const to of ["vendor_decided", "unit_received", "closed"] as const) {
        const fd = new FormData();
        fd.append("rmaCaseId", rmaCase!.id);
        fd.append("toStatus", to);
        if (to === "vendor_decided") fd.append("decision", "repaired");
        expect(await transitionRmaAction(fd), to).toMatchObject({ success: true });
      }

      session.userId = technicianId;
      session.role = "Technician";
    });

    // The closing `done` written by rma.ts must add nothing on top of the
    // handover credit.
    expect(total).toEqual({
      tickets_handled: 1,
      success_count: 1,
      failed_count: 0,
      total_points_completed: 2,
    });

    const after = await db.ticket.findUnique({
      where: { id: ticket.id },
      select: { status: true },
    });
    expect(after?.status).toBe("done");
  });
});

describe("handoverToRmaAction — notifications", () => {
  it("notifies every active RMA and Administrator user, and no one else", async () => {
    const inactive = await db.user.create({
      data: {
        name: `${RUN} rma-inactive`,
        email: `${RUN}.rma-inactive@test.local`,
        phone_number: "+628100000000",
        address: "Test",
        role: "RMA",
        password: "x",
        is_active: false,
      },
      select: { id: true },
    });

    const ticket = await makeTicket();
    expect(await handoverToRmaAction(validForm(ticket.id))).toMatchObject({ success: true });

    const notified = await db.notification.findMany({
      where: { ticket_id: ticket.id, type: "rma_update" },
      select: { user_id: true, message: true },
    });
    const notifiedIds = notified.map((n) => n.user_id);

    expect(notifiedIds).toContain(rmaUserId);
    expect(notifiedIds).toContain(adminId);
    expect(notifiedIds).not.toContain(inactive.id);
    expect(notifiedIds).not.toContain(technicianId);
    expect(notified[0].message).toContain(ticket.ticket_code);

    await db.notification.deleteMany({ where: { user_id: inactive.id } });
    await db.user.delete({ where: { id: inactive.id } });
  });

  it("writes no notification when the handover is refused", async () => {
    const ticket = await makeTicket();
    const fd = validForm(ticket.id);
    fd.set("sn_verified", "0");
    await handoverToRmaAction(fd);

    expect(await db.notification.count({ where: { ticket_id: ticket.id } })).toBe(0);
  });
});

describe("handoverToRmaAction — concurrent rma_code allocation", () => {
  it("gives two parallel handovers in the same store distinct codes", async () => {
    const a = await makeTicket();
    const b = await makeTicket();

    const [ra, rb] = await Promise.all([
      handoverToRmaAction(validForm(a.id)),
      handoverToRmaAction(validForm(b.id)),
    ]);

    expect(ra).toMatchObject({ success: true });
    expect(rb).toMatchObject({ success: true });

    const codes = await db.rmaCase.findMany({
      where: { ticket_id: { in: [a.id, b.id] } },
      select: { rma_code: true },
    });
    expect(codes).toHaveLength(2);
    expect(new Set(codes.map((c) => c.rma_code)).size).toBe(2);
    for (const c of codes) {
      expect(c.rma_code).toMatch(/^RMA-[A-Z0-9]+-\d{4}-\d{4}$/);
    }
  });

  it("gives four parallel handovers in the same store four distinct codes", async () => {
    const tickets = await Promise.all([makeTicket(), makeTicket(), makeTicket(), makeTicket()]);
    const results = await Promise.all(tickets.map((t) => handoverToRmaAction(validForm(t.id))));

    for (const r of results) expect(r).toMatchObject({ success: true });

    const codes = await db.rmaCase.findMany({
      where: { ticket_id: { in: tickets.map((t) => t.id) } },
      select: { rma_code: true },
    });
    expect(new Set(codes.map((c) => c.rma_code)).size).toBe(4);
  });
});

describe("transitionRmaAction — role guard", () => {
  it.each(["Technician", "Sales", "Customer"])("refuses role %s", async (role) => {
    const ticket = await makeTicket();
    await handoverToRmaAction(validForm(ticket.id));
    const rmaCase = await db.rmaCase.findUniqueOrThrow({
      where: { ticket_id: ticket.id },
      select: { id: true },
    });

    session.role = role;
    const result = await transitionRmaAction(transitionForm(rmaCase.id, "verified"));
    expect(result).toMatchObject({ error: expect.stringContaining("RMA") });

    const after = await db.rmaCase.findUnique({ where: { id: rmaCase.id }, select: { status: true } });
    expect(after?.status).toBe("pending_verification");
  });
});

describe("transitionRmaAction — rules", () => {
  async function freshCase() {
    const ticket = await makeTicket();
    await handoverToRmaAction(validForm(ticket.id));
    const rmaCase = await db.rmaCase.findUniqueOrThrow({
      where: { ticket_id: ticket.id },
      select: { id: true },
    });
    session.userId = rmaUserId;
    session.role = "RMA";
    return { ticketId: ticket.id, rmaCaseId: rmaCase.id };
  }

  it("refuses an illegal transition", async () => {
    const { rmaCaseId } = await freshCase();
    const result = await transitionRmaAction(transitionForm(rmaCaseId, "closed"));
    expect(result).toMatchObject({ error: expect.stringContaining("tidak diizinkan") });
  });

  it("refuses on_hold without a reason and records nothing", async () => {
    const { rmaCaseId } = await freshCase();
    const before = await db.rmaEvent.count({ where: { rma_case_id: rmaCaseId } });

    const result = await transitionRmaAction(transitionForm(rmaCaseId, "on_hold"));
    expect(result).toMatchObject({ error: expect.stringContaining("wajib diisi") });

    expect(await db.rmaEvent.count({ where: { rma_case_id: rmaCaseId } })).toBe(before);
  });

  it("refuses submission without vendor name and number", async () => {
    const { rmaCaseId } = await freshCase();
    await driveTo(rmaCaseId, [["verified", {}]]);
    session.userId = rmaUserId;
    session.role = "RMA";

    const result = await transitionRmaAction(
      transitionForm(rmaCaseId, "submitted_to_vendor", { vendor_name: "Asus" })
    );
    expect(result).toMatchObject({ error: expect.stringContaining("Nomor RMA vendor") });
  });

  it("refuses a `replaced` decision without a replacement serial number", async () => {
    const { rmaCaseId } = await freshCase();
    await driveTo(rmaCaseId, [
      ["verified", {}],
      ["submitted_to_vendor", { vendor_name: "Asus", vendor_rma_number: "V-1" }],
      ["in_vendor_process", {}],
    ]);
    session.userId = rmaUserId;
    session.role = "RMA";

    const result = await transitionRmaAction(
      transitionForm(rmaCaseId, "vendor_decided", { decision: "replaced" })
    );
    expect(result).toMatchObject({ error: expect.stringContaining("Serial number pengganti") });
  });

  it("stores vendor fields, clears a stale hold reason and writes an event per step", async () => {
    const { rmaCaseId } = await freshCase();
    await driveTo(rmaCaseId, [
      ["on_hold", { hold_reason: "Nota belum lengkap" }],
      ["pending_verification", {}],
      ["verified", {}],
      ["submitted_to_vendor", { vendor_name: "Asus", vendor_rma_number: "V-77", shipping_tracking: "JNE-1" }],
    ]);

    const rmaCase = await db.rmaCase.findUniqueOrThrow({
      where: { id: rmaCaseId },
      select: {
        status: true,
        hold_reason: true,
        vendor_name: true,
        vendor_rma_number: true,
        shipping_tracking: true,
        submitted_at: true,
        handler_id: true,
        events: { select: { id: true } },
      },
    });
    expect(rmaCase.status).toBe("submitted_to_vendor");
    expect(rmaCase.hold_reason).toBeNull();
    expect(rmaCase.vendor_name).toBe("Asus");
    expect(rmaCase.vendor_rma_number).toBe("V-77");
    expect(rmaCase.shipping_tracking).toBe("JNE-1");
    expect(rmaCase.submitted_at).toBeInstanceOf(Date);
    expect(rmaCase.handler_id).toBe(rmaUserId);
    // 1 handover event + 4 transitions
    expect(rmaCase.events).toHaveLength(5);
  });
});

describe("transitionRmaAction — releasing the ticket", () => {
  it("hands the ticket back to `done` when the case closes", async () => {
    const ticket = await makeTicket();
    await handoverToRmaAction(validForm(ticket.id));
    const rmaCase = await db.rmaCase.findUniqueOrThrow({
      where: { ticket_id: ticket.id },
      select: { id: true },
    });

    await driveTo(rmaCase.id, [
      ["verified", {}],
      ["submitted_to_vendor", { vendor_name: "Asus", vendor_rma_number: "V-9" }],
      ["in_vendor_process", {}],
      ["vendor_decided", { decision: "replaced", replacement_sn: "SN-NEW-9" }],
      ["unit_received", {}],
      ["closed", {}],
    ]);

    const after = await db.ticket.findUnique({ where: { id: ticket.id }, select: { status: true } });
    expect(after?.status).toBe("done");

    const log = await db.ticketStatusLog.findFirst({
      where: { ticket_id: ticket.id, new_status: "done" },
      select: { old_status: true, reason: true },
    });
    expect(log?.old_status).toBe("rma_process");
    expect(log?.reason).toContain("closed");

    const closed = await db.rmaCase.findUniqueOrThrow({
      where: { id: rmaCase.id },
      select: { status: true, decision: true, replacement_sn: true, closed_at: true },
    });
    expect(closed).toMatchObject({ status: "closed", decision: "replaced", replacement_sn: "SN-NEW-9" });
    expect(closed.closed_at).toBeInstanceOf(Date);
  });

  it("hands the ticket back to `done` when the case is cancelled", async () => {
    const ticket = await makeTicket();
    await handoverToRmaAction(validForm(ticket.id));
    const rmaCase = await db.rmaCase.findUniqueOrThrow({
      where: { ticket_id: ticket.id },
      select: { id: true },
    });

    await driveTo(rmaCase.id, [["cancelled", { hold_reason: "Customer menarik klaim" }]]);

    const after = await db.ticket.findUnique({ where: { id: ticket.id }, select: { status: true } });
    expect(after?.status).toBe("done");
  });
});

describe("transitionRmaAction — concurrency", () => {
  it("lets exactly one of two parallel identical transitions win", async () => {
    const ticket = await makeTicket();
    await handoverToRmaAction(validForm(ticket.id));
    const rmaCase = await db.rmaCase.findUniqueOrThrow({
      where: { ticket_id: ticket.id },
      select: { id: true },
    });

    session.userId = rmaUserId;
    session.role = "RMA";

    const [a, b] = await Promise.all([
      transitionRmaAction(transitionForm(rmaCase.id, "verified")),
      transitionRmaAction(transitionForm(rmaCase.id, "verified")),
    ]);

    const results = [a, b];
    const successes = results.filter((r) => "success" in r && r.success);
    const failures = results.filter((r) => "error" in r && r.error);

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ error: expect.stringContaining("diubah user lain") });

    // and only one transition event was recorded on top of the handover event
    const events = await db.rmaEvent.count({
      where: { rma_case_id: rmaCase.id, to_status: "verified" },
    });
    expect(events).toBe(1);
  });

  it("lets exactly one of two parallel conflicting transitions win", async () => {
    const ticket = await makeTicket();
    await handoverToRmaAction(validForm(ticket.id));
    const rmaCase = await db.rmaCase.findUniqueOrThrow({
      where: { ticket_id: ticket.id },
      select: { id: true },
    });

    session.userId = rmaUserId;
    session.role = "RMA";

    const [a, b] = await Promise.all([
      transitionRmaAction(transitionForm(rmaCase.id, "verified")),
      transitionRmaAction(transitionForm(rmaCase.id, "on_hold", { hold_reason: "Fisik tidak sesuai" })),
    ]);

    const successes = [a, b].filter((r) => "success" in r && r.success);
    expect(successes).toHaveLength(1);

    const final = await db.rmaCase.findUniqueOrThrow({
      where: { id: rmaCase.id },
      select: { status: true },
    });
    expect(["verified", "on_hold"]).toContain(final.status);
  });
});
