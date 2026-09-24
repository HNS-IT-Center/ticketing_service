import { describe, expect, it } from "vitest";
import type { TicketStatus, TicketType } from "@prisma/client";
import { earnsPoints, performanceEffect } from "./kpi";
import { getTicketPoints } from "./points";

const ALL_TICKET_TYPES: TicketType[] = [
  "service",
  "warranty_claim",
  "pc_build",
  "cleaning",
  "upgrade",
];

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

const NON_CLAIM_TYPES = ALL_TICKET_TYPES.filter((t) => t !== "warranty_claim");

describe("performanceEffect — ordinary tickets", () => {
  it("credits a success exactly at done", () => {
    for (const type of NON_CLAIM_TYPES) {
      expect(performanceEffect(type, "done"), type).toBe("success");
    }
  });

  it("counts a failure at cancelled and rejected", () => {
    for (const type of NON_CLAIM_TYPES) {
      expect(performanceEffect(type, "cancelled"), type).toBe("failure");
      expect(performanceEffect(type, "rejected"), type).toBe("failure");
    }
  });

  it("ignores completed, so closing a picked-up ticket cannot credit twice", () => {
    for (const type of NON_CLAIM_TYPES) {
      expect(performanceEffect(type, "completed"), type).toBe("ignore");
    }
  });

  it("ignores every step of the handover chain", () => {
    const chain = [
      "ready_for_pickup",
      "waiting_pickup",
      "handed_to_courier",
      "delivered",
      "completed",
    ] as const;
    for (const type of NON_CLAIM_TYPES) {
      for (const status of chain) {
        expect(performanceEffect(type, status), `${type}/${status}`).toBe("ignore");
      }
    }
  });

  it("ignores the statuses before any work is finished", () => {
    for (const type of NON_CLAIM_TYPES) {
      expect(performanceEffect(type, "waiting"), type).toBe("ignore");
      expect(performanceEffect(type, "on_progress"), type).toBe("ignore");
    }
  });

  it("never treats rma_process as earning for a non-claim ticket", () => {
    for (const type of NON_CLAIM_TYPES) {
      expect(performanceEffect(type, "rma_process"), type).toBe("ignore");
    }
  });
});

describe("performanceEffect — warranty claims", () => {
  it("credits the handover to RMA", () => {
    expect(performanceEffect("warranty_claim", "rma_process")).toBe("success");
  });

  it("ignores the done written when the RMA case closes", () => {
    expect(performanceEffect("warranty_claim", "done")).toBe("ignore");
  });

  it("ignores the done of a claim closed as not eligible", () => {
    // Same status as the line above — the point is that neither can credit.
    expect(performanceEffect("warranty_claim", "done")).toBe("ignore");
  });

  it("ignores the handover chain that returns the unit", () => {
    for (const status of [
      "ready_for_pickup",
      "waiting_pickup",
      "handed_to_courier",
      "delivered",
      "completed",
    ] as const) {
      expect(performanceEffect("warranty_claim", status), status).toBe("ignore");
    }
  });

  it("still counts an outright cancellation as a failure", () => {
    expect(performanceEffect("warranty_claim", "cancelled")).toBe("failure");
    expect(performanceEffect("warranty_claim", "rejected")).toBe("failure");
  });
});

describe("performanceEffect — a claim is credited exactly once", () => {
  // The full life of a claim that is handed over, repaired, and returned.
  it("credits one success across the whole journey", () => {
    const journey: TicketStatus[] = [
      "waiting",
      "on_progress",
      "rma_process",
      "done", // written by rma.ts when the case closes
      "ready_for_pickup",
      "completed",
    ];
    const successes = journey.filter(
      (s) => performanceEffect("warranty_claim", s) === "success",
    );
    expect(successes).toEqual(["rma_process"]);
  });

  it("credits nothing for a claim found ineligible", () => {
    const journey: TicketStatus[] = [
      "waiting",
      "on_progress",
      "done", // ineligible — claim_eligible = false
      "ready_for_pickup",
      "completed",
    ];
    const effects = new Set(
      journey.map((s) => performanceEffect("warranty_claim", s)),
    );
    expect(effects).toEqual(new Set(["ignore"]));
  });

  it("credits one success for an ordinary ticket across its journey", () => {
    const journey: TicketStatus[] = [
      "waiting",
      "on_progress",
      "done",
      "ready_for_pickup",
      "waiting_pickup",
      "completed",
    ];
    const successes = journey.filter(
      (s) => performanceEffect("service", s) === "success",
    );
    expect(successes).toEqual(["done"]);
  });
});

describe("performanceEffect — total coverage", () => {
  it("returns a verdict for every type/status pair", () => {
    for (const type of ALL_TICKET_TYPES) {
      for (const status of ALL_TICKET_STATUSES) {
        expect(
          ["success", "failure", "ignore"],
          `${type}/${status}`,
        ).toContain(performanceEffect(type, status));
      }
    }
  });

  it("never returns success for more than one status per type", () => {
    for (const type of ALL_TICKET_TYPES) {
      const earning = ALL_TICKET_STATUSES.filter((s) => earnsPoints(type, s));
      expect(earning.length, type).toBe(1);
    }
  });

  it("earnsPoints agrees with performanceEffect", () => {
    for (const type of ALL_TICKET_TYPES) {
      for (const status of ALL_TICKET_STATUSES) {
        expect(earnsPoints(type, status), `${type}/${status}`).toBe(
          performanceEffect(type, status) === "success",
        );
      }
    }
  });
});

describe("getTicketPoints", () => {
  it("uses the writer table for service", () => {
    expect(getTicketPoints("service", "Laptop_Gaming")).toBe(5);
    expect(getTicketPoints("service", "PC_Office")).toBe(5);
    expect(getTicketPoints("service", "Other_Device")).toBe(3);
  });

  it("uses the writer table for cleaning", () => {
    expect(getTicketPoints("cleaning", "PC_Gaming", "Full_Repaste")).toBe(5);
    expect(getTicketPoints("cleaning", "PC_Office", "Full_Repaste_CPU_GPU")).toBe(5);
    expect(getTicketPoints("cleaning", "PC_Gaming", "Deep_Clean")).toBe(3);
    expect(getTicketPoints("cleaning", "PC_Gaming", "Basic_Cleaning")).toBe(3);
    expect(getTicketPoints("cleaning", "PC_Gaming", null)).toBe(3);
  });

  it("scores pc_build at 4 regardless of device", () => {
    for (const device of ["PC_Gaming", "Laptop_Office", null]) {
      expect(getTicketPoints("pc_build", device), String(device)).toBe(4);
    }
  });

  it("scores warranty claims and upgrades at 2", () => {
    expect(getTicketPoints("warranty_claim", "Laptop_Gaming")).toBe(2);
    expect(getTicketPoints("upgrade", "PC_Gaming")).toBe(2);
  });

  it("does not depend on the cleaning package for non-cleaning types", () => {
    expect(getTicketPoints("service", "PC_Gaming", "Full_Repaste")).toBe(5);
    expect(getTicketPoints("pc_build", "PC_Gaming", "Full_Repaste")).toBe(4);
  });

  it("gives every ticket type a positive score", () => {
    for (const type of ALL_TICKET_TYPES) {
      expect(getTicketPoints(type, "PC_Gaming"), type).toBeGreaterThan(0);
    }
  });
});
