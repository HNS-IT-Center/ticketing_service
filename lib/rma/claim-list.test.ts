import { describe, expect, it } from "vitest";
import { claimListOrderBy, claimListWhere, claimSearchWhere } from "./claim-list";

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
    const where = claimListWhere("rma_process", "kafka");
    expect(where.ticket_type).toBe("warranty_claim");
    const and = where.AND as unknown[];
    expect(and).toHaveLength(3);
    expect(and[1]).toEqual({ status: "rma_process" });
  });

  it("ignores a chip it does not know instead of sending it to the database", () => {
    expect(claimListWhere("nonsense", "").AND as unknown[]).toHaveLength(1);
    expect(claimListWhere("all", "").AND as unknown[]).toHaveLength(1);
  });
});

describe("claimListOrderBy", () => {
  it("defaults to most recently updated", () => {
    expect(claimListOrderBy("")).toEqual({ updated_at: "desc" });
    expect(claimListOrderBy("code_asc")).toEqual({ ticket_code: "asc" });
  });
});
