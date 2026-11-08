import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let session: { userId: string; role: string; name: string } | null = null;
vi.mock("@/lib/session", () => ({ getSession: async () => session }));

// The defaults of Pengaturan Akses, with no changes saved: the real rule, no database.
let overrides = new Map<string, boolean>();
vi.mock("@/lib/access-server", async () => {
  const access = await import("@/lib/access");
  return {
    stockVisibilityFor: async () => {
      const audiences = access.audiencesOf({ role: session!.role });
      return new Set(access.STOCK_CAPABILITIES.filter((c) => access.isAllowed(c, audiences, overrides)));
    },
  };
});

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
          { id: 100, name: "GUDANG BATAM", quantity: 6, countsInTotal: true },
          { id: 450, name: "KLAIM GARANSI", quantity: 2, countsInTotal: false },
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
  overrides = new Map();
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

  it.each(["Technician", "Sales", "RMA"])("sends a %s browser no Griya or Gudang Batam stock, and a total without them", async (role) => {
    session = { userId: "u1", role, name: "X" };
    const res = await search();
    const text = await res.text();
    expect(text).not.toMatch(/griya|batam/i);
    const { items } = JSON.parse(text) as { items: { stockTotal: number; warehouses: { id: number }[] }[] };
    expect(items[0].warehouses.map((w) => w.id)).toEqual([250, 50, 400]);
    expect(items[0].stockTotal).toBe(80); // GATEWAY + GUDANG UTAMA + NAGOYAHILL
  });

  it("sends Admin every warehouse the app reads", async () => {
    session = { userId: "u1", role: "Administrator", name: "X" };
    const { items } = (await (await search()).json()) as { items: { stockTotal: number; warehouses: { id: number }[]; claimWarehouses: { id: number }[] }[] };
    expect(items[0].warehouses.map((w) => w.id)).toEqual([250, 350, 50, 400, 100]);
    expect(items[0].claimWarehouses.map((w) => w.id)).toEqual([450]);
    expect(items[0].stockTotal).toBe(80 + 88 + 6);
  });

  it("gives Griya to a group only once the owner ticks it", async () => {
    session = { userId: "u1", role: "Technician", name: "X" };
    overrides = new Map([["view_stock_griya:technician", true]]);
    const text = await (await search()).text();
    expect(text).toMatch(/GRIYA/);
    expect(text).not.toMatch(/BATAM/);
  });

  it("shows claim stock to the RMA desk only", async () => {
    session = { userId: "u1", role: "RMA", name: "X" };
    const rma = (await (await search()).json()) as { items: { claimWarehouses: { id: number }[] }[] };
    expect(rma.items[0].claimWarehouses.map((w) => w.id)).toEqual([450]);
    session = { userId: "u1", role: "Technician", name: "X" };
    const tech = (await (await search()).json()) as { items: { claimWarehouses: { id: number }[] }[] };
    expect(tech.items[0].claimWarehouses).toEqual([]);
  });

  it("keeps the token on the server", async () => {
    session = { userId: "u1", role: "Technician", name: "X" };
    const text = await (await search()).text();
    expect(text).not.toContain("hns_test");
  });
});
