import { describe, it, expect } from "vitest";
import type { DeviceType } from "@prisma/client";
import { countByBrand, deviceBrand, DEVICE_TYPE_LABELS } from "./device";

describe("deviceBrand", () => {
  it("takes the first word", () => {
    expect(deviceBrand("ASUS ROG G15")).toBe("ASUS");
    expect(deviceBrand("Lenovo Legion 5")).toBe("Lenovo");
  });

  it("copes with sloppy spacing", () => {
    expect(deviceBrand("   MSI   Katana GF66 ")).toBe("MSI");
  });

  it("returns empty for nothing usable", () => {
    expect(deviceBrand("")).toBe("");
    expect(deviceBrand("   ")).toBe("");
    expect(deviceBrand(null)).toBe("");
    expect(deviceBrand(undefined)).toBe("");
  });

  it("handles a one-word name", () => {
    expect(deviceBrand("Printer")).toBe("Printer");
  });
});

describe("countByBrand", () => {
  it("groups the real data the way the dashboard shows it", () => {
    // Exactly the device names in the live database.
    const names = [
      "ASUS ROG G15",
      "ASUS ROG G15",
      "Lenovo Legion 5",
      "MSI Katana GF66",
      "Acer Nitro V15",
      "Dell G15",
      "ASUS ROG",
      "HP Victus 16",
      "Asus TUF A15",
    ];

    expect(countByBrand(names)).toEqual([
      // Three different spellings and two different models, one manufacturer.
      { name: "ASUS", count: 4 },
      { name: "Acer", count: 1 },
      { name: "Dell", count: 1 },
      { name: "HP", count: 1 },
      { name: "Lenovo", count: 1 },
      { name: "MSI", count: 1 },
    ]);
  });

  it("labels a group with its most common spelling", () => {
    expect(countByBrand(["ASUS a", "ASUS b", "Asus c"])).toEqual([{ name: "ASUS", count: 3 }]);
    expect(countByBrand(["Asus a", "Asus b", "ASUS c"])).toEqual([{ name: "Asus", count: 3 }]);
  });

  it("does not impose a casing rule on brands that need their own", () => {
    // Title Case would give "Ibox"; upper case would give "IBOX".
    expect(countByBrand(["iBox Mac mini"])).toEqual([{ name: "iBox", count: 1 }]);
    expect(countByBrand(["HP Victus"])).toEqual([{ name: "HP", count: 1 }]);
  });

  it("sorts by count, then alphabetically for ties", () => {
    const result = countByBrand(["Zeta x", "Alpha y", "Beta z", "Beta w"]);
    expect(result.map((r) => r.name)).toEqual(["Beta", "Alpha", "Zeta"]);
  });

  it("skips entries with no usable name", () => {
    expect(countByBrand([null, "", "   ", "MSI Katana"])).toEqual([{ name: "MSI", count: 1 }]);
  });

  it("returns nothing for an empty list", () => {
    expect(countByBrand([])).toEqual([]);
  });

  it("counts every input exactly once", () => {
    const names = ["ASUS a", "Asus b", "MSI c", "Dell d", "dell e"];
    const total = countByBrand(names).reduce((sum, r) => sum + r.count, 0);
    expect(total).toBe(names.length);
  });
});

describe("DEVICE_TYPE_LABELS", () => {
  const ALL: DeviceType[] = [
    "PC_Office",
    "PC_Gaming",
    "Laptop_Office",
    "Laptop_Gaming",
    "Printer",
    "Other_Device",
  ];

  it("labels every device type, so none renders as a raw enum", () => {
    for (const type of ALL) {
      expect(DEVICE_TYPE_LABELS[type], type).toBeTruthy();
      expect(DEVICE_TYPE_LABELS[type], type).not.toContain("_");
    }
  });

  it("gives each one a distinct label", () => {
    expect(new Set(ALL.map((t) => DEVICE_TYPE_LABELS[t])).size).toBe(ALL.length);
  });
});
