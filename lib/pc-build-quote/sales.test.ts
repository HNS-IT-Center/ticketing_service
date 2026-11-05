import { describe, expect, it } from "vitest";
import { matchSalesName } from "./sales";

const accounts = [
  { id: "1", name: "Budi Santoso" },
  { id: "2", name: "Siti Rahma" },
  { id: "3", name: "Agus" },
  { id: "4", name: "Agustina" },
];

describe("matchSalesName", () => {
  it("matches ignoring case and spacing", () => {
    expect(matchSalesName("  budi   SANTOSO ", accounts)?.id).toBe("1");
  });

  it("matches a shorter or longer form of one name", () => {
    expect(matchSalesName("Siti", accounts)?.id).toBe("2");
    expect(matchSalesName("Budi Santoso S.Kom", accounts)?.id).toBe("1");
  });

  it("prefers an exact name over partial ones", () => {
    // "Agus" is also part of "Agustina", but one account is exactly "Agus".
    expect(matchSalesName("Agus", accounts)?.id).toBe("3");
  });

  it("gives no match when absent, ambiguous or too short", () => {
    expect(matchSalesName(null, accounts)).toBeNull();
    expect(matchSalesName("Rina", accounts)).toBeNull();
    expect(matchSalesName("Agu", accounts)).toBeNull(); // Agus and Agustina
    expect(matchSalesName("S", accounts)).toBeNull();
    expect(matchSalesName("Budi", [...accounts, { id: "5", name: "Budi" }, { id: "6", name: "budi" }])).toBeNull();
  });
});
