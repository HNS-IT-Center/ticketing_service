import { describe, expect, it } from "vitest";
import { notFound, redirect } from "next/navigation";
import { isNavigationSignal } from "./navigation-signal";

function caught(run: () => void): unknown {
  try {
    run();
  } catch (err) {
    return err;
  }
  return undefined;
}

describe("isNavigationSignal", () => {
  it("recognises Next's redirect and notFound", () => {
    expect(isNavigationSignal(caught(() => redirect("/login?ended=1")))).toBe(true);
    expect(isNavigationSignal(caught(() => notFound()))).toBe(true);
  });

  it("does not hide real failures", () => {
    expect(isNavigationSignal(new Error("Failed to fetch"))).toBe(false);
    expect(isNavigationSignal(new TypeError("NetworkError"))).toBe(false);
    expect(isNavigationSignal({ digest: 123 })).toBe(false);
    expect(isNavigationSignal(null)).toBe(false);
    expect(isNavigationSignal("NEXT_REDIRECT")).toBe(false);
  });
});
