import { describe, expect, it } from "vitest";
import type { RmaDecision, RmaStatus, TicketStatus } from "@prisma/client";
import {
  PUBLIC_STATUS_LABELS,
  getPublicClaimOutcome,
  publicStatusLabel,
} from "./public-status";

// Every value of the enum, so a status added to schema.prisma without a label
// fails here instead of leaking "rma process" onto the public page.
const ALL_TICKET_STATUSES: TicketStatus[] = [
  "waiting",
  "on_progress",
  "done",
  "ready_for_pickup",
  "waiting_pickup",
  "handed_to_courier",
  "delivered",
  "completed",
  "cancelled",
  "rejected",
  "rma_process",
];

const ALL_RMA_STATUSES: RmaStatus[] = [
  "pending_verification",
  "on_hold",
  "verified",
  "submitted_to_vendor",
  "in_vendor_process",
  "vendor_decided",
  "unit_received",
  "closed",
  "cancelled",
];

const ALL_DECISIONS: RmaDecision[] = [
  "repaired",
  "replaced",
  "refund",
  "rejected",
];

/** A claim that has been handed to the RMA desk and is still there. */
function inRma(overrides: Partial<Parameters<typeof getPublicClaimOutcome>[0]> = {}) {
  return getPublicClaimOutcome({
    ticketType: "warranty_claim",
    ticketStatus: "rma_process",
    claimEligible: true,
    ineligibilityReason: null,
    rmaStatus: "pending_verification",
    rmaDecision: null,
    ...overrides,
  });
}

/** A claim whose case is closed and whose ticket is back in the handover chain. */
function closedClaim(
  overrides: Partial<Parameters<typeof getPublicClaimOutcome>[0]> = {},
) {
  return getPublicClaimOutcome({
    ticketType: "warranty_claim",
    ticketStatus: "completed",
    claimEligible: true,
    ineligibilityReason: null,
    rmaStatus: "closed",
    rmaDecision: "repaired",
    ...overrides,
  });
}

describe("PUBLIC_STATUS_LABELS", () => {
  it("labels every TicketStatus", () => {
    for (const status of ALL_TICKET_STATUSES) {
      expect(PUBLIC_STATUS_LABELS[status], status).toBeTruthy();
    }
  });

  it("never leaks a raw enum name", () => {
    for (const status of ALL_TICKET_STATUSES) {
      expect(PUBLIC_STATUS_LABELS[status]).not.toContain("_");
    }
  });

  it("gives rma_process customer-facing wording", () => {
    expect(PUBLIC_STATUS_LABELS.rma_process).toBe("Proses Klaim Garansi");
  });

  it("falls back readably for an unknown status", () => {
    expect(publicStatusLabel("some_new_status")).toBe("some new status");
  });

  it("uses the map when the status is known", () => {
    expect(publicStatusLabel("rma_process")).toBe("Proses Klaim Garansi");
  });
});

describe("getPublicClaimOutcome — non-claim tickets", () => {
  it("returns nothing for every other ticket type", () => {
    for (const ticketType of ["service", "pc_build", "cleaning", "upgrade"] as const) {
      expect(
        getPublicClaimOutcome({
          ticketType,
          ticketStatus: "completed",
          claimEligible: true,
          ineligibilityReason: null,
          rmaStatus: null,
          rmaDecision: null,
        }),
        ticketType,
      ).toBeNull();
    }
  });
});

describe("getPublicClaimOutcome — not eligible", () => {
  it("says so and carries the technician's reason", () => {
    const outcome = closedClaim({
      claimEligible: false,
      ineligibilityReason: "Kerusakan akibat cairan, di luar cakupan garansi",
      rmaStatus: null,
      rmaDecision: null,
      ticketStatus: "done",
    });

    expect(outcome).toEqual({
      tone: "warning",
      headline: "Klaim tidak memenuhi syarat garansi",
      detail: "Kerusakan akibat cairan, di luar cakupan garansi",
    });
  });

  it("omits the detail line when the reason is blank", () => {
    expect(
      closedClaim({
        claimEligible: false,
        ineligibilityReason: "   ",
        rmaStatus: null,
        rmaDecision: null,
      })?.detail,
    ).toBeUndefined();
  });

  it("outranks a decision left over from an earlier case", () => {
    expect(
      closedClaim({ claimEligible: false, rmaDecision: "repaired" })?.headline,
    ).toBe("Klaim tidak memenuhi syarat garansi");
  });
});

