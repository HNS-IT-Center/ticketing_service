import { describe, expect, it } from "vitest";
import { assignableRoles, isAdminRole, mayManageAccount, mayPromoteToOwner, roleMatches } from "./admin-roles";
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

describe("only the Owner manages Owner and Administrator accounts", () => {
  it("lets the Owner do anything", () => {
    expect(mayManageAccount("Owner", null, "Owner")).toBe(true);
    expect(mayManageAccount("Owner", "Administrator", "Technician")).toBe(true);
    expect(mayManageAccount("Owner", "Owner", null)).toBe(true);
  });

  it("lets an Administrator manage everyone else", () => {
    expect(mayManageAccount("Administrator", null, "Technician")).toBe(true);
    expect(mayManageAccount("Administrator", "Pending", "Sales")).toBe(true);
    expect(mayManageAccount("Administrator", "Technician", null)).toBe(true);
  });

  it("lets an Administrator give the Owner role (owner, 2026-11-27)", () => {
    expect(mayManageAccount("Administrator", null, "Owner")).toBe(true);
    expect(mayManageAccount("Administrator", "Technician", "Owner")).toBe(true);
    expect(mayPromoteToOwner("Administrator", "Administrator", false)).toBe(true);
    expect(mayPromoteToOwner("Administrator", "Administrator", true)).toBe(false);
    expect(mayPromoteToOwner("Administrator", "Owner", false)).toBe(false);
    expect(mayPromoteToOwner("Technician", "Administrator", false)).toBe(false);
  });

  it("stops an Administrator from giving the Admin role, or changing or deactivating an admin", () => {
    expect(mayManageAccount("Administrator", null, "Administrator")).toBe(false);
    expect(mayManageAccount("Administrator", "Administrator", "Administrator")).toBe(false);
    expect(mayManageAccount("Administrator", "Owner", null)).toBe(false);
    expect(mayManageAccount("Administrator", "Administrator", null)).toBe(false);
  });

  it("refuses everyone else", () => {
    expect(mayManageAccount("Technician", null, "Technician")).toBe(false);
    expect(mayManageAccount("StoreSupervisor", "Technician", null)).toBe(false);
  });

  it("offers each person only the roles they may give", () => {
    const all = ["Owner", "Administrator", "Technician", "Sales"] as const;
    expect(assignableRoles("Owner", all)).toEqual(all);
    expect(assignableRoles("Administrator", all)).toEqual(["Owner", "Technician", "Sales"]);
  });
});
