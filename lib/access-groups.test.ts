import { describe, expect, it } from "vitest";
import { AUDIENCES, CAPABILITIES, appliesTo, ruleKey } from "./access";
import { accessGroupsFor, accessSummary, AUDIENCE_HINTS } from "./access-groups";

describe("Role & Izin — one card per role, settings in boxes", () => {
  it("lists every setting that can apply to a role exactly once", () => {
    for (const a of AUDIENCES) {
      const listed = accessGroupsFor(a).flatMap((g) => g.items.map((i) => i.capability));
      expect(new Set(listed).size).toBe(listed.length);
      expect(listed.sort()).toEqual(CAPABILITIES.filter((c) => appliesTo(c, a)).sort());
      expect(AUDIENCE_HINTS[a]).toBeTruthy();
    }
  });

  it("puts pages in boxes by menu group, without the group in the label", () => {
    const groups = accessGroupsFor("technician");
    expect(groups[0].title).toBe("Halaman · Tiket");
    expect(groups[0].items.map((i) => i.label)).toContain("Semua Tiket");
    expect(groups.some((g) => g.title === "Halaman · Toko")).toBe(false);
    expect(accessGroupsFor("store_supervisor").some((g) => g.title === "Halaman · Toko")).toBe(true);
    expect(groups.map((g) => g.title)).toContain("Stok Gudang");
  });

  it("counts what a role holds out of what can apply to it", () => {
    const none = new Map<string, boolean>();
    const plain = accessSummary("sales", none);
    expect(plain.allowed).toBeGreaterThan(0);
    expect(plain.allowed).toBeLessThan(plain.total);
    const more = accessSummary("sales", new Map([[ruleKey("page_rma_claims", "sales"), true]]));
    expect(more.allowed).toBe(plain.allowed + 1);
    expect(accessSummary("administrator", none).allowed).toBe(accessSummary("administrator", none).total);
  });
});
