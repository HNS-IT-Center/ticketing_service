import { describe, expect, it } from "vitest";
import type { TicketStatus } from "@prisma/client";
import {
  AWAITING_CODE_PART_WHERE,
  isServiceReady,
  partsAwaitingCodeCount,
  SERVICE_READY_STATUSES,
  ticketsAwaitingPartCodeWhere,
} from "./part-code-alerts";

const ALL: TicketStatus[] = [
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
];

describe("isServiceReady", () => {
  it("is true from done through completed, and never while working or for an abandoned ticket", () => {
    expect(ALL.filter(isServiceReady)).toEqual([
      "done",
      "ready_for_pickup",
      "waiting_pickup",
      "handed_to_courier",
      "delivered",
      "completed",
    ]);
  });
});

describe("partsAwaitingCodeCount", () => {
  const parts = [{ sku: null }, { sku: "2503000069" }, { sku: "" }];

  it("counts parts without a code once the service is finished", () => {
    expect(partsAwaitingCodeCount({ ticket_type: "service", status: "completed", replaced_parts: parts })).toBe(2);
    expect(partsAwaitingCodeCount({ ticket_type: "service", status: "done", replaced_parts: parts })).toBe(2);
  });

  it("stays quiet while the work is going on — a code arriving later is normal then", () => {
    expect(partsAwaitingCodeCount({ ticket_type: "service", status: "on_progress", replaced_parts: parts })).toBe(0);
  });

  it("stays quiet for cancelled tickets, other ticket types, and fully coded parts", () => {
    expect(partsAwaitingCodeCount({ ticket_type: "service", status: "cancelled", replaced_parts: parts })).toBe(0);
    expect(partsAwaitingCodeCount({ ticket_type: "cleaning", status: "completed", replaced_parts: parts })).toBe(0);
    expect(
      partsAwaitingCodeCount({ ticket_type: "service", status: "completed", replaced_parts: [{ sku: "1" }] }),
    ).toBe(0);
  });
});

describe("AWAITING_CODE_PART_WHERE", () => {
  it("matches exactly the parts isAwaitingCode flags: null and empty", () => {
    expect(AWAITING_CODE_PART_WHERE).toEqual({ OR: [{ sku: null }, { sku: "" }] });
  });
});

describe("ticketsAwaitingPartCodeWhere", () => {
  it("keeps the caller's scope apart from the rule, so an OR in the scope cannot widen it", () => {
    const scope = { OR: [{ technician_id: "t1" }, { store_location_id: { in: ["s1"] } }] };
    expect(ticketsAwaitingPartCodeWhere(scope)).toEqual({
      AND: [
        scope,
        {
          ticket_type: "service",
          status: { in: [...SERVICE_READY_STATUSES] },
          replaced_parts: { some: AWAITING_CODE_PART_WHERE },
        },
      ],
    });
  });
});
