import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CAPABILITIES, CAPABILITY_INFO, appliesTo, audiencesOf, isAllowed } from "./access";
import {
  BACKFILL_BEGIN,
  BACKFILL_END,
  BASE_AUDIENCE,
  ROLE_BASES,
  SYSTEM_ROLES,
  accessRoleBackfillSql,
  cleanGrants,
  grantableFor,
  roleCan,
  systemRoleIdFor,
  templateFor,
} from "./access-roles";

const NONE = new Map<string, boolean>();

describe("a made role", () => {
  it("can hold only what applies to its base", () => {
    expect(cleanGrants("Technician", ["page_toko_dashboard", "edit_price", "nonsense", "edit_price"])).toEqual(["edit_price"]);
    expect(grantableFor("StoreSupervisor")).toContain("page_toko_dashboard");
    expect(grantableFor("Technician")).not.toContain("manage_users");
    expect(grantableFor("Administrator")).toEqual(expect.arrayContaining(["manage_users", "delete_ticket", "page_business_dashboard"]));
  });

  it("starts from what the built-in role had", () => {
    for (const base of ROLE_BASES) {
      const audience = BASE_AUDIENCE[base];
      expect(templateFor(base), base).toEqual(CAPABILITIES.filter((c) => appliesTo(c, audience) && isAllowed(c, [audience], NONE)));
    }
  });

  it("ignores a stored grant that no longer applies to its base", () => {
    const can = roleCan("Sales", ["print_invoice", "page_toko_dashboard"]);
    expect(can("print_invoice")).toBe(true);
    expect(can("page_toko_dashboard")).toBe(false);
  });

  it("gives an Admin role the seven checks that used to be Administrator-only code", () => {
    for (const c of ["page_business_dashboard", "page_ticket_audit", "manage_users", "manage_stores", "delete_ticket", "ticket_points", "edit_targets"] as const) {
      expect(CAPABILITY_INFO[c].defaults, c).toEqual(["administrator"]);
      expect(templateFor("Administrator"), c).toContain(c);
    }
  });
});

describe("the roles that replace the old groups", () => {
  it("send every account to the role holding its old groups", () => {
    const cases = [
      [{ role: "Administrator" }, "role_admin"],
      [{ role: "Technician" }, "role_technician"],
      [{ role: "Technician", is_team_leader: true }, "role_coordinator"],
      [{ role: "Technician", is_head_technician: true }, "role_head_technician"],
      [{ role: "Technician", is_team_leader: true, is_head_technician: true }, "role_coordinator_head"],
      [{ role: "StoreSupervisor" }, "role_store_supervisor"],
      [{ role: "Owner" }, null],
      [{ role: "Pending" }, null],
      [{ role: "Customer" }, null],
    ] as const;
    for (const [user, id] of cases) {
      expect(systemRoleIdFor(user), JSON.stringify(user)).toBe(id);
      if (!id) continue;
      const role = SYSTEM_ROLES.find((r) => r.id === id)!;
      expect(role.audiences.slice().sort()).toEqual(audiencesOf(user).slice().sort());
    }
  });

  it("keeps the migration that production ran exactly as it was", () => {
    // Applied on the VPS on 2026-11-19 with this checksum. The generator moves
    // on as capabilities are added (a new one is granted by its own
    // migration), so the file is held to its checksum, not to the generator.
    const sql = readFileSync(join(process.cwd(), "prisma/migrations/20261119090000_access_roles/migration.sql"), "utf-8").replace(/\r\n/g, "\n");
    expect(createHash("sha256").update(sql).digest("hex")).toBe("49da4a05cf359332c81d4dfae844ebc9521590412ffa768abf500b3640eeedf7");
    expect(sql).toContain(BACKFILL_BEGIN);
    expect(sql).toContain(BACKFILL_END);
    expect(accessRoleBackfillSql().startsWith(BACKFILL_BEGIN)).toBe(true);
  });
});
