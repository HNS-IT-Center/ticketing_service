/**
 * Routing matrix for proxy.ts.
 *
 * The proxy is exercised for real — only `decrypt` is mocked, so the session
 * cookie can be swapped per case without signing JWTs.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Role } from "@prisma/client";

vi.mock("server-only", () => ({}));

// lib/session pulls in next/headers, which needs a request context.
const currentSession: { value: { userId: string; role: string; name: string } | null } = {
  value: null,
};
vi.mock("@/lib/session", () => ({
  decrypt: async (cookie?: string) => (cookie ? currentSession.value : null),
}));

const { proxy } = await import("./proxy");
const { NextRequest } = await import("next/server");
const { DENIED_DESTINATION, dashboardPathForRoleName } = await import("./lib/routes");

const ALL_ROLES: Role[] = ["Administrator", "Technician", "Sales", "RMA", "Customer"];

function request(pathname: string, loggedIn: boolean) {
  const req = new NextRequest(new URL(pathname, "http://localhost:3000"));
  if (loggedIn) req.cookies.set("session", "fake-cookie");
  return req;
}

/** Runs the proxy and reports either "next" or the path it redirected to. */
async function visit(pathname: string, role: string | null) {
  currentSession.value = role ? { userId: "u1", role, name: "Test" } : null;
  const res = await proxy(request(pathname, role !== null));
  const location = res.headers.get("location");
  if (!location) return { kind: "next" as const };
  return { kind: "redirect" as const, to: new URL(location).pathname };
}

beforeEach(() => {
  currentSession.value = null;
});

describe("public routes", () => {
  it.each(["/ticket/2026-01-01/NGW-000001", "/unauthorized"])(
    "%s is served with no session",
    async (path) => {
      expect(await visit(path, null)).toEqual({ kind: "next" });
    }
  );

  it.each(["/ticket/abc", "/unauthorized"])("%s is served WITH a session too", async (path) => {
    expect(await visit(path, "RMA")).toEqual({ kind: "next" });
  });

  it("passes API routes straight through", async () => {
    expect(await visit("/api/notifications", null)).toEqual({ kind: "next" });
  });
});

describe("/unauthorized is exempt from every guard", () => {
  const PATHS = ["/unauthorized", "/unauthorized/", "/unauthorized?from=%2Fadmin"];

  // It is the redirect target for a denied role. If any guard touched it, that
  // role would bounce between the guard and this page forever.
  it.each([...ALL_ROLES, "bogus", ""])("serves it for role %s", async (role) => {
    for (const path of PATHS) {
      expect(await visit(path, role), `${role} on ${path}`).toEqual({ kind: "next" });
    }
  });

  it("serves it with no session at all", async () => {
    for (const path of PATHS) {
      expect(await visit(path, null)).toEqual({ kind: "next" });
    }
  });

  it("serves it even though /admin would be refused for the same session", async () => {
    // Same session, two paths: the guard fires on one and not the other.
    expect((await visit("/admin/dashboard", "RMA")).kind).toBe("redirect");
    expect(await visit("/unauthorized", "RMA")).toEqual({ kind: "next" });
  });

  it("is where a denied role is sent, and it terminates there", async () => {
    const landing = await visit("/login", "Customer");
    expect(landing).toEqual({ kind: "redirect", to: DENIED_DESTINATION });
    // following that redirect must settle, not bounce
    expect(await visit(DENIED_DESTINATION, "Customer")).toEqual({ kind: "next" });
  });
});

describe("unauthenticated access", () => {
  it.each(["/admin/dashboard", "/technician/dashboard", "/sales/dashboard", "/rma/dashboard", "/"])(
    "sends %s to /login",
    async (path) => {
      expect(await visit(path, null)).toEqual({ kind: "redirect", to: "/login" });
    }
  );

  it("serves /login itself", async () => {
    expect(await visit("/login", null)).toEqual({ kind: "next" });
  });
});

