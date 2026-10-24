import { describe, it, expect, vi, afterEach } from "vitest";

// lib/db.ts imports "server-only", which throws outside a React Server Component.
vi.mock("server-only", () => ({}));

import { db } from "@/lib/db";
import { GET } from "./route";

const get = (query = "") => GET(new Request(`http://localhost/api/health${query}`));

afterEach(() => {
  vi.restoreAllMocks();
});

// Order matters: a spy on the Prisma client does not restore cleanly, so the
// one test that runs a real query comes first.
describe("GET /api/health", () => {
  it("checks the database when asked to — a real SELECT 1 through the adapter", async () => {
    const res = await get("?db=1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", db: "ok" });
  });

  it("answers from the process alone: a dead database does not fail it", async () => {
    vi.spyOn(db, "$queryRaw").mockRejectedValue(new Error("down"));
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("is 503 when the database is down, and says nothing about why", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(db, "$queryRaw").mockRejectedValue(
      new Error("connect ECONNREFUSED 10.0.1.7:3306 (user ticketing)"),
    );
    const res = await get("?db=1");
    expect(res.status).toBe(503);
    const body = await res.text();
    expect(JSON.parse(body)).toEqual({ status: "error", db: "unreachable" });
    expect(body).not.toMatch(/ECONNREFUSED|10\.0\.1\.7|ticketing/);
  });
});
