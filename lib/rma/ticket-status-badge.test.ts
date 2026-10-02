import { describe, expect, it } from "vitest";
import type { RmaStatus, TicketStatus } from "@prisma/client";
import { ticketBadgeChoice } from "./ticket-status-badge";

const RMA_STATUSES: RmaStatus[] = [
  "pending_verification", "on_hold", "verified", "submitted_to_vendor",
  "in_vendor_process", "vendor_decided", "unit_received", "closed",
  "ineligible", "cancelled",
];

const TICKET_STATUSES: TicketStatus[] = [
  "waiting", "on_progress", "rma_process", "done", "ready_for_pickup",
  "waiting_pickup", "handed_to_courier", "delivered", "completed",
  "cancelled", "rejected",
];

describe("ticketBadgeChoice", () => {
  it("shows the case status while the ticket is parked at rma_process", () => {
    for (const rma of RMA_STATUSES) {
      expect(ticketBadgeChoice("rma_process", rma)).toEqual({ kind: "rma", status: rma });
    }
  });

  it("shows the ticket status everywhere else, even when a case exists", () => {
    // A closed case must not leave a list row reading "Selesai" from the RMA
    // side while the unit is still waiting on the counter.
    for (const status of TICKET_STATUSES.filter((s) => s !== "rma_process")) {
      expect(ticketBadgeChoice(status, "closed")).toEqual({ kind: "ticket", status });
      expect(ticketBadgeChoice(status, "ineligible")).toEqual({ kind: "ticket", status });
    }
  });

  it("falls back to the ticket badge when a claim at rma_process has no case", () => {
    expect(ticketBadgeChoice("rma_process", null)).toEqual({ kind: "ticket", status: "rma_process" });
    expect(ticketBadgeChoice("rma_process", undefined)).toEqual({ kind: "ticket", status: "rma_process" });
  });

  it("never returns an rma choice for a ticket with no case", () => {
    for (const status of TICKET_STATUSES) {
      expect(ticketBadgeChoice(status, null).kind).toBe("ticket");
    }
  });
});
