import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fixture from "./__fixtures__/quote-api-0027.json";

vi.mock("server-only", () => ({}));
const { fetchEcommerceQuote, isEcommerceConfigured } = await import("./quotes");

const fetchMock = vi.fn();
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
  process.env.HNS_ECOMMERCE_URL = "https://shop.test/";
  process.env.TICKETING_INTEGRATION_TOKEN = "tok-123";
  fetchMock.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.HNS_ECOMMERCE_URL;
  delete process.env.TICKETING_INTEGRATION_TOKEN;
});

describe("fetchEcommerceQuote", () => {
  it("asks the agreed path with both token headers, uncached, and reads the body", async () => {
    fetchMock.mockResolvedValue(reply(200, fixture));
    const r = await fetchEcommerceQuote({ by: "code", code: "HNSPC-20261104-0027" });
    expect(r).toMatchObject({ ok: true, quote: { code: "HNSPC-20261104-0027", revision: 3 } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://shop.test/api/integrations/ticketing/pc-build-quotes/HNSPC-20261104-0027");
    expect(init.headers).toMatchObject({ Authorization: "Bearer tok-123", "X-Ticketing-Token": "tok-123" });
    expect(init.cache).toBe("no-store");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("asks by token for a pasted link", async () => {
    fetchMock.mockResolvedValue(reply(200, fixture));
    await fetchEcommerceQuote({ by: "token", token: "Ab3dEf6hIj9kLm" });
    expect(fetchMock.mock.calls[0][0]).toBe("https://shop.test/api/integrations/ticketing/pc-build-quotes/by-token/Ab3dEf6hIj9kLm");
  });

  it("turns every failure into a sentence, never a throw", async () => {
    const cases: [() => Promise<Response>, RegExp][] = [
      [async () => reply(404, { error: "not_found" }), /HNSPC-1 tidak ditemukan/],
      [async () => reply(400, { error: "invalid_code" }), /tidak valid/],
      [async () => reply(401, { error: "unauthorized" }), /belum tersambung/],
      [async () => reply(503, { error: "not_configured" }), /belum tersambung/],
      [async () => reply(500, {}), /sedang bermasalah/],
      [async () => reply(200, { code: "HNSPC-1" }), /tidak dikenali/],
      [async () => new Response("<html>", { status: 200 }), /tidak dikenali/],
      [async () => Promise.reject(new DOMException("timed out", "TimeoutError")), /tidak bisa dihubungi/],
    ];
    for (const [answer, message] of cases) {
      fetchMock.mockImplementationOnce(answer);
      const r = await fetchEcommerceQuote({ by: "code", code: "HNSPC-1" });
      expect(r).toEqual({ ok: false, error: expect.stringMatching(message) });
    }
  });

  it("is off, and calls nothing, without both settings", async () => {
    delete process.env.TICKETING_INTEGRATION_TOKEN;
    expect(isEcommerceConfigured()).toBe(false);
    expect(await fetchEcommerceQuote({ by: "code", code: "HNSPC-1" })).toEqual({ ok: false, error: expect.stringMatching(/belum diaktifkan/) });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
