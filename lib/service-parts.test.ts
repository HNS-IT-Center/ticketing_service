import { describe, expect, it } from "vitest";
import type { ServicePart } from "@prisma/client";
import {
  SERVICE_PART_ORDER,
  describeReplacedPart,
  isServicePart,
  requiresItemName,
  servicePartLabel,
} from "./service-parts";

/** Every value the schema has. Kept by hand so the schema cannot grow unnoticed. */
const ALL: ServicePart[] = [
  "lcd",
  "battery",
  "keyboard",
  "charger",
  "ram",
  "storage",
  "motherboard",
  "fan",
  "speaker",
  "casing",
  "other",
];

describe("SERVICE_PART_ORDER", () => {
  it("covers every part the schema has, and nothing else", () => {
    expect([...SERVICE_PART_ORDER].sort()).toEqual([...ALL].sort());
  });

  it("has no duplicates", () => {
    expect(new Set(SERVICE_PART_ORDER).size).toBe(SERVICE_PART_ORDER.length);
  });

  it("puts the parts the owner named first, and `other` last", () => {
    // "ganti part apa LCD, batrai, keyboard, dan lain lain"
    expect(SERVICE_PART_ORDER.slice(0, 3)).toEqual(["lcd", "battery", "keyboard"]);
    expect(SERVICE_PART_ORDER[SERVICE_PART_ORDER.length - 1]).toBe("other");
  });
});

describe("servicePartLabel", () => {
  it("gives every part a readable Indonesian label", () => {
    for (const part of ALL) {
      const label = servicePartLabel(part);
      expect(label.length).toBeGreaterThan(0);
      // Never the raw enum name: that is how "rma process" reached a customer.
      expect(label).not.toBe(part);
    }
  });

  it("gives no two parts the same label", () => {
    const labels = ALL.map(servicePartLabel);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("isServicePart", () => {
  it("accepts the schema's values", () => {
    for (const part of ALL) expect(isServicePart(part)).toBe(true);
  });

  it("rejects anything else, so a hand-posted form cannot invent a part", () => {
    for (const bogus of ["", "LCD", "lcd ", "cpu", "baterai", "drop table"]) {
      expect(isServicePart(bogus)).toBe(false);
    }
  });
});

describe("requiresItemName", () => {
  it("demands a name only for `other`", () => {
    expect(requiresItemName("other")).toBe(true);
    for (const part of ALL.filter((p) => p !== "other")) {
      expect(requiresItemName(part)).toBe(false);
    }
  });
});

describe("describeReplacedPart", () => {
  it("joins the category with what was fitted", () => {
    expect(describeReplacedPart("battery", "ASUS C31N1915")).toBe("Baterai — ASUS C31N1915");
  });

  it("falls back to the category alone when nothing was typed", () => {
    expect(describeReplacedPart("keyboard")).toBe("Keyboard");
    expect(describeReplacedPart("keyboard", null)).toBe("Keyboard");
    expect(describeReplacedPart("keyboard", "   ")).toBe("Keyboard");
  });

  it("never shows the free text on its own — the category is what can be counted", () => {
    for (const part of ALL) {
      expect(describeReplacedPart(part, "apa saja")).toContain(servicePartLabel(part));
    }
  });
});
