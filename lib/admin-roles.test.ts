import { describe, expect, it } from "vitest";
import { assignableRoles, isAdminRole, mayManageAccount, mayRunOwnerTools, roleMatches } from "./admin-roles";
import { AUDIENCES, CAPABILITIES, CAPABILITY_INFO, audienceAllowed, audiencesOf, isAllowed, ruleKey } from "./access";
import { destinationForRole } from "./routes";

const NONE = new Map<string, boolean>();

describe("Owner passes wherever an Administrator does", () => {
  it("matches an Administrator-only check, not the reverse", () => {
    expect(roleMatches("Owner", ["Administrator"])).toBe(true);
    expect(roleMatches("Owner", ["Sales", "Administrator"])).toBe(true);
    expect(roleMatches("Administrator", ["Owner"])).toBe(false);
    expect(roleMatches("Owner", ["Sales"])).toBe(false);
    expect(roleMatches("Sales", ["Sales"])).toBe(true);
  });

  it("is an admin role and lands on the admin dashboard", () => {
    expect(isAdminRole("Owner")).toBe(true);
    expect(isAdminRole("Administrator")).toBe(true);
    expect(isAdminRole("StoreSupervisor")).toBe(false);
    expect(destinationForRole("Owner")).toEqual(destinationForRole("Administrator"));
  });
});

describe("Pengaturan Akses: the Owner always may, an Administrator follows the settings", () => {
  it("every capability defaults to allowed for Administrator, so nothing moved", () => {
    for (const c of CAPABILITIES) {
      expect(CAPABILITY_INFO[c].defaults, c).toContain("administrator");
      expect(audienceAllowed(c, "administrator", NONE), c).toBe(true);
    }
  });

  it("an Administrator can be narrowed, the Owner cannot", () => {
    const narrowed = new Map([
      [ruleKey("view_cost", "administrator"), false],
      [ruleKey("view_cost", "owner"), false],
    ]);
    expect(isAllowed("view_cost", audiencesOf({ role: "Administrator" }), narrowed)).toBe(false);
    expect(isAllowed("view_cost", audiencesOf({ role: "Owner" }), narrowed)).toBe(true);
    for (const c of CAPABILITIES) expect(audienceAllowed(c, "owner", narrowed), c).toBe(true);
  });

  it("the Owner is a group of its own", () => {
    expect(AUDIENCES).toContain("owner");
    expect(audiencesOf({ role: "Owner" })).toEqual(["owner"]);
  });
});

describe("Owner and Administrator manage every account alike (owner, 2026-11-27)", () => {
  it("lets either create, change or deactivate any account, Owner and Admin ones included", () => {
    for (const actor of ["Owner", "Administrator"]) {
      expect(mayManageAccount(actor, null, "Owner")).toBe(true);
      expect(mayManageAccount(actor, null, "Administrator")).toBe(true);
      expect(mayManageAccount(actor, "Owner", "Administrator")).toBe(true);
      expect(mayManageAccount(actor, "Owner", null)).toBe(true);
      expect(mayManageAccount(actor, "Technician", "Sales")).toBe(true);
      expect(mayRunOwnerTools(actor)).toBe(true);
    }
  });

  it("refuses everyone else", () => {
    expect(mayManageAccount("Technician", null, "Technician")).toBe(false);
    expect(mayManageAccount("StoreSupervisor", "Technician", null)).toBe(false);
    expect(mayRunOwnerTools("RMA")).toBe(false);
  });

  it("offers either of them every role", () => {
    const all = ["Owner", "Administrator", "Technician", "Sales"] as const;
    expect(assignableRoles("Owner", all)).toEqual(all);
    expect(assignableRoles("Administrator", all)).toEqual(all);
    expect(assignableRoles("Technician", all)).toEqual([]);
  });
});
