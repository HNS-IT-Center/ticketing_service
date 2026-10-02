import { describe, expect, it } from "vitest";
import {
  canActOnAssignmentRequest,
  isUnrestrictedAssignmentRole,
  type AssignmentAuthority,
} from "./assignment-authority";

const admin: AssignmentAuthority = { kind: "admin" };
const coordinator: AssignmentAuthority = { kind: "coordinator", storeIds: ["ngw", "ngh"] };
const nobody: AssignmentAuthority = { kind: "none" };

describe("isUnrestrictedAssignmentRole", () => {
  it("treats Administrator and Sales as unrestricted", () => {
    expect(isUnrestrictedAssignmentRole("Administrator")).toBe(true);
    expect(isUnrestrictedAssignmentRole("Sales")).toBe(true);
  });

  it("does not treat anyone else as unrestricted", () => {
    for (const role of ["Technician", "RMA", "Customer", "", "administrator"]) {
      expect(isUnrestrictedAssignmentRole(role)).toBe(false);
    }
  });
});

describe("canActOnAssignmentRequest", () => {
  it("lets an admin act on any store, and on a ticket with no store", () => {
    expect(canActOnAssignmentRequest(admin, "ngw")).toBe(true);
    expect(canActOnAssignmentRequest(admin, "some-other-store")).toBe(true);
    expect(canActOnAssignmentRequest(admin, null)).toBe(true);
  });

  it("lets a coordinator act only on their own stores", () => {
    expect(canActOnAssignmentRequest(coordinator, "ngw")).toBe(true);
    expect(canActOnAssignmentRequest(coordinator, "ngh")).toBe(true);
  });

  it("stops a coordinator reaching into another store — the fault this fixes", () => {
    expect(canActOnAssignmentRequest(coordinator, "qct")).toBe(false);
  });

  it("keeps a storeless ticket actionable for a coordinator", () => {
    // A `TKT-` ticket belongs to no store, so no store can own it. Hiding it
    // from every coordinator would leave it unassignable.
    expect(canActOnAssignmentRequest(coordinator, null)).toBe(true);
    expect(canActOnAssignmentRequest(coordinator, undefined)).toBe(true);
  });

  it("refuses a coordinator with no store assignments any real store", () => {
    const unassigned: AssignmentAuthority = { kind: "coordinator", storeIds: [] };
    expect(canActOnAssignmentRequest(unassigned, "ngw")).toBe(false);
    expect(canActOnAssignmentRequest(unassigned, null)).toBe(true);
  });

  it("refuses everyone else outright", () => {
    expect(canActOnAssignmentRequest(nobody, "ngw")).toBe(false);
    expect(canActOnAssignmentRequest(nobody, null)).toBe(false);
  });

  it("does not match a store id by prefix or case", () => {
    expect(canActOnAssignmentRequest(coordinator, "ng")).toBe(false);
    expect(canActOnAssignmentRequest(coordinator, "ngw-2")).toBe(false);
    expect(canActOnAssignmentRequest(coordinator, "NGW")).toBe(false);
  });
});
