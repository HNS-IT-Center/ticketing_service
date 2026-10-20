/**
 * Setting monthly targets, through the real action and the local database.
 * The fixtures use a month far ahead, so real targets in the local database
 * are neither read nor touched.
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
const { saveTargetAction } = await import("./targets");
const { targetFor, defaultTarget } = await import("@/lib/reports/targets");
const { loadTargetRows } = await import("@/lib/reports/targets-data");

const RUN = `tgs${Date.now().toString(36)}`;
const ids: Record<string, string> = {};
// Months far ahead: a default the local database already holds is older, so
// from M1 on the rows this file writes are the ones in force, and they are
// removed afterwards.
const M1 = "2041-01";
const M2 = "2041-03";

const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.set(k, v);
  return fd;
};

beforeAll(async () => {
  for (const [key, role] of [["admin", "Administrator"], ["tech", "Technician"], ["sales", "Sales"]] as const) {
    ids[key] = (
      await db.user.create({
        data: { name: `${RUN} ${key}`, email: `${RUN}.${key}@qc.local`, phone_number: "-", address: "-", role, password: "x" },
        select: { id: true },
      })
    ).id;
  }
  session.userId = ids.admin;
});

afterAll(async () => {
  await db.technicianTarget.deleteMany({ where: { effective_month: { in: [M1, M2] } } });
  await db.technicianTarget.deleteMany({ where: { scope: ids.tech } });
  await db.user.deleteMany({ where: { email: { startsWith: RUN } } });
  await db.$disconnect();
});

describe("saveTargetAction", () => {
  it("sets the default from a month; a later change leaves the earlier month as it was", async () => {
    expect(await saveTargetAction(form({ scope: "default", month: M1, jobs: "30", revenue: "Rp 4.000.000", points: "40" }))).toEqual({
      success: true,
    });
    expect(await saveTargetAction(form({ scope: "default", month: M2, jobs: "35", revenue: "", points: "45" }))).toEqual({ success: true });
    const rows = await loadTargetRows(M2);
    expect(defaultTarget(rows, M1)).toMatchObject({ jobs: 30, revenue: 4000000, points: 40, since: M1 });
    expect(defaultTarget(rows, "2041-02")).toMatchObject({ jobs: 30, since: M1 });
    expect(defaultTarget(rows, M2)).toMatchObject({ jobs: 35, revenue: null, points: 45, since: M2 });
  });

  it("saving the same month again replaces it rather than adding a second row", async () => {
    await saveTargetAction(form({ scope: "default", month: M1, jobs: "32" }));
    expect(await db.technicianTarget.count({ where: { scope: "default", effective_month: M1 } })).toBe(1);
    expect((await db.technicianTarget.findFirstOrThrow({ where: { scope: "default", effective_month: M1 } })).jobs).toBe(32);
  });

  it("gives a technician their own target, and can send them back to the default", async () => {
    await saveTargetAction(form({ scope: ids.tech, month: M1, jobs: "10", points: "12" }));
    let rows = await loadTargetRows(M2);
    expect(targetFor(rows, ids.tech, M1)).toMatchObject({ jobs: 10, points: 12, source: "custom" });
    expect(await saveTargetAction(form({ scope: ids.tech, month: M2, use_default: "1", jobs: "999" }))).toEqual({ success: true });
    rows = await loadTargetRows(M2);
    expect(targetFor(rows, ids.tech, M2)).toMatchObject({ jobs: 35, source: "default" });
    expect(targetFor(rows, ids.tech, M1)).toMatchObject({ jobs: 10, source: "custom" });
  });

  it("refuses a scope that is not a technician, a malformed month, and bad numbers", async () => {
    expect(await saveTargetAction(form({ scope: ids.sales, month: M1, jobs: "1" }))).toMatchObject({ error: expect.stringContaining("Teknisi") });
    expect(await saveTargetAction(form({ scope: "nope", month: M1, jobs: "1" }))).toMatchObject({ error: expect.stringContaining("Teknisi") });
    expect(await saveTargetAction(form({ scope: "default", month: "2041-13", jobs: "1" }))).toMatchObject({ error: expect.stringContaining("Bulan") });
    expect(await saveTargetAction(form({ scope: "default", month: M1, jobs: "-1" }))).toMatchObject({ error: expect.stringContaining("jasa") });
  });

  it("is the administrator's alone", async () => {
    session.userId = ids.tech;
    session.role = "Technician";
    try {
      await expect(saveTargetAction(form({ scope: "default", month: M1, jobs: "1" }))).rejects.toThrow();
    } finally {
      session.userId = ids.admin;
      session.role = "Administrator";
    }
  });
});