describe("getPublicClaimOutcome — still in RMA", () => {
  it("has wording for every RMA status", () => {
    for (const rmaStatus of ALL_RMA_STATUSES) {
      const outcome = inRma({ rmaStatus });
      expect(outcome?.tone, rmaStatus).toBe("progress");
      expect(outcome?.headline, rmaStatus).toBeTruthy();
    }
  });

  it("groups verification stages under one customer-facing line", () => {
    for (const rmaStatus of ["pending_verification", "on_hold", "verified"] as const) {
      expect(inRma({ rmaStatus })?.headline, rmaStatus).toBe(
        "Klaim sedang diverifikasi",
      );
    }
  });

  it("groups the vendor stages", () => {
    for (const rmaStatus of ["submitted_to_vendor", "in_vendor_process"] as const) {
      expect(inRma({ rmaStatus })?.headline, rmaStatus).toBe(
        "Klaim sedang diproses vendor",
      );
    }
  });

  it("announces a decision once the vendor has ruled", () => {
    for (const rmaStatus of ["vendor_decided", "unit_received"] as const) {
      expect(inRma({ rmaStatus })?.headline, rmaStatus).toBe(
        "Keputusan vendor sudah keluar",
      );
    }
  });

  it("does not reveal which decision while the unit is still out", () => {
    const outcome = inRma({ rmaStatus: "vendor_decided", rmaDecision: "rejected" });
    expect(outcome?.headline).toBe("Keputusan vendor sudah keluar");
    expect(outcome?.tone).toBe("progress");
  });

  it("still says something when the case row is missing", () => {
    expect(inRma({ rmaStatus: null })).toEqual({
      tone: "progress",
      headline: "Klaim sedang diproses",
    });
  });
});

describe("getPublicClaimOutcome — finished claims", () => {
  it("distinguishes all four vendor decisions", () => {
    const headlines = ALL_DECISIONS.map(
      (rmaDecision) => closedClaim({ rmaDecision })!.headline,
    );
    expect(headlines).toEqual([
      "Unit diperbaiki oleh vendor",
      "Unit diganti oleh vendor",
      "Dana dikembalikan",
      "Klaim ditolak vendor",
    ]);
    expect(new Set(headlines).size).toBe(4);
  });

  it("marks a vendor rejection as a warning, not a success", () => {
    expect(closedClaim({ rmaDecision: "rejected" })?.tone).toBe("warning");
  });

  it("marks the three favourable decisions as successes", () => {
    for (const rmaDecision of ["repaired", "replaced", "refund"] as const) {
      expect(closedClaim({ rmaDecision })?.tone, rmaDecision).toBe("success");
    }
  });

  it("reports a cancelled case as stopped, not as a rejection", () => {
    expect(
      closedClaim({ rmaStatus: "cancelled", rmaDecision: null, ticketStatus: "done" }),
    ).toEqual({ tone: "neutral", headline: "Proses klaim dihentikan" });
  });

  it("stays silent for a claim that has not been examined yet", () => {
    for (const ticketStatus of ["waiting", "on_progress"] as const) {
      expect(
        closedClaim({ ticketStatus, rmaStatus: null, rmaDecision: null }),
        ticketStatus,
      ).toBeNull();
    }
  });
});

describe("getPublicClaimOutcome — the three endings are never confusable", () => {
  // All three finish `done` → `completed`; the banner is the only thing that
  // tells them apart, so their headlines must differ.
  it("produces three distinct headlines for the same ticket status", () => {
    const ineligible = closedClaim({
      claimEligible: false,
      ineligibilityReason: "Segel rusak",
      rmaStatus: null,
      rmaDecision: null,
    })!;
    const rejected = closedClaim({ rmaDecision: "rejected" })!;
    const succeeded = closedClaim({ rmaDecision: "replaced" })!;

    expect(
      new Set([ineligible.headline, rejected.headline, succeeded.headline]).size,
    ).toBe(3);
    expect(new Set([ineligible.tone, rejected.tone, succeeded.tone]).size).toBe(2);
  });
});
