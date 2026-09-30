import { describe, it, expect } from "vitest";
import type { Role } from "@prisma/client";
import {
  DENIED_DESTINATION,
  PORTAL_ROUTES,
  canEnter,
  dashboardPathForRoleName,
  destinationForRole,
  destinationForRoleName,
  isRole,
  ticketHrefForPortal,
  type Portal,
  ticketsListHrefForPortal,
  ticketsListHrefForRoleName,
} from "./routes";

/**
 * Every value of the Prisma Role enum, restated here independently of the
 * implementation. If the schema gains a role, this list and the exhaustive
 * switch in routes.ts must both be updated — tsc catches the switch, this
 * catches the list.
 */
const ALL_ROLES: Role[] = ["Administrator", "Technician", "Sales", "RMA", "Customer"];

const ALL_PORTALS: Portal[] = ["admin", "technician", "sales", "rma", "customer"];

describe("destinationForRole — every role is mapped or explicitly denied", () => {
  it.each(ALL_ROLES)("resolves %s to a decision, never undefined", (role) => {
    const d = destinationForRole(role);
    expect(d).toBeDefined();
    if (d.allowed) {
      expect(d.dashboard).toMatch(/^\/[a-z]/);
      expect(d.portal).toBeTruthy();
    } else {
      expect(d.reason.trim()).not.toBe("");
    }
  });

  it("allows the four staff roles", () => {
    expect(destinationForRole("Administrator")).toMatchObject({
      allowed: true,
      dashboard: "/admin/dashboard",
      portal: "admin",
    });
    expect(destinationForRole("Technician")).toMatchObject({
      allowed: true,
      dashboard: "/technician/dashboard",
      portal: "technician",
    });
    expect(destinationForRole("Sales")).toMatchObject({
      allowed: true,
      dashboard: "/sales/dashboard",
      portal: "sales",
    });
    expect(destinationForRole("RMA")).toMatchObject({
      allowed: true,
      dashboard: "/rma/dashboard",
      portal: "rma",
    });
  });

  it("denies Customer explicitly rather than by falling through", () => {
    const d = destinationForRole("Customer");
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.reason).toContain("ticket link");
  });

  it("gives every allowed role a distinct dashboard", () => {
    const dashboards = ALL_ROLES.map((r) => destinationForRole(r))
      .filter((d) => d.allowed)
      .map((d) => (d.allowed ? d.dashboard : ""));
    expect(new Set(dashboards).size).toBe(dashboards.length);
  });
});

describe("string-keyed lookups", () => {
  it.each(ALL_ROLES)("recognises %s", (role) => {
    expect(isRole(role)).toBe(true);
  });

  it.each(["", "rma", "ADMINISTRATOR", "Root", "Technician "])("rejects %s", (value) => {
    expect(isRole(value)).toBe(false);
    expect(destinationForRoleName(value).allowed).toBe(false);
  });

  it("never points a session holder at /login", () => {
    // /login redirects an authenticated user to their dashboard, so returning
    // /login here is the exact shape of an infinite redirect loop.
    for (const role of [...ALL_ROLES, "bogus", ""]) {
      expect(dashboardPathForRoleName(role)).not.toBe("/login");
    }
  });

  it("sends denied roles to the public unauthorized page", () => {
    expect(dashboardPathForRoleName("Customer")).toBe(DENIED_DESTINATION);
    expect(dashboardPathForRoleName("bogus")).toBe(DENIED_DESTINATION);
  });
});

describe("canEnter — portal ownership", () => {
  it("lets each staff role into its own portal", () => {
    expect(canEnter("/admin/dashboard", "Administrator")).toBe(true);
    expect(canEnter("/technician/dashboard", "Technician")).toBe(true);
    expect(canEnter("/sales/dashboard", "Sales")).toBe(true);
    expect(canEnter("/rma/dashboard", "RMA")).toBe(true);
  });

  it("lets an Administrator into the RMA portal", () => {
    expect(canEnter("/rma/dashboard", "Administrator")).toBe(true);
    expect(canEnter("/rma/cases/abc", "Administrator")).toBe(true);
  });

  it("keeps every other role out of the RMA portal", () => {
    for (const role of ["Technician", "Sales", "Customer", "bogus"]) {
      expect(canEnter("/rma/dashboard", role)).toBe(false);
    }
  });

  it("keeps RMA out of the other portals", () => {
    expect(canEnter("/admin/dashboard", "RMA")).toBe(false);
    expect(canEnter("/technician/dashboard", "RMA")).toBe(false);
    expect(canEnter("/sales/dashboard", "RMA")).toBe(false);
  });

  it("leaves unowned paths open to any session", () => {
    expect(canEnter("/", "RMA")).toBe(true);
    expect(canEnter("/some/other/page", "Technician")).toBe(true);
  });

  it("covers every portal prefix an allowed role can be sent to", () => {
    // Each allowed dashboard must live under a prefix that its own role may enter.
    for (const role of ALL_ROLES) {
      const d = destinationForRole(role);
      if (!d.allowed) continue;
      expect(canEnter(d.dashboard, role), `${role} → ${d.dashboard}`).toBe(true);
    }
  });
});

