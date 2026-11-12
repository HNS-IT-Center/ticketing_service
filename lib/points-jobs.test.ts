import { describe, it, expect } from "vitest";
import { jobPoints, ticketTotalPoints } from "./points";

describe("ticket points with Daftar Jasa", () => {
  it("adds each job's points times its quantity to the ticket type's points", () => {
    expect(jobPoints([{ job_points: 3, quantity: 1 }, { job_points: 1, quantity: 2 }, { job_points: null, quantity: 4 }])).toBe(5);
    expect(ticketTotalPoints({ ticket_type: "pc_build", charges: [{ job_points: 3, quantity: 1 }] })).toBe(7);
    expect(ticketTotalPoints({ ticket_type: "cleaning", cleaning_detail: { service_package: "Full_Repaste" } })).toBe(5);
    expect(ticketTotalPoints({ ticket_type: "service", device_type: "Other_Device", charges: [] })).toBe(3);
  });

  it("gives a warranty claim 2, whatever was ticked on it once", () => {
    expect(ticketTotalPoints({ ticket_type: "warranty_claim", device_type: "Laptop_Office" })).toBe(2);
  });
});
