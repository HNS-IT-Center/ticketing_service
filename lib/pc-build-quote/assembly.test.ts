import { describe, it, expect } from "vitest";
import { labourJobFor, pcBuildLabourCharges, type LabourJob } from "./assembly";

const rakit: LabourJob = { id: "j-rakit", name: "Jasa Rakit PC", points: 4, default_price: 150000, accurate_sku: "101048" };
const os: LabourJob = { id: "j-os", name: "Install Ulang OS", points: 1, default_price: 100000, accurate_sku: null };
const jobs = [rakit, os];

describe("labourJobFor", () => {
  it("finds the job by Accurate code, then by name, then any assembly line", () => {
    expect(labourJobFor({ name: "Apa Saja", sku: "101048", quantity: 1, unitPrice: null }, jobs)).toBe(rakit);
    expect(labourJobFor({ name: "install ulang os", sku: null, quantity: 1, unitPrice: null }, jobs)).toBe(os);
    expect(labourJobFor({ name: "JASA RAKIT EXPRESS", sku: null, quantity: 1, unitPrice: null }, jobs)).toBe(rakit);
    expect(labourJobFor({ name: "Jasa Kirim", sku: null, quantity: 1, unitPrice: null }, jobs)).toBeNull();
  });

  it("falls back to a job mapped to the assembly code under another name", () => {
    const renamed = { ...rakit, name: "Rakit PC" };
    expect(labourJobFor({ name: "JASA RAKIT PC", sku: null, quantity: 1, unitPrice: null }, [renamed])).toBe(renamed);
  });
});

describe("pcBuildLabourCharges", () => {
  it("bills each service line at the price it was sold for, linked to its job", () => {
    const lines = pcBuildLabourCharges("t1", [{ name: "JASA RAKIT PC", sku: "101048", quantity: 1, unitPrice: 175000 }], jobs, "u1");
    expect(lines).toEqual([
      {
        ticket_id: "t1",
        kind: "service_fee",
        description: "Jasa Rakit PC",
        quantity: 1,
        unit_price: 175000,
        service_job_id: "j-rakit",
        job_points: 4,
        created_by_id: "u1",
      },
    ]);
  });

  it("uses the job's default price when the quotation prints none (a PDF)", () => {
    const [line] = pcBuildLabourCharges("t1", [{ name: "JASA RAKIT PC", sku: null, quantity: 1, unitPrice: null }], jobs, "u1");
    expect(line).toMatchObject({ unit_price: 150000, service_job_id: "j-rakit" });
  });

  it("records the assembly on a build without a quotation, at the default price", () => {
    expect(pcBuildLabourCharges("t1", null, jobs, "u1")).toEqual([
      expect.objectContaining({ description: "Jasa Rakit PC", unit_price: 150000, service_job_id: "j-rakit", job_points: 4 }),
    ]);
  });

  it("records the job without a price when the quotation has no service line", () => {
    expect(pcBuildLabourCharges("t1", [], jobs, "u1")).toEqual([
      expect.objectContaining({ description: "Jasa Rakit PC", unit_price: null, service_job_id: "j-rakit" }),
    ]);
  });

  it("keeps an unknown service line's own name and price, earning no points", () => {
    const [line] = pcBuildLabourCharges("t1", [{ name: "Jasa Kirim", sku: null, quantity: 2, unitPrice: 20000 }], jobs, "u1");
    expect(line).toMatchObject({ description: "Jasa Kirim", quantity: 2, unit_price: 20000, service_job_id: null, job_points: null });
  });

  it("still writes a line when the Daftar Jasa has no assembly job", () => {
    expect(pcBuildLabourCharges("t1", null, [os], "u1")).toEqual([
      expect.objectContaining({ description: "Jasa Rakit PC", unit_price: null, service_job_id: null }),
    ]);
  });
});
