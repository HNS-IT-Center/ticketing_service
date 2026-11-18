/**
 * GET /api/integrations/ecommerce/pc-builds?codes=… against the local MariaDB
 * (vitest.setup.ts refuses any other). Fixtures are namespaced per run and
 * removed in afterAll.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const { db } = await import("@/lib/db");
const { GET } = await import("./route");

const RUN = `bstatus_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const TOKEN = "test-integration-token";
const digits = () => String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
// Codes no real quotation has: 2099 is not a date the shop has issued.
const BUILDING = `HNSPC-20990111-${digits()}`;
const FINISHED = `HNSPC-20990112-${digits()}`;
const CANCELLED = `HNSPC-20990113-${digits()}`;
const NEVER = `HNSPC-20990114-${digits()}`;

let userId: string;
const savedToken = process.env.TICKETING_INTEGRATION_TOKEN;

function call(codes: string | null, token: string | null = TOKEN) {
  const headers = new Headers(token === null ? {} : { authorization: `Bearer ${token}` });
  const qs = codes === null ? "" : `?codes=${encodeURIComponent(codes)}`;
  return GET(new NextRequest(`http://local/api/integrations/ecommerce/pc-builds${qs}`, { headers }));
}

async function makeBuild(quoteCode: string, status: "on_progress" | "done" | "cancelled") {
  return db.ticket.create({
    data: {
      ticket_code: `${RUN}_${Math.random().toString(36).slice(2, 8)}`,
      ticket_type: "pc_build",
      device_type: "PC_Gaming",
      status,
      technician_id: userId,
      pickup_method: "self_pickup",
      customer_name: "Rahasia Pelanggan",
      customer_phone: "+628111111111",
      pc_build_detail: { create: { quote_code: quoteCode } },
    },
    select: { id: true, ticket_code: true },
  });
}

let building: { ticket_code: string };
let finished: { id: string; ticket_code: string };

beforeAll(async () => {
  process.env.TICKETING_INTEGRATION_TOKEN = TOKEN;
  userId = (
    await db.user.create({
      data: { name: `${RUN} tech`, email: `${RUN}.tech@test.local`, phone_number: "+628100000032", address: "Test", role: "Technician", password: "x" },
      select: { id: true },
    })
  ).id;
  building = await makeBuild(BUILDING, "on_progress");
  finished = await makeBuild(FINISHED, "done");
  await db.ticketStatusLog.create({ data: { ticket_id: finished.id, old_status: "on_progress", new_status: "done", changed_by: userId } });
  await makeBuild(CANCELLED, "cancelled");
});

afterEach(() => {
  process.env.TICKETING_INTEGRATION_TOKEN = TOKEN;
});

afterAll(async () => {
  await db.ticket.deleteMany({ where: { ticket_code: { startsWith: RUN } } });
  await db.user.deleteMany({ where: { id: userId } });
  if (savedToken === undefined) delete process.env.TICKETING_INTEGRATION_TOKEN;
  else process.env.TICKETING_INTEGRATION_TOKEN = savedToken;
});

describe("GET /api/integrations/ecommerce/pc-builds?codes=", () => {
  it("answers only the quotations with a live build, any case, without customer data", async () => {
    const res = await call(`${BUILDING.toLowerCase()}, ${FINISHED},${CANCELLED},${NEVER},${FINISHED}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(Object.keys(body.builds).sort()).toEqual([BUILDING, FINISHED].sort());
    expect(body.builds[BUILDING]).toMatchObject({ ticketCode: building.ticket_code, status: "on_progress", stage: "building", finishedAt: null });
    expect(body.builds[FINISHED]).toMatchObject({ ticketCode: finished.ticket_code, status: "done", stage: "finished" });
    expect(body.builds[FINISHED].finishedAt).toEqual(expect.any(String));
    expect(JSON.stringify(body)).not.toMatch(/Rahasia|62811/);
  });

  it("refuses without the token, and says so when none is set here", async () => {
    expect((await call(BUILDING, null)).status).toBe(401);
    expect((await call(BUILDING, "wrong")).status).toBe(401);
    delete process.env.TICKETING_INTEGRATION_TOKEN;
    expect((await call(BUILDING)).status).toBe(503);
  });

  it("refuses no codes, too many, and anything that is not a quotation code", async () => {
    expect((await call(null)).status).toBe(400);
    expect((await call(" , ")).status).toBe(400);
    expect((await call(`${BUILDING},NGW-000657`)).status).toBe(400);
    const many = Array.from({ length: 101 }, (_, i) => `HNSPC-20990115-${String(i).padStart(4, "0")}`).join(",");
    expect((await call(many)).status).toBe(400);
  });
});
