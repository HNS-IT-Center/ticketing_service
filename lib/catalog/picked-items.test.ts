import { describe, it, expect } from "vitest";
import {
  addPicked,
  parsePostedItems,
  parseUpgradeSelections,
  restorePickedItems,
  toPosted,
  typedItems,
  MAX_ITEM_NAME,
  type PickedItem,
} from "./picked-items";

const ram: PickedItem = { catalogItemId: 501, sku: "RAM-8", category: "MEMORY", name: "RAM 8GB DDR4", quantity: 1 };
const typed: PickedItem = { catalogItemId: null, sku: null, category: null, name: "Casing bekas", quantity: 1 };

describe("parsePostedItems", () => {
  it("reads picked and typed lines", () => {
    const raw = JSON.stringify([toPosted(ram), toPosted({ ...typed, quantity: 2 })]);
    expect(parsePostedItems(raw)).toEqual({
      ok: true,
      value: [
        { catalogItemId: 501, name: "RAM 8GB DDR4", quantity: 1 },
        { catalogItemId: null, name: "Casing bekas", quantity: 2 },
      ],
    });
  });

  it("treats empty or absent as no components", () => {
    expect(parsePostedItems(null)).toEqual({ ok: true, value: [] });
    expect(parsePostedItems("  ")).toEqual({ ok: true, value: [] });
    expect(parsePostedItems("[]")).toEqual({ ok: true, value: [] });
  });

  it("defaults a missing quantity to one, and lets a catalogue line come without a name", () => {
    expect(parsePostedItems('[{"catalogItemId":7}]')).toEqual({ ok: true, value: [{ catalogItemId: 7, name: "", quantity: 1 }] });
  });

  it("refuses what it cannot trust", () => {
    const bad = [
      "not json",
      '{"catalogItemId":1}',
      '[{"catalogItemId":0,"name":"x"}]',
      '[{"catalogItemId":1.5,"name":"x"}]',
      '[{"catalogItemId":"12","name":"x"}]',
      '[{"catalogItemId":null,"name":"  "}]',
      '[{"catalogItemId":null,"name":"x","quantity":0}]',
      '[{"catalogItemId":null,"name":"x","quantity":100}]',
      '[{"catalogItemId":null,"name":"x","quantity":"2"}]',
      JSON.stringify([{ catalogItemId: null, name: "x".repeat(MAX_ITEM_NAME + 1) }]),
      "[null]",
    ];
    for (const raw of bad) expect(parsePostedItems(raw).ok, raw).toBe(false);
  });

  it("caps the list", () => {
    const many = JSON.stringify(Array.from({ length: 4 }, (_, i) => ({ catalogItemId: null, name: `C${i}` })));
    expect(parsePostedItems(many, 3)).toMatchObject({ ok: false, error: expect.stringMatching(/Maksimal 3/) });
  });
});

describe("parseUpgradeSelections", () => {
  it("reads each upgrade with or without its item", () => {
    const raw = JSON.stringify([
      { upgradeId: "u-ram", item: toPosted(ram) },
      { upgradeId: "u-ssd", item: null },
    ]);
    expect(parseUpgradeSelections(raw)).toEqual({
      ok: true,
      value: [
        { upgradeId: "u-ram", item: { catalogItemId: 501, name: "RAM 8GB DDR4", quantity: 1 } },
        { upgradeId: "u-ssd", item: null },
      ],
    });
  });

  it("refuses an upgrade chosen twice, a missing id, and a broken item", () => {
    expect(parseUpgradeSelections('[{"upgradeId":"a"},{"upgradeId":"a"}]').ok).toBe(false);
    expect(parseUpgradeSelections('[{"item":null}]').ok).toBe(false);
    expect(parseUpgradeSelections('[{"upgradeId":"a","item":{"catalogItemId":-1}}]').ok).toBe(false);
  });
});

describe("addPicked", () => {
  it("adds one to a catalogue item already on the list instead of listing it twice", () => {
    expect(addPicked([ram], ram)).toEqual([{ ...ram, quantity: 2 }]);
  });

  it("keeps typed lines apart, even with the same words", () => {
    expect(addPicked([typed], typed)).toHaveLength(2);
  });
});

describe("restorePickedItems (drafts)", () => {
  it("brings back drafts from before 2026-10-26, when components were plain strings", () => {
    expect(restorePickedItems(["RTX 4060", " ", "i5-13400F"])).toEqual([
      { catalogItemId: null, sku: null, category: null, name: "RTX 4060", quantity: 1 },
      { catalogItemId: null, sku: null, category: null, name: "i5-13400F", quantity: 1 },
    ]);
  });

  it("keeps current lines and drops what cannot be read", () => {
    expect(restorePickedItems([ram, { name: "" }, 42, null, { ...typed, quantity: 500 }])).toEqual([
      ram,
      { ...typed, quantity: 99 },
    ]);
    expect(restorePickedItems(undefined)).toEqual([]);
  });
});

describe("typedItems", () => {
  it("turns the old form's plain names into typed lines", () => {
    expect(typedItems(["  RTX 4060 ", ""])).toEqual([{ catalogItemId: null, name: "RTX 4060", quantity: 1 }]);
  });
});
