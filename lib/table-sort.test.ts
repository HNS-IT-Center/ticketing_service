import { describe, expect, it } from "vitest";
import { nextSort, parseSort, readSort, sortHref, sortRows } from "./table-sort";
import { sortTicketsInMemory, ticketListOrderBy, ticketProgressOptions, TICKET_SORT_KEYS } from "./ticket-list-filter";

describe("table-sort — ascending and descending on every table", () => {
  it("reads only the columns a list offers", () => {
    expect(readSort("code_asc", ["code"], { key: "updated", dir: "desc" })).toEqual({ key: "code", dir: "asc" });
    expect(readSort("price_desc", ["code"], { key: "updated", dir: "desc" })).toEqual({ key: "updated", dir: "desc" });
    expect(readSort("code", ["code"], { key: "updated", dir: "desc" })).toEqual({ key: "updated", dir: "desc" });
    expect(parseSort(undefined)).toEqual({ key: "", dir: "asc" });
  });

  it("flips the current column and starts another in its own direction", () => {
    expect(nextSort({ key: "code", dir: "asc" }, "code")).toEqual({ key: "code", dir: "desc" });
    expect(nextSort({ key: "code", dir: "desc" }, "code")).toEqual({ key: "code", dir: "asc" });
    expect(nextSort({ key: "code", dir: "asc" }, "points", "desc")).toEqual({ key: "points", dir: "desc" });
  });

  it("sorts numbers, dates and names, empty values last both ways", () => {
    const rows = [
      { n: "B-10", v: 3, d: new Date(2026, 0, 2) },
      { n: "B-9", v: null, d: null },
      { n: "a-1", v: 10, d: new Date(2026, 0, 1) },
    ];
    const by = { n: (r: (typeof rows)[number]) => r.n, v: (r: (typeof rows)[number]) => r.v, d: (r: (typeof rows)[number]) => r.d };
    expect(sortRows(rows, { key: "n", dir: "asc" }, by).map((r) => r.n)).toEqual(["a-1", "B-9", "B-10"]);
    expect(sortRows(rows, { key: "v", dir: "desc" }, by).map((r) => r.v)).toEqual([10, 3, null]);
    expect(sortRows(rows, { key: "v", dir: "asc" }, by).map((r) => r.v)).toEqual([3, 10, null]);
    expect(sortRows(rows, { key: "d", dir: "asc" }, by).map((r) => r.n)).toEqual(["a-1", "B-10", "B-9"]);
    expect(rows[0].n).toBe("B-10");
  });

  it("links to another order keeping the filters and dropping the page", () => {
    expect(sortHref("/x", { q: "asus", page: "3", sort: "code_asc" }, { key: "code", dir: "desc" })).toBe("/x?q=asus&sort=code_desc");
    expect(sortHref("/x", { q: "" }, { key: "updated", dir: "desc" }, { fallback: { key: "updated", dir: "desc" } })).toBe("/x");
    expect(sortHref("/x", { sort_brand: "total_desc" }, { key: "label", dir: "asc" }, { param: "sort_item" })).toBe(
      "/x?sort_brand=total_desc&sort_item=label_asc",
    );
  });
});

describe("ticket lists — every column, every progress", () => {
  it("orders by any offered column both ways, status in the order a ticket moves", () => {
    expect(TICKET_SORT_KEYS).toContain("technician");
    expect(ticketListOrderBy("technician_desc")).toEqual([{ technician: { name: "desc" } }, { updated_at: "desc" }]);
    expect(ticketListOrderBy("status_asc")).toEqual([{ status: "asc" }, { updated_at: "desc" }]);
    expect(ticketListOrderBy("nonsense")).toEqual({ updated_at: "desc" });
  });

  it("offers every status in the progress filter, with counts", () => {
    const options = ticketProgressOptions({ waiting: 2, done: 5 }, { unassigned: 1 });
    expect(options[0]).toEqual({ value: "", label: "Semua progres (7)" });
    expect(options.map((o) => o.value)).toEqual([
      "",
      "unassigned",
      "waiting",
      "on_progress",
      "rma_process",
      "done",
      "ready_for_pickup",
      "waiting_pickup",
      "handed_to_courier",
      "delivered",
      "completed",
      "cancelled",
      "rejected",
    ]);
    expect(options.find((o) => o.value === "delivered")?.label).toBe("Delivered (0)");
  });

  it("keeps the priority order by default, and any column on request", () => {
    const t = (code: string, status: "waiting" | "on_progress" | "done", day: number) => ({
      ticket_code: code,
      ticket_type: "service",
      status,
      updated_at: new Date(2026, 0, day),
      is_for_self: true,
      customer_name: null,
      user: { name: code },
    });
    const rows = [t("A", "done", 3), t("B", "waiting", 1), t("C", "on_progress", 2)];
    expect(sortTicketsInMemory(rows, "priority").map((r) => r.ticket_code)).toEqual(["C", "B", "A"]);
    expect(sortTicketsInMemory(rows, "code_desc").map((r) => r.ticket_code)).toEqual(["C", "B", "A"]);
    expect(sortTicketsInMemory(rows, "status_asc").map((r) => r.ticket_code)).toEqual(["B", "C", "A"]);
    expect(sortTicketsInMemory(rows, "updated_asc").map((r) => r.ticket_code)).toEqual(["B", "C", "A"]);
  });
});
