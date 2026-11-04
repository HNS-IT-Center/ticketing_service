import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let session: { userId: string; role: string; name: string } | null = null;
vi.mock("@/lib/session", () => ({ getSession: async () => session }));

const findMany = vi.fn<(args: unknown) => Promise<unknown[]>>(async () => []);
vi.mock("@/lib/db", () => ({ db: { ticket: { findMany: (args: unknown) => findMany(args) } } }));

import { GET } from "./route";

afterEach(() => {
  session = null;
  findMany.mockClear();
});

const get = (qs = "") => GET(new Request(`http://localhost/rma/tickets/export${qs}`));

describe("GET /rma/tickets/export", () => {
  it("refuses everyone but the RMA desk and administrators, before reading anything", async () => {
    expect((await get()).status).toBe(403);
    for (const role of ["Technician", "Sales", "Customer", "Pending"]) {
      session = { userId: "u", role, name: "x" };
      expect((await get()).status, role).toBe(403);
    }
    expect(findMany).not.toHaveBeenCalled();
  });

  it.each(["RMA", "Administrator"])("answers %s with an .xlsx of the filtered claims", async (role) => {
    session = { userId: "u", role, name: "x" };
    const res = await get("?status=rma_process&q=tuf");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toMatch(/klaim-garansi-rma_process-\d{4}-\d{2}-\d{2}\.xlsx/);
    expect(Buffer.from(await res.arrayBuffer()).subarray(0, 2).toString()).toBe("PK");

    // The list's own filter, every page of it.
    const args = findMany.mock.calls[0][0] as { where: { ticket_type: string } };
    expect(args.where.ticket_type).toBe("warranty_claim");
    expect(JSON.stringify(args.where)).toContain("device_name");
    expect(args).not.toHaveProperty("take");
  });
});
