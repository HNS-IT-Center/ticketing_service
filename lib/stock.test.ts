import { describe, expect, it } from "vitest";
import { buildMatches, buildStageOf } from "./stock";

describe("buildStageOf", () => {
  it("places a build by its ticket status, and leaves out those that ended without one", () => {
    expect(buildStageOf("waiting")).toBe("building");
    expect(buildStageOf("on_progress")).toBe("building");
    expect(buildStageOf("done")).toBe("finished");
    expect(buildStageOf("handed_to_courier")).toBe("finished");
    expect(buildStageOf("completed")).toBe("handed_over");
    expect(buildStageOf("cancelled")).toBeNull();
    expect(buildStageOf("rejected")).toBeNull();
  });
});

describe("buildMatches", () => {
  const row = { code: "NGH-000160", quoteCode: "QTN/2026/11/0274", customer: "Budi  Santoso" };
  it("finds a build by ticket code, quotation code or customer, ignoring case and spacing", () => {
    expect(buildMatches(row, "ngh-000160")).toBe(true);
    expect(buildMatches(row, "0274")).toBe(true);
    expect(buildMatches(row, " budi santoso ")).toBe(true);
    expect(buildMatches(row, "")).toBe(true);
    expect(buildMatches(row, "siti")).toBe(false);
    expect(buildMatches({ ...row, quoteCode: null }, "qtn")).toBe(false);
  });
});