describe("role × route matrix", () => {
  const PORTALS = [
    { path: "/admin/dashboard", allowed: ["Administrator"] },
    { path: "/technician/dashboard", allowed: ["Technician"] },
    { path: "/sales/dashboard", allowed: ["Sales"] },
    { path: "/rma/dashboard", allowed: ["RMA", "Administrator"] },
    { path: "/rma/cases/abc123", allowed: ["RMA", "Administrator"] },
  ];

  for (const portal of PORTALS) {
    for (const role of ALL_ROLES) {
      const shouldPass = portal.allowed.includes(role);
      it(`${role} ${shouldPass ? "enters" : "is redirected from"} ${portal.path}`, async () => {
        const result = await visit(portal.path, role);
        if (shouldPass) {
          expect(result).toEqual({ kind: "next" });
        } else {
          expect(result.kind).toBe("redirect");
          if (result.kind === "redirect") {
            expect(result.to).toBe(dashboardPathForRoleName(role));
          }
        }
      });
    }
  }
});

describe("RMA portal specifically", () => {
  it("lets the RMA role in", async () => {
    expect(await visit("/rma/dashboard", "RMA")).toEqual({ kind: "next" });
    expect(await visit("/rma/cases/x", "RMA")).toEqual({ kind: "next" });
    expect(await visit("/rma/tickets/x", "RMA")).toEqual({ kind: "next" });
  });

  it("lets an Administrator in", async () => {
    expect(await visit("/rma/dashboard", "Administrator")).toEqual({ kind: "next" });
  });

  it.each(["Technician", "Sales", "Customer"])("keeps %s out", async (role) => {
    const result = await visit("/rma/dashboard", role);
    expect(result.kind).toBe("redirect");
  });
});

describe("authenticated users on /login", () => {
  it.each(["Administrator", "Technician", "Sales", "RMA"])(
    "%s is sent to their own dashboard",
    async (role) => {
      const result = await visit("/login", role);
      expect(result).toEqual({ kind: "redirect", to: dashboardPathForRoleName(role) });
    }
  );

  it("sends a Customer session to the unauthorized page, not back to /login", async () => {
    const result = await visit("/login", "Customer");
    expect(result).toEqual({ kind: "redirect", to: DENIED_DESTINATION });
  });
});

describe("anti-loop invariant", () => {
  /**
   * Follow the proxy's own redirects. Any role that never settles is the
   * ERR_TOO_MANY_REDIRECTS bug — which is what `default: "/login"` used to
   * produce for a role with no dashboard mapping.
   */
  it.each([...ALL_ROLES, "bogus"])("settles within three hops from /login for %s", async (role) => {
    let path = "/login";
    const seen: string[] = [];

    for (let hop = 0; hop < 3; hop++) {
      if (seen.includes(path)) {
        throw new Error(`redirect loop for ${role}: ${[...seen, path].join(" → ")}`);
      }
      seen.push(path);
      const result = await visit(path, role);
      if (result.kind === "next") return; // settled
      path = result.to;
    }

    throw new Error(`${role} never settled: ${seen.join(" → ")}`);
  });

  it.each([...ALL_ROLES, "bogus"])("settles when landing on the root path for %s", async (role) => {
    let path = "/";
    const seen: string[] = [];

    for (let hop = 0; hop < 3; hop++) {
      if (seen.includes(path)) {
        throw new Error(`redirect loop for ${role}: ${[...seen, path].join(" → ")}`);
      }
      seen.push(path);
      const result = await visit(path, role);
      if (result.kind === "next") return;
      path = result.to;
    }

    throw new Error(`${role} never settled: ${seen.join(" → ")}`);
  });

  it("never redirects a session holder to /login", async () => {
    for (const role of [...ALL_ROLES, "bogus"]) {
      for (const path of ["/login", "/admin/dashboard", "/rma/dashboard", "/technician/dashboard"]) {
        const result = await visit(path, role);
        if (result.kind === "redirect") {
          expect(result.to, `${role} on ${path}`).not.toBe("/login");
        }
      }
    }
  });
});
