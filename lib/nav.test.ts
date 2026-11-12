import { describe, expect, it } from "vitest";
import type { Role } from "@prisma/client";
import { appliesTo, audiencesOf, isAllowed, ruleKey, type Capability } from "./access";
import { navFor } from "./nav";

type Who = { role: Role; is_team_leader?: boolean; is_head_technician?: boolean };

/** The sidebar a person gets, under the default settings plus any changes. */
function menu(who: Who, changes: [Capability, string, boolean][] = []) {
  const overrides = new Map(changes.map(([c, a, v]) => [ruleKey(c, a as never), v]));
  const can = (c: Capability) => isAllowed(c, audiencesOf(who), overrides);
  return navFor(who.role, can);
}
const hrefs = (who: Who, changes?: [Capability, string, boolean][]) => menu(who, changes).flatMap((s) => s.items.map((i) => i.href));

describe("navFor — the defaults keep each role's menu", () => {
  it("gives an administrator every group, starting with their dashboard", () => {
    const m = menu({ role: "Administrator" });
    expect(m[0].items[0]).toMatchObject({ href: "/admin/dashboard", label: "Dashboard" });
    expect(m.map((s) => s.key)).toEqual(["home", "tickets", "rma", "store", "finance", "performance", "log", "master", "settings"]);
    expect(hrefs({ role: "Administrator" })).toEqual(
      expect.arrayContaining(["/admin/tickets", "/admin/tickets/create", "/rma/dashboard", "/toko/dashboard", "/stok/rakitan", "/finance/klaim", "/logs", "/admin/users"]),
    );
  });

  it("gives a technician their own work and nothing of the office", () => {
    expect(hrefs({ role: "Technician" })).toEqual([
      "/technician/dashboard",
      "/technician/tickets",
      "/technician/tickets/create",
      "/technician/leaderboard",
      "/technician/schedule",
    ]);
  });

  it("gives a head technician Semua Tiket", () => {
    expect(hrefs({ role: "Technician", is_head_technician: true })).toContain("/admin/tickets");
    expect(hrefs({ role: "Technician", is_team_leader: true })).not.toContain("/admin/tickets");
  });

  it("adds the technician's Data Master pages for a head technician", () => {
    expect(hrefs({ role: "Technician", is_head_technician: true })).toEqual(
      expect.arrayContaining(["/technician/service-jobs", "/technician/vendors"]),
    );
  });

  it("gives the RMA desk its pages once, with case pages under its dashboard", () => {
    const m = menu({ role: "RMA" });
    expect(m[0].items[0]).toMatchObject({ href: "/rma/dashboard", also: ["/rma/cases"] });
    expect(hrefs({ role: "RMA" })).toEqual(["/rma/dashboard", "/rma/tickets/create", "/rma/tickets", "/rma/analisa", "/logs", "/rma/vendors"]);
  });

  it("gives the read-only roles their pages", () => {
    expect(hrefs({ role: "StockAdmin" })).toEqual(["/stok/dashboard", "/stok/rakitan", "/stok/part"]);
    expect(hrefs({ role: "Finance" })).toEqual(["/finance/dashboard", "/finance/klaim"]);
    expect(hrefs({ role: "Sales" })).toEqual(["/sales/dashboard", "/sales/tickets", "/sales/tickets/create"]);
    expect(hrefs({ role: "StoreSupervisor" })).toEqual(
      expect.arrayContaining(["/toko/dashboard", "/toko/tickets", "/toko/tindak-lanjut", "/toko/klaim", "/toko/teknisi", "/toko/jadwal", "/toko/tim"]),
    );
  });

  it("gives nobody without a portal a menu", () => {
    expect(menu({ role: "Customer" })).toEqual([]);
    expect(menu({ role: "Pending" })).toEqual([]);
  });
});

describe("navFor — Pengaturan Akses changes the menu", () => {
  it("adds a page granted to a role", () => {
    expect(hrefs({ role: "Technician" }, [["page_rma_claims", "technician", true]])).toContain("/rma/tickets");
    expect(hrefs({ role: "Finance" }, [["page_log_activity", "finance", true]])).toContain("/logs");
  });

  it("removes a page taken away", () => {
    expect(hrefs({ role: "RMA" }, [["page_rma_analysis", "rma", false]])).not.toContain("/rma/analisa");
    expect(hrefs({ role: "Technician" }, [["page_leaderboard", "technician", false]])).not.toContain("/technician/leaderboard");
  });

  it("sends someone granted the leaderboard outside the technician portal to the shared page", () => {
    expect(hrefs({ role: "RMA" }, [["page_leaderboard", "rma", true]])).toContain("/admin/leaderboard");
  });

  it("never gives a kepala toko page to another role, even when ticked", () => {
    expect(appliesTo("page_toko_dashboard", "technician")).toBe(false);
    expect(hrefs({ role: "Technician" }, [["page_toko_dashboard", "technician", true]])).not.toContain("/toko/dashboard");
    expect(isAllowed("page_toko_dashboard", ["technician"], new Map([[ruleKey("page_toko_dashboard", "technician"), true]]))).toBe(false);
  });

  it("keeps the administrator's own pages fixed", () => {
    expect(hrefs({ role: "Administrator" }, [["page_tickets_all", "administrator", false]])).toContain("/admin/tickets");
  });
});
