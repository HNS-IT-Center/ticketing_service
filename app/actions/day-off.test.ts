/**
 * Libur tetap through the real action and database: who may set it, over
 * which stores, what it writes, and who is told.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));

const session = { userId: "", role: "Administrator", name: "QC" };
vi.mock("@/lib/session", () => ({
  requireSession: async () => session,
  getSession: async () => session,
  requireRole: async (...roles: string[]) => {
    if (!roles.includes(session.role)) throw new Error("Unauthorized");
    return session;
  },
}));

const { db } = await import("@/lib/db");
const { saveDayOffRuleAction } = await import("./day-off");
const { assignLeaveAction } = await import("./schedule");
const { loadLeaveFactors } = await import("@/lib/day-off-server");

const RUN = `dof${Date.now().toString(36)}`;
const ids: Record<string, string> = {};

async function user(key: string, role: string, store: string | null, flags: { is_team_leader?: boolean } = {}) {
  const u = await db.user.create({
    data: { name: `${RUN} ${key}`, email: `${RUN}.${key}@qc.local`, phone_number: "-", address: "-", role: role as never, password: "x", ...flags },
    select: { id: true },
  });
  ids[key] = u.id;
  if (store && role === "Technician") await db.technicianStoreAssignment.create({ data: { technician_id: u.id, store_id: ids[store] } });
  if (store && role === "StoreSupervisor") await db.storeSupervisorAssignment.create({ data: { user_id: u.id, store_id: ids[store] } });
}
const as = (key: string, role: string) => Object.assign(session, { userId: ids[key], role, name: `${RUN} ${key}` });
const notices = (key: string) =>
  db.notification.findMany({ where: { user_id: ids[key], type: "schedule" }, select: { message: true, ticket_id: true }, orderBy: { created_at: "asc" } });

beforeAll(async () => {
  for (const s of ["A", "B"]) {
    const store = await db.storeLocation.create({ data: { name: `${RUN} toko ${s}`, code: `${RUN}${s}`.slice(-12).toUpperCase() } });
    ids[s] = store.id;
  }
  await user("admin", "Administrator", null);
  await user("coord", "Technician", "A", { is_team_leader: true });
  await user("tech", "Technician", "A");
  await user("ani", "Technician", "A");
  await user("budi", "Technician", "A");
  await user("cici", "Technician", "B");
  await user("spv", "StoreSupervisor", "A");
});

afterAll(async () => {
  const users = Object.entries(ids).filter(([k]) => k !== "A" && k !== "B").map(([, v]) => v);
  await db.notification.deleteMany({ where: { user_id: { in: users } } });
  await db.activityLog.deleteMany({ where: { actor_id: { in: users } } }).catch(() => undefined);
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.storeLocation.deleteMany({ where: { id: { in: [ids.A, ids.B] } } });
});

describe("saveDayOffRuleAction", () => {
  it("lets a coordinator set a colleague's days off and replacement, and tells both", async () => {
    as("coord", "Technician");
    const res = await saveDayOffRuleAction({ technicianId: ids.ani, daysOff: ["Sun", "Sat"], replacementId: ids.budi, note: " gantian " });
    expect(res).toEqual({ success: true });

    const ani = await db.user.findUnique({ where: { id: ids.ani }, select: { work_days: true, day_off_rule: true } });
    expect(ani?.work_days).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri"]);
    expect(ani?.day_off_rule).toMatchObject({ replacement_id: ids.budi, note: "gantian", updated_by_name: `${RUN} coord` });

    expect(await notices("ani")).toEqual([{ message: `Libur tetap Anda: setiap Sabtu & Minggu. Digantikan ${RUN} budi.`, ticket_id: null }]);
    expect(await notices("budi")).toEqual([{ message: `Setiap Sabtu & Minggu Anda menggantikan ${RUN} ani.`, ticket_id: null }]);
  });

  it("tells the old replacement when it changes, and nobody when nothing changed", async () => {
    as("admin", "Administrator");
    await saveDayOffRuleAction({ technicianId: ids.ani, daysOff: ["Sat", "Sun"], replacementId: ids.coord, note: "" });
    expect((await notices("budi")).at(-1)?.message).toBe(`Anda tidak lagi menggantikan ${RUN} ani saat libur.`);

    const before = (await notices("ani")).length;
    await saveDayOffRuleAction({ technicianId: ids.ani, daysOff: ["Sat", "Sun"], replacementId: ids.coord, note: "catatan saja" });
    expect((await notices("ani")).length).toBe(before);
  });

  it("refuses a technician without the setting, a store not held, and a replacement from another store", async () => {
    as("tech", "Technician");
    expect(await saveDayOffRuleAction({ technicianId: ids.budi, daysOff: ["Sun"], replacementId: null, note: "" })).toEqual({
      error: "Kamu tidak punya akses mengatur jadwal teknisi.",
    });

    as("coord", "Technician");
    expect(await saveDayOffRuleAction({ technicianId: ids.cici, daysOff: ["Sun"], replacementId: null, note: "" })).toEqual({
      error: "Teknisi ini tidak ada di toko yang kamu pegang.",
    });
    expect(await saveDayOffRuleAction({ technicianId: ids.budi, daysOff: ["Sun"], replacementId: ids.cici, note: "" })).toEqual({
      error: "Pengganti harus teknisi aktif di toko yang sama.",
    });
    expect(await saveDayOffRuleAction({ technicianId: ids.budi, daysOff: ["Mon", "Tue", "Wed", "Thu"], replacementId: null, note: "" })).toEqual({
      error: "Maksimal 3 hari libur dalam seminggu.",
    });
  });

  it("refuses a kepala toko by default — read only until the owner ticks the setting", async () => {
    as("spv", "StoreSupervisor");
    expect(await saveDayOffRuleAction({ technicianId: ids.budi, daysOff: ["Sun"], replacementId: null, note: "" })).toEqual({
      error: "Kamu tidak punya akses mengatur jadwal teknisi.",
    });
  });
});

describe("leave and swaps follow the same setting", () => {
  it("lets the coordinator record leave in their store only, and a plain technician not at all", async () => {
    const leave = (tech: string) => {
      const fd = new FormData();
      fd.set("technician_id", ids[tech]);
      fd.set("date", "2026-11-20");
      return assignLeaveAction(fd);
    };
    as("coord", "Technician");
    expect(await leave("ani")).toEqual({ success: true });
    expect(await leave("cici")).toEqual({ error: "Teknisi ini tidak ada di toko yang kamu pegang." });
    as("tech", "Technician");
    expect(await leave("ani")).toEqual({ error: "Access Denied" });
  });

  it("takes the leave day off Ani's November target share", async () => {
    // Ani works Mon–Fri: 21 days in November 2026, one of them on leave.
    const f = (await loadLeaveFactors([ids.ani], "2026-11")).get(ids.ani);
    expect(f).toEqual({ scheduled: 21, leave: 1, factor: 20 / 21 });
  });
});
