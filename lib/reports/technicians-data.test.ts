/**
 * Which month a service ticket's work belongs to, against the local database:
 * the month it FIRST reached `done`, credited to the technician holding it.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { db } = await import("@/lib/db");
const { loadTargetData } = await import("./technicians-data");
const { summarizeTargets } = await import("./technicians");

const RUN = `tgt${Date.now().toString(36)}`;
const ids: Record<string, string> = {};
// A month no real data touches, so the counts are exactly the fixtures'.
const MONTH = "2031-03";
const IN_MONTH = new Date("2031-03-10T05:00:00Z");
const BEFORE = new Date("2031-02-20T05:00:00Z");
// 23:30 WIB on 31 March: still March in Batam (16:30 UTC).
const LAST_EVENING_WIB = new Date("2031-03-31T16:30:00Z");
const NEXT_MONTH = new Date("2031-04-02T05:00:00Z");

async function ticket(key: string, opts: { tech?: string; store?: string; type?: "service" | "cleaning"; done: Date[] }) {
  const t = await db.ticket.create({
    data: {
      ticket_code: `${RUN}-${key}`,
      ticket_type: opts.type ?? "service",
      device_type: "Laptop_Office",
      status: "done",
      technician_id: opts.tech === undefined ? ids.budi : opts.tech,
      store_location_id: ids[opts.store ?? "storeA"],
    },
    select: { id: true },
  });
  ids[key] = t.id;
  for (const at of opts.done) {
    await db.ticketStatusLog.create({
      data: { ticket_id: t.id, old_status: "on_progress", new_status: "done", changed_by: ids.budi, created_at: at },
    });
  }
  await db.ticketCharge.create({
    data: {
      ticket_id: t.id,
      kind: "service_fee",
      description: `${RUN} Ganti LCD`,
      quantity: 1,
      unit_price: 150000,
      service_job_id: ids.job,
      job_points: 2,
      created_by_id: ids.budi,
    },
  });
}

beforeAll(async () => {
  for (const key of ["storeA", "storeB"]) {
    ids[key] = (await db.storeLocation.create({ data: { name: `${RUN} ${key}`, code: `${RUN}${key}` }, select: { id: true } })).id;
  }
  for (const [key, active] of [["budi", true], ["siti", true], ["gone", false]] as const) {
    ids[key] = (
      await db.user.create({
        data: { name: `${RUN} ${key}`, email: `${RUN}.${key}@qc.local`, phone_number: "-", address: "-", role: "Technician", password: "x", is_active: active },
        select: { id: true },
      })
    ).id;
  }
  await db.technicianStoreAssignment.create({ data: { technician_id: ids.siti, store_id: ids.storeB } });
  ids.job = (await db.serviceJob.create({ data: { name: `${RUN} Ganti LCD`, points: 2 }, select: { id: true } })).id;

  await ticket("plain", { done: [IN_MONTH] });
  await ticket("lastEvening", { done: [LAST_EVENING_WIB] });
  await ticket("doneTwice", { done: [BEFORE, IN_MONTH] }); // first finished in February
  await ticket("nextMonth", { done: [NEXT_MONTH] });
  await ticket("cleaning", { type: "cleaning", done: [IN_MONTH] });
  await ticket("nobody", { tech: null as unknown as string, done: [IN_MONTH] });
  await ticket("byGone", { tech: ids.gone, done: [IN_MONTH] });
  await ticket("atStoreB", { tech: ids.siti, store: "storeB", done: [IN_MONTH] });
});

afterAll(async () => {
  await db.ticket.deleteMany({ where: { ticket_code: { startsWith: RUN } } });
  await db.serviceJob.deleteMany({ where: { name: { startsWith: RUN } } });
  await db.technicianStoreAssignment.deleteMany({ where: { technician_id: { in: [ids.budi, ids.siti, ids.gone] } } });
  await db.user.deleteMany({ where: { email: { startsWith: RUN } } });
  await db.storeLocation.deleteMany({ where: { name: { startsWith: RUN } } });
  await db.$disconnect();
});

const mine = (ticketIds: string[]) => ticketIds.filter((id) => Object.values(ids).includes(id));

describe("loadTargetData", () => {
  it("counts a service ticket in the month it first reached done, by WIB", async () => {
    const data = (await loadTargetData(MONTH, null))!;
    const got = mine(data.doneTickets.map((t) => t.ticketId)).sort();
    expect(got).toEqual([ids.plain, ids.lastEvening, ids.byGone, ids.atStoreB].sort());
  });

  it("leaves out the ticket finished again, the next month's, other types, and tickets with nobody on them", async () => {
    const data = (await loadTargetData(MONTH, null))!;
    const got = data.doneTickets.map((t) => t.ticketId);
    for (const key of ["doneTwice", "nextMonth", "cleaning", "nobody"]) expect(got).not.toContain(ids[key]);
    expect(mine((await loadTargetData("2031-02", null))!.doneTickets.map((t) => t.ticketId))).toEqual([ids.doneTwice]);
  });

  it("credits a deactivated technician's work to them, and lists them only because of it", async () => {
    const data = (await loadTargetData(MONTH, null))!;
    expect(data.technicians.map((t) => t.id)).toContain(ids.gone);
    const quiet = (await loadTargetData("2031-05", null))!;
    expect(quiet.technicians.map((t) => t.id)).not.toContain(ids.gone);
    expect(quiet.technicians.map((t) => t.id)).toContain(ids.budi);
  });

  it("narrows to one store: its tickets, and its technicians shown even with no work", async () => {
    const data = (await loadTargetData(MONTH, ids.storeB))!;
    expect(mine(data.doneTickets.map((t) => t.ticketId))).toEqual([ids.atStoreB]);
    const s = summarizeTargets(data.technicians, data.doneTickets, data.lines);
    expect(s.rows.find((r) => r.technician.id === ids.siti)).toMatchObject({ tickets: 1, jobs: 1, points: 2, revenue: 150000 });
    expect(data.technicians.map((t) => t.id)).not.toContain(ids.budi);
  });

  it("refuses a malformed month", async () => {
    expect(await loadTargetData("2031-13", null)).toBeNull();
  });
});
