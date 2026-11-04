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

const get = (qs = "") => GET(new Request(`http://localhost/admin/tickets/export${qs}`));

describe("GET /admin/tickets/export", () => {
  it("refuses anyone who is not an administrator, before reading tickets", async () => {
    expect((await get()).status).toBe(403);
    for (const role of ["Sales", "Technician", "RMA", "Customer", "Pending"]) {
      session = { userId: "u", role, name: "x" };
      expect((await get()).status, role).toBe(403);
    }
    expect(findMany).not.toHaveBeenCalled();
  });

  it("answers an administrator with an .xlsx of the filtered list", async () => {
    session = { userId: "a", role: "Administrator", name: "Admin" };
    const res = await get("?status=done&q=NGW&sort=code_asc");

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(res.headers.get("Content-Disposition")).toMatch(/^attachment; filename="tiket-hns-done-\d{4}-\d{2}-\d{2}\.xlsx"$/);
    expect(Buffer.from(await res.arrayBuffer()).subarray(0, 2).toString()).toBe("PK");

    // Same filter as the list, and no page size: every matching ticket.
    const args = findMany.mock.calls[0][0] as Record<string, unknown>;
    expect(args.where).toEqual({
      status: "done",
      OR: [
        { ticket_code: { contains: "NGW" } },
        { user: { name: { contains: "NGW" } } },
        { customer_name: { contains: "NGW" } },
      ],
    });
    expect(args.orderBy).toEqual({ ticket_code: "asc" });
    expect(args).not.toHaveProperty("take");
  });
});
