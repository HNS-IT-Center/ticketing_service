import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/session", () => ({}));
vi.mock("@/lib/access-server", () => ({}));
vi.mock("@/lib/store-dashboard-server", () => ({ storesFor: async () => [] }));

const { inScope, scopedStoreIds, storeWhere } = await import("./store-scope-server");

const gateway = { id: "ngw", name: "Nagoya Gateway" };
const hill = { id: "ngh", name: "Nagoya Hill" };
const kepalaToko = { stores: [gateway], ids: ["ngw"] };
const everyone = { stores: [gateway, hill], ids: null };

describe("store scope on shared pages (a kepala toko granted Rakitan PC, Part Keluar)", () => {
  it("limits a kepala toko to their stores, and ignores a store outside them", () => {
    expect(scopedStoreIds(kepalaToko, null)).toEqual(["ngw"]);
    expect(scopedStoreIds(kepalaToko, "ngw")).toEqual(["ngw"]);
    expect(scopedStoreIds(kepalaToko, "ngh")).toEqual(["ngw"]);
  });

  it("leaves everyone else on every store unless they pick one", () => {
    expect(scopedStoreIds(everyone, null)).toBeUndefined();
    expect(scopedStoreIds(everyone, "ngh")).toEqual(["ngh"]);
  });

  it("refuses another store's ticket to a kepala toko only", () => {
    expect(inScope(kepalaToko, "ngh")).toBe(false);
    expect(inScope(kepalaToko, "ngw")).toBe(true);
    expect(inScope(kepalaToko, null)).toBe(false);
    expect(inScope(everyone, "ngh")).toBe(true);
  });

  it("filters ticket lists (Semua Tiket, Tiket Klaim, export) to a kepala toko's stores", () => {
    expect(storeWhere(kepalaToko)).toEqual({ store_location_id: { in: ["ngw"] } });
    expect(storeWhere(everyone)).toEqual({});
  });
});
