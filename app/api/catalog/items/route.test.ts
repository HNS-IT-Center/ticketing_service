import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let session: { userId: string; role: string; name: string } | null = null;
vi.mock("@/lib/session", () => ({ getSession: async () => session }));

import { GET } from "./route";

// What data.hnsitcenter.id answers for a client given every warehouse — the
// "Ticketing HNS" client as configured on 2026-10-26. The real client module
// and toCatalogItem run; only the network is stubbed.
const apiBody = {
  data: [
    {
      id: 7311,
      sku: "2503000069",
      name: "NEW BACKPACK LENOVO BP210 15.6 GREY",
      type: "INVENTORY",
      unit: "PCS",
      category: { id: 210, name: "AKSESSORIES" },
      brand: null,
      manageSerialNumber: false,
      stock: {
        total: 169,
        warehouses: [
          { id: 250, name: "GATEWAY", quantity: 24, countsInTotal: true },
          { id: 350, name: "GRIYA", quantity: 88, countsInTotal: true },
          { id: 50, name: "GUDANG UTAMA", quantity: 29, countsInTotal: true },
          { id: 150, name: "INVENTARIS NAGOYA GATEWAY", quantity: 1, countsInTotal: true },
          { id: 400, name: "NAGOYAHILL", quantity: 27, countsInTotal: true },
        ],
      },
    },
  ],
};

const fetchMock = vi.fn(async () => Response.json(apiBody));
// The client caches by path for a minute, so every test searches its own word.
let n = 0;
const search = () => GET(new Request(`http://localhost/api/catalog/items?q=lenovo${++n}`));

beforeEach(() => {
  vi.stubEnv("HNS_API_URL", "https://data.example.test/api/v1");
  vi.stubEnv("HNS_API_TOKEN", "hns_test");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  session = null;
});

describe("GET /api/catalog/items", () => {
  it("refuses a request with no session, without asking the data API", async () => {
    const res = await search();
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["Customer", "Pending"])("refuses a %s session", async (role) => {
    session = { userId: "u1", role, name: "X" };
    const res = await search();
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["Administrator", "Technician", "Sales", "RMA"])("answers a %s session", async (role) => {
    session = { userId: "u1", role, name: "X" };
    const res = await search();
    expect(res.status).toBe(200);
  });

  it("sends the browser no Griya stock, and a total without it", async () => {
    session = { userId: "u1", role: "Technician", name: "X" };
    const res = await search();
    const text = await res.text();
    expect(text).not.toMatch(/griya/i);
    const { items } = JSON.parse(text) as { items: { stockTotal: number; warehouses: { id: number }[] }[] };
    expect(items[0].warehouses.map((w) => w.id)).toEqual([250, 50, 400]);
    expect(items[0].stockTotal).toBe(169 - 88 - 1); // less GRIYA and INVENTARIS
  });

  it("keeps the token on the server", async () => {
    session = { userId: "u1", role: "Technician", name: "X" };
    const text = await (await search()).text();
    expect(text).not.toContain("hns_test");
  });
});
