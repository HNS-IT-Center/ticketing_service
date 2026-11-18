/**
 * linkQuoteToTicketAction against the local MariaDB (vitest.setup.ts refuses
 * any other), with the e-commerce API answered by a stubbed fetch. Fixtures
 * are namespaced per run and removed in afterAll.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import apiFixture from "@/lib/ecommerce/__fixtures__/quote-api-0027.json";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));

const session = { userId: "", role: "Administrator", name: "Admin Uji" };
vi.mock("@/lib/session", () => ({
  requireSession: async () => session,
  getSession: async () => session,
  requireRole: async () => session,
}));
let mayEdit = true;
vi.mock("@/lib/access-server", () => ({ accessFor: async () => ({ can: () => mayEdit }) }));

const { db } = await import("@/lib/db");
const { linkQuoteToTicketAction } = await import("./link-quote");

const RUN = `lquote_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const digits = () => String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
// 2099: a date the shop has never issued a quotation on.
const freshCode = () => `HNSPC-20990105-${digits()}`;

let answer: Record<string, unknown> = {};
const fetchMock = vi.fn(async () => new Response(JSON.stringify(answer), { status: 200 }));
const quote = (code: string) => ({ ...JSON.parse(JSON.stringify(apiFixture)), code, publicUrl: `https://shop.test/q/${code}` });

async function makeTicket(opts: { type?: "pc_build" | "service"; status?: "completed" | "cancelled"; detail?: boolean; quoteCode?: string } = {}) {
  const type = opts.type ?? "pc_build";
  return db.ticket.create({
    data: {
      ticket_code: `${RUN}_${Math.random().toString(36).slice(2, 8)}`,
      ticket_type: type,
      device_type: "PC_Gaming",
      status: opts.status ?? "completed",
      pickup_method: "self_pickup",
      ...(type === "pc_build" && opts.detail !== false
        ? { pc_build_detail: { create: { quote_code: opts.quoteCode ?? null } } }
        : {}),
      pc_components: type === "pc_build" ? { create: [{ component_name: "Ryzen 5 diketik teknisi", quantity: 1 }] } : undefined,
    },
    select: { id: true, ticket_code: true },
  });
}

const detailOf = (ticketId: string) =>
  db.ticketPcBuildDetail.findUnique({
    where: { ticket_id: ticketId },
    select: { quote_code: true, quote_public_url: true, quote_source: true, verified_at: true },
  });

beforeAll(() => {
  vi.stubGlobal("fetch", fetchMock);
  process.env.HNS_ECOMMERCE_URL = "https://shop.test";
  process.env.TICKETING_INTEGRATION_TOKEN = "tok";
});

beforeEach(() => {
  mayEdit = true;
  fetchMock.mockClear();
});

afterAll(async () => {
  vi.unstubAllGlobals();
  delete process.env.HNS_ECOMMERCE_URL;
  delete process.env.TICKETING_INTEGRATION_TOKEN;
  await db.ticket.deleteMany({ where: { ticket_code: { startsWith: RUN } } });
});

describe("linkQuoteToTicketAction", () => {
  it("records the code the e-commerce side confirms, and nothing about intake", async () => {
    const t = await makeTicket();
    const code = freshCode();
    answer = quote(code);
    expect(await linkQuoteToTicketAction(t.id, `  ${code.toLowerCase()} `)).toEqual({ ok: true, code });
    expect(await detailOf(t.id)).toEqual({ quote_code: code, quote_public_url: `https://shop.test/q/${code}`, quote_source: null, verified_at: null });
    // The components the technician typed stay as they were.
    expect((await db.ticketPcBuildComponent.findMany({ where: { ticket_id: t.id } })).map((c) => c.component_name)).toEqual(["Ryzen 5 diketik teknisi"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("creates the build header when an old ticket has none", async () => {
    const t = await makeTicket({ detail: false });
    const code = freshCode();
    answer = quote(code);
    expect(await linkQuoteToTicketAction(t.id, code)).toEqual({ ok: true, code });
    expect((await detailOf(t.id))?.quote_code).toBe(code);
  });

  it("refuses without the ticket-edit setting, before asking e-commerce", async () => {
    mayEdit = false;
    const t = await makeTicket();
    expect(await linkQuoteToTicketAction(t.id, freshCode())).toEqual({ ok: false, error: expect.stringContaining("tidak punya akses") });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a ticket that is not a PC build, or already linked", async () => {
    const service = await makeTicket({ type: "service" });
    expect(await linkQuoteToTicketAction(service.id, freshCode())).toEqual({ ok: false, error: expect.stringContaining("Rakit PC") });
    const linked = await makeTicket({ quoteCode: freshCode() });
    expect(await linkQuoteToTicketAction(linked.id, freshCode())).toEqual({ ok: false, error: expect.stringContaining("sudah tertaut") });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps one quotation on one live ticket; a cancelled one does not count", async () => {
    const code = freshCode();
    const holder = await makeTicket({ quoteCode: code });
    answer = quote(code);
    const t = await makeTicket();
    expect(await linkQuoteToTicketAction(t.id, code)).toEqual({ ok: false, error: `Quotation ${code} sudah tertaut ke tiket ${holder.ticket_code}.` });
    await db.ticket.update({ where: { id: holder.id }, data: { status: "cancelled" } });
    expect(await linkQuoteToTicketAction(t.id, code)).toEqual({ ok: true, code });
  });

  it("refuses what is not a code, and a code e-commerce does not know, without pointing at a PDF", async () => {
    const t = await makeTicket();
    expect(await linkQuoteToTicketAction(t.id, "NGW-000657")).toEqual({ ok: false, error: expect.stringContaining("Tulis kode quotation") });
    fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ error: "not_found" }), { status: 404 }));
    const res = await linkQuoteToTicketAction(t.id, freshCode());
    expect(res).toEqual({ ok: false, error: expect.stringContaining("tidak ditemukan di ecommerce") });
    fetchMock.mockImplementationOnce(async () => {
      throw new Error("offline");
    });
    const down = await linkQuoteToTicketAction(t.id, freshCode());
    expect(down).toEqual({ ok: false, error: "Web ecommerce tidak bisa dihubungi. Coba lagi sebentar." });
    expect((await detailOf(t.id))?.quote_code).toBeNull();
  });
});
