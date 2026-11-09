import { describe, expect, it } from "vitest";
import { checkFeeCharge, CHECK_FEE_JOB_NAME } from "./check-fee";

const job = { id: "job1", name: "Diagnosa / Pengecekan", points: 0, is_active: true };

describe("checkFeeCharge", () => {
  it("is a service-fee line for the job, at the fee", () => {
    expect(checkFeeCharge("t1", 50000, job, "u1")).toEqual({
      ticket_id: "t1",
      kind: "service_fee",
      description: "Diagnosa / Pengecekan",
      quantity: 1,
      unit_price: 50000,
      service_job_id: "job1",
      job_points: 0,
      created_by_id: "u1",
    });
  });

  it("still bills the fee when the job is missing or switched off, unlinked", () => {
    for (const j of [null, { ...job, is_active: false }]) {
      expect(checkFeeCharge("t1", 50000, j, "u1")).toMatchObject({
        description: CHECK_FEE_JOB_NAME,
        unit_price: 50000,
        service_job_id: null,
        job_points: null,
      });
    }
  });

  it("is nothing without a fee", () => {
    expect(checkFeeCharge("t1", null, job, "u1")).toBeNull();
    expect(checkFeeCharge("t1", 0, job, "u1")).toBeNull();
  });
});
