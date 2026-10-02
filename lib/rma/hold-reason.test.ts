import { describe, expect, it } from "vitest";
import type { RmaHoldReason } from "@prisma/client";
import {
  RMA_HOLD_REASONS,
  RMA_HOLD_REASON_ORDER,
  holdReasonAsksTechnician,
  holdReasonRequiresNote,
  holdRequestSentence,
  isRmaHoldReason,
} from "./hold-reason";

const ALL: RmaHoldReason[] = [
  "missing_damage_video",
  "missing_damage_photo",
  "missing_purchase_invoice",
  "other",
];

describe("RMA_HOLD_REASONS", () => {
  it("covers every reason the schema has, and nothing else", () => {
    expect(Object.keys(RMA_HOLD_REASONS).sort()).toEqual([...ALL].sort());
  });

  it("offers all of them to the desk, with 'other' last", () => {
    expect([...RMA_HOLD_REASON_ORDER].sort()).toEqual([...ALL].sort());
    expect(RMA_HOLD_REASON_ORDER.at(-1)).toBe("other");
  });

  it("gives every reason a non-empty label", () => {
    for (const code of ALL) expect(RMA_HOLD_REASONS[code].label.trim()).not.toBe("");
  });
});

describe("holdReasonAsksTechnician", () => {
  it("asks for the three things only the technician can supply", () => {
    expect(holdReasonAsksTechnician("missing_damage_video")).toBe(true);
    expect(holdReasonAsksTechnician("missing_damage_photo")).toBe(true);
    expect(holdReasonAsksTechnician("missing_purchase_invoice")).toBe(true);
  });

  it("asks nobody for 'other' — no automatic request could resolve it", () => {
    expect(holdReasonAsksTechnician("other")).toBe(false);
  });

  it("asks nobody when there is no code at all", () => {
    expect(holdReasonAsksTechnician(null)).toBe(false);
    expect(holdReasonAsksTechnician(undefined)).toBe(false);
  });

  it("gives an upload accept to exactly the reasons that ask for something", () => {
    for (const code of ALL) {
      const meta = RMA_HOLD_REASONS[code];
      expect(meta.accept === null).toBe(meta.asksTechnicianFor === null);
    }
  });
});

describe("holdReasonRequiresNote", () => {
  it("requires the desk to type only for 'other'", () => {
    expect(holdReasonRequiresNote("other")).toBe(true);
    for (const code of ALL.filter((c) => c !== "other")) {
      expect(holdReasonRequiresNote(code)).toBe(false);
    }
  });

  it("is the mirror of asking the technician — one or the other, never both", () => {
    for (const code of ALL) {
      expect(holdReasonRequiresNote(code)).toBe(!holdReasonAsksTechnician(code));
    }
  });
});

describe("holdRequestSentence", () => {
  it("names the thing being asked for", () => {
    expect(holdRequestSentence("missing_damage_video")).toContain("video");
    expect(holdRequestSentence("missing_purchase_invoice")).toContain("nota pembelian");
  });

  it("points 'other' at an administrator instead of asking for a file", () => {
    expect(holdRequestSentence("other")).toContain("administrator");
  });
});

describe("isRmaHoldReason", () => {
  it("accepts every real code", () => {
    for (const code of ALL) expect(isRmaHoldReason(code)).toBe(true);
  });

  it("rejects anything else arriving from a form", () => {
    for (const junk of ["", "OTHER", "missing_video", "toString", "constructor"]) {
      expect(isRmaHoldReason(junk)).toBe(false);
    }
  });
});
