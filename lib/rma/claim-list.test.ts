import { describe, expect, it } from "vitest";
import { claimListOrderBy, claimListWhere, claimOwnerWhere, claimSearchWhere, claimStatusLabel, claimStatusOf, readClaimOwner } from "./claim-list";

describe("claimSearchWhere", () => {
  it("reaches the unit as well as the code and the customer", () => {
    const fields = JSON.stringify(claimSearchWhere("  TUF FA506 "));
    for (const f of ["ticket_code", "customer_name", "device_name", "device_sku", "device_sn", "rma_code", "vendor_name"]) {
      expect(fields, f).toContain(f);
    }
    // Trimmed before it reaches the database.
    expect(fields).toContain('"contains":"TUF FA506"');
  });

  it("is nothing for an empty box", () => {
    expect(claimSearchWhere("   ")).toBeNull();
  });
});

describe("claimListWhere", () => {
  it("keeps the desk's scope, the chip and the search as separate AND terms", () => {
    const where = claimListWhere("on_hold", "kafka");
    expect(where.ticket_type).toBe("warranty_claim");
    const and = where.AND as unknown[];
    expect(and).toHaveLength(3);
    expect(and[1]).toEqual({ rma_case: { is: { status: "on_hold" } } });
  });

  it("ignores a chip it does not know instead of sending it to the database", () => {
    expect(claimListWhere("nonsense", "").AND as unknown[]).toHaveLength(1);
    expect(claimListWhere("all", "").AND as unknown[]).toHaveLength(1);
  });
});

describe("ownership filter (Klaim User / Klaim Toko)", () => {
  it("reads the case first and falls back to the intake", () => {
    const store = JSON.stringify(claimOwnerWhere("store_stock"));
    expect(store).toContain('"rma_case":{"is":{"unit_ownership":"store_stock"}}');
    expect(store).toContain('"rma_case":{"is":null},"warranty_detail":{"is":{"unit_ownership":"store_stock"}}');
  });

  it("counts a claim with no recorded ownership and no case as the customer's", () => {
    const user = JSON.stringify(claimOwnerWhere("customer"));
    expect(user).toContain('{"warranty_detail":{"is":null}}');
    expect(user).toContain('{"warranty_detail":{"is":{"unit_ownership":null}}}');
    expect(user).not.toContain("store_stock");
  });

  it("adds one AND term, and nothing for all or an unknown value", () => {
    expect(claimListWhere("all", "", "store_stock").AND as unknown[]).toHaveLength(2);
    expect(claimListWhere("all", "", readClaimOwner("nonsense")).AND as unknown[]).toHaveLength(1);
    expect(readClaimOwner(null)).toBe("all");
    expect(readClaimOwner("customer")).toBe("customer");
  });
});

describe("status filter follows the RMA stage", () => {
  it("filters a stage on the case, and a claim not handed over by having none", () => {
    expect((claimListWhere("in_vendor_process", "").AND as unknown[])[1]).toEqual({ rma_case: { is: { status: "in_vendor_process" } } });
    expect((claimListWhere("not_handed", "").AND as unknown[])[1]).toEqual({ rma_case: { is: null } });
  });

  it("ignores the technician's ticket statuses the old filter used", () => {
    for (const old of ["waiting", "on_progress", "rma_process", "done", "completed"]) {
      expect(claimListWhere(old, "").AND as unknown[], old).toHaveLength(1);
    }
  });

  it("labels each option as the Status column does", () => {
    expect(claimStatusLabel("on_hold")).toBe("Ditahan");
    expect(claimStatusLabel("not_handed")).toBe("Belum diserahkan ke RMA");
    expect(claimStatusOf(null)).toBe("not_handed");
    expect(claimStatusOf("closed")).toBe("closed");
  });
});

describe("claimListOrderBy", () => {
  it("defaults to most recently updated", () => {
    expect(claimListOrderBy("")).toEqual({ updated_at: "desc" });
    expect(claimListOrderBy("code_asc")).toEqual({ ticket_code: "asc" });
  });
});
