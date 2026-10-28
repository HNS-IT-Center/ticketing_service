import { describe, expect, it } from "vitest";
import { nextPage, pageWindow, previousPage } from "./pagination";

describe("pageWindow", () => {
  it("shows every page when there are few", () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(2, 3)).toEqual([1, 2, 3]);
  });

  it("puts a gap on both sides of the current page", () => {
    expect(pageWindow(5, 10)).toEqual([1, "gap", 4, 5, 6, "gap", 10]);
  });

  it("does not put a gap between neighbours", () => {
    expect(pageWindow(1, 10)).toEqual([1, 2, "gap", 10]);
    expect(pageWindow(3, 10)).toEqual([1, 2, 3, 4, "gap", 10]);
    expect(pageWindow(10, 10)).toEqual([1, "gap", 9, 10]);
  });

  it("returns nothing for an empty list", () => {
    expect(pageWindow(1, 0)).toEqual([]);
  });
});

describe("previousPage / nextPage", () => {
  it("stops at the ends", () => {
    expect(previousPage(1, 5)).toBeNull();
    expect(nextPage(5, 5)).toBeNull();
    expect(previousPage(3, 5)).toBe(2);
    expect(nextPage(3, 5)).toBe(4);
  });

  it("leads back to the last real page from past the end", () => {
    expect(previousPage(9, 3)).toBe(3);
    expect(nextPage(9, 3)).toBeNull();
  });

  it("has nowhere to go in an empty list", () => {
    expect(previousPage(4, 0)).toBeNull();
  });
});