describe("anti-loop invariant", () => {
  /**
   * The bug this guards against: a role whose dashboard is a route the proxy
   * would redirect it away from again. Following the redirect must reach a
   * fixed point in one hop.
   */
  it.each([...ALL_ROLES, "bogus", ""])("settles in one hop for %s", (role) => {
    const first = dashboardPathForRoleName(role);

    // a denied role lands on a public page that the proxy always lets through
    if (first === DENIED_DESTINATION) {
      expect(canEnter(first, role)).toBe(true);
      return;
    }

    expect(canEnter(first, role)).toBe(true);
    const second = dashboardPathForRoleName(role);
    expect(second).toBe(first);
  });

  it("no role's destination is a route that bounces it", () => {
    for (const role of ALL_ROLES) {
      const target = dashboardPathForRoleName(role);
      expect(canEnter(target, role), `${role} bounced from ${target}`).toBe(true);
    }
  });

  it("every portal prefix is reachable by at least one role", () => {
    for (const { prefix, allowed } of PORTAL_ROUTES) {
      expect(allowed.length, `${prefix} has no allowed role`).toBeGreaterThan(0);
      for (const role of allowed) {
        expect(canEnter(`${prefix}/anything`, role)).toBe(true);
      }
    }
  });
});

describe("ticketHrefForPortal", () => {
  it.each(ALL_PORTALS)("returns a path containing the ticket id for %s", (portal) => {
    expect(ticketHrefForPortal(portal, "tkt_123")).toContain("tkt_123");
    expect(ticketHrefForPortal(portal, "tkt_123")).toMatch(/^\//);
  });

  it("routes RMA notifications through the ticket resolver", () => {
    expect(ticketHrefForPortal("rma", "tkt_1")).toBe("/rma/tickets/tkt_1");
  });

  it("leaves the Sales link unchanged on this branch", () => {
    // Deliberately still the (broken) customer path — see fix/sales-redirect.
    expect(ticketHrefForPortal("sales", "tkt_1")).toBe("/customer/tickets/tkt_1");
  });

  it("keeps technician and admin links as they were", () => {
    expect(ticketHrefForPortal("technician", "tkt_1")).toBe("/technician/tickets/tkt_1");
    expect(ticketHrefForPortal("admin", "tkt_1")).toBe("/admin/tickets/tkt_1");
  });
});

describe("ticketsListHrefForPortal", () => {
  // The bug this replaces: createTicketAction named Sales, Administrator and
  // Technician in an if-chain and sent everyone else — RMA — to
  // `/ticket/${public_share_token}`, a route that has never existed. Creating a
  // ticket succeeded and then landed the desk on a 404.
  it.each([
    ["admin", "/admin/tickets"],
    ["technician", "/technician/tickets"],
    ["sales", "/sales/tickets"],
    ["rma", "/rma/tickets"],
    ["customer", "/customer/tickets"],
  ] as const)("%s -> %s", (portal, href) => {
    expect(ticketsListHrefForPortal(portal)).toBe(href);
  });

  it("never returns the /ticket/... route that does not exist", () => {
    const all = (["admin", "technician", "sales", "rma", "customer"] as const).map(
      ticketsListHrefForPortal,
    );
    for (const href of all) expect(href.startsWith("/ticket/")).toBe(false);
  });

  it("gives every portal a distinct destination", () => {
    const all = (["admin", "technician", "sales", "rma", "customer"] as const).map(
      ticketsListHrefForPortal,
    );
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("ticketsListHrefForRoleName", () => {
  it.each([
    ["Administrator", "/admin/tickets"],
    ["Technician", "/technician/tickets"],
    ["Sales", "/sales/tickets"],
    ["RMA", "/rma/tickets"],
  ] as const)("%s -> %s", (role, href) => {
    expect(ticketsListHrefForRoleName(role)).toBe(href);
  });

  // A role with no portal must not be handed someone else's list.
  it.each(["Customer", "Nonsense", ""])("sends %s to /unauthorized", (role) => {
    expect(ticketsListHrefForRoleName(role)).toBe("/unauthorized");
  });
});
