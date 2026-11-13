/**
 * Integration tests for taking a ticket's points off and giving them back,
 * through the real actions against the local database (vitest.setup.ts refuses
 * anything else). Fixtures are namespaced per run and removed in afterAll.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/email", () => ({ sendTicketStatusEmail: vi.fn(async () => undefined), EMAIL_MILESTONES: [] }));

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
const { EARNING_STATUS_LOG_FILTER } = await import("@/lib/kpi");
const { excludeTicketPointsAction, restoreTicketPointsAction } = await import("./ticket-points");
const { adminUpdateTicketStatusAction } = await import("./admin");

const RUN = `pointstest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
let adminId: string;
let technicianId: string;

const user = (suffix: string, role: "Administrator" | "Technician") =>
  db.user.create({
    data: { name: `${RUN} ${suffix}`, email: `${RUN}.${suffix}@test.local`, phone_number: "+628100000009", address: "Test", role, password: "x" },
    select: { id: true },
  });

/** A service ticket the technician finished (5 points), credited as the action credits it. */
async function finishedTicket() {
  const t = await db.ticket.create({
    data: {
      ticket_code: `${RUN}_${Math.random().toString(36).slice(2, 10)}`,
      ticket_type: "service",
      device_type: "Laptop_Gaming",
      status: "on_progress",
      technician_id: technicianId,
      pickup_method: "self_pickup",
    },
    select: { id: true },
  });
  const r = await adminUpdateTicketStatusAction(t.id, "done");
  expect(r).not.toHaveProperty("error");
  return t.id;
}

const perf = () =>
  db.technicianPerformance.findUniqueOrThrow({
    where: { technician_id: technicianId },
    select: { tickets_handled: true, success_count: true, total_points_completed: true },
  });
const earningLogs = (id: string) => db.ticketStatusLog.count({ where: { ticket_id: id, ...EARNING_STATUS_LOG_FILTER } });

beforeAll(async () => {
  const [admin, tech] = await Promise.all([user("admin", "Administrator"), user("tech", "Technician")]);
  adminId = admin.id;
  technicianId = tech.id;
  await db.technicianPerformance.create({ data: { technician_id: technicianId } });
});

beforeEach(() => {
  session.userId = adminId;
  session.role = "Administrator";
});

afterAll(async () => {
  const ids = (await db.ticket.findMany({ where: { ticket_code: { startsWith: RUN } }, select: { id: true } })).map((t) => t.id);
  if (ids.length) {
    await db.notification.deleteMany({ where: { ticket_id: { in: ids } } });
    await db.ticketStatusLog.deleteMany({ where: { ticket_id: { in: ids } } });
    await db.ticketTimeLog.deleteMany({ where: { ticket_id: { in: ids } } });
    await db.ticket.deleteMany({ where: { id: { in: ids } } });
  }
  await db.technicianPerformance.deleteMany({ where: { technician_id: { in: [technicianId, adminId] } } });
  await db.notification.deleteMany({ where: { user_id: { in: [technicianId, adminId] } } });
  await db.user.deleteMany({ where: { id: { in: [technicianId, adminId] } } });
  await db.$disconnect();
});

describe("excludeTicketPointsAction / restoreTicketPointsAction", () => {
  it("takes back exactly what the ticket credited, and drops it from every earning query", async () => {
    const id = await finishedTicket();
    const before = await perf();
    expect(await earningLogs(id)).toBe(1);

    expect(await excludeTicketPointsAction(id, "tiket uji")).toEqual({ success: true });
    const after = await perf();
    expect(after.total_points_completed).toBe(before.total_points_completed - 5);
    expect(after.success_count).toBe(before.success_count - 1);
    expect(after.tickets_handled).toBe(before.tickets_handled - 1);
    expect(await earningLogs(id)).toBe(0);
    const row = await db.ticket.findUniqueOrThrow({ where: { id }, select: { points_excluded_by: true, points_excluded_points: true } });
    expect(row).toEqual({ points_excluded_by: "Test Admin", points_excluded_points: 5 });

    expect(await restoreTicketPointsAction(id)).toEqual({ success: true });
    expect(await perf()).toEqual(before);
    expect(await earningLogs(id)).toBe(1);
  });

  it("asks for a reason, refuses twice, and is for administrators only", async () => {
    const id = await finishedTicket();
    expect(await excludeTicketPointsAction(id, "  ")).toHaveProperty("error");
    expect(await excludeTicketPointsAction(id, "staf sendiri")).toEqual({ success: true });
    const once = await perf();
    expect(await excludeTicketPointsAction(id, "lagi")).toHaveProperty("error");
    expect(await perf()).toEqual(once);
    expect(await restoreTicketPointsAction(id)).toEqual({ success: true });
    expect(await restoreTicketPointsAction(id)).toHaveProperty("error");

    session.role = "Technician";
    await expect(excludeTicketPointsAction(id, "x")).rejects.toThrow("Unauthorized");
  });

  it("credits nothing when a ticket without points is finished again", async () => {
    const id = await finishedTicket();
    await excludeTicketPointsAction(id, "tiket uji");
    await adminUpdateTicketStatusAction(id, "on_progress");
    const before = await perf();
    await adminUpdateTicketStatusAction(id, "done");
    expect(await perf()).toEqual(before);
  });
});
