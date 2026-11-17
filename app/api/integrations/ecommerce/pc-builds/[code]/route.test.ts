/**
 * GET /api/integrations/ecommerce/pc-builds/{code} against the local MariaDB
 * (vitest.setup.ts refuses any other). Fixtures are namespaced per run and
 * removed in afterAll.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const { db } = await import("@/lib/db");
const { GET } = await import("./route");

const RUN = `bphoto_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const TOKEN = "test-integration-token";
const R2 = "https://files.test/";
const digits = () => String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
// A code no real quotation has: 2099 is not a date the shop has issued.
const QUOTE = `HNSPC-20990101-${digits()}`;
const CANCELLED_ONLY = `HNSPC-20990102-${digits()}`;

let userId: string;
const savedToken = process.env.TICKETING_INTEGRATION_TOKEN;

function call(code: string, token: string | null = TOKEN) {
  const headers = new Headers(token === null ? {} : { authorization: `Bearer ${token}` });
  const req = new Request(`http://local/api/integrations/ecommerce/pc-builds/${encodeURIComponent(code)}`, { headers });
  return GET(req as unknown as NextRequest, { params: Promise.resolve({ code }) });
}

async function makeBuild(quoteCode: string, status: "on_progress" | "done" | "cancelled") {
  const t = await db.ticket.create({
    data: {
      ticket_code: `${RUN}_${Math.random().toString(36).slice(2, 8)}`,
      ticket_type: "pc_build",
      device_type: "PC_Gaming",
      status,
      technician_id: userId,
      pickup_method: "self_pickup",
      customer_name: "Rahasia Pelanggan",
      customer_phone: "+628111111111",
      pc_build_detail: { create: { quote_code: quoteCode, first_build_url: null } },
    },
    select: { id: true, ticket_code: true },
  });
  return t;
}

beforeAll(async () => {
  process.env.TICKETING_INTEGRATION_TOKEN = TOKEN;
  userId = (
    await db.user.create({
      data: { name: `${RUN} tech`, email: `${RUN}.tech@test.local`, phone_number: "+628100000031", address: "Test", role: "Technician", password: "x" },
      select: { id: true },
    })
  ).id;

  const live = await makeBuild(QUOTE, "done");
  await db.ticketAttachment.createMany({
    data: [
      { ticket_id: live.id, file_url: `${R2}quotation_${live.ticket_code}.pdf`, file_type: "pdf", kind: "quotation" },
      { ticket_id: live.id, file_url: `${R2}comp-a.jpg`, file_type: "image", kind: "build_photo" },
      { ticket_id: live.id, file_url: `${R2}comp-b.png`, file_type: "image", kind: "build_photo" },
      { ticket_id: live.id, file_url: `${R2}work-proof_${live.ticket_code}_a.jpg`, file_type: "image", kind: null },
      { ticket_id: live.id, file_url: `${R2}pickup-proof_${live.ticket_code}_a.jpg`, file_type: "image", kind: null },
    ],
  });
  await db.ticketStatusLog.create({ data: { ticket_id: live.id, old_status: "on_progress", new_status: "done", changed_by: userId } });

  // An older ticket from the same quotation, cancelled: never the answer.
  await makeBuild(QUOTE, "cancelled");
  await makeBuild(CANCELLED_ONLY, "cancelled");
});

afterEach(() => {
  process.env.TICKETING_INTEGRATION_TOKEN = TOKEN;
});

afterAll(async () => {
  await db.ticket.deleteMany({ where: { ticket_code: { startsWith: RUN } } });
  await db.user.deleteMany({ where: { email: { startsWith: RUN } } });
  if (savedToken === undefined) delete process.env.TICKETING_INTEGRATION_TOKEN;
  else process.env.TICKETING_INTEGRATION_TOKEN = savedToken;
});

describe("pc-build photos for the e-commerce cashier", () => {
  it("answers with the live build's photos, finished build first", async () => {
    const res = await call(QUOTE);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body.quoteCode).toBe(QUOTE);
    expect(body.ticket).toMatchObject({ status: "done", stage: "finished", stageLabel: "Selesai, belum diserahkan" });
    expect(body.ticket.finishedAt).toEqual(expect.any(String));
    expect(body.photos.map((p: { group: string }) => p.group)).toEqual(["work_proof", "components", "components"]);
    expect(body.photos[0].fileName).toBe(`${body.ticket.code} - bukti selesai.jpg`);
    expect(body.photos[2].fileName).toBe(`${body.ticket.code} - komponen masuk 2.png`);
  });

  it("carries nothing about the customer, and no handover or quotation file", async () => {
    const text = await (await call(QUOTE)).text();
    expect(text).not.toContain("Rahasia");
    expect(text).not.toContain("628111111111");
    expect(text).not.toContain("pickup-proof");
    expect(text).not.toContain("quotation_");
  });

  it("takes the code in any case", async () => {
    expect((await call(QUOTE.toLowerCase())).status).toBe(200);
  });

  it("refuses without the shared token, and says so when none is set here", async () => {
    expect((await call(QUOTE, null)).status).toBe(401);
    expect((await call(QUOTE, "wrong")).status).toBe(401);
    process.env.TICKETING_INTEGRATION_TOKEN = "";
    expect((await call(QUOTE)).status).toBe(503);
  });

  it("refuses what is not a quotation code, and a quotation with no live ticket", async () => {
    expect((await call("NGW-000123")).status).toBe(400);
    expect((await call(`${QUOTE}x`)).status).toBe(400);
    expect((await call(CANCELLED_ONLY)).status).toBe(404);
    expect((await call(`HNSPC-20990103-${digits()}`)).status).toBe(404);
  });
});
