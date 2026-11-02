import { describe, expect, it } from "vitest";
import { errorOf } from "./action-result";

describe("errorOf", () => {
  it("returns the message of an { error } result", () => {
    expect(errorOf({ error: "Email already in use" })).toBe("Email already in use");
  });

  it("returns nothing for success, nothing, or an empty message", () => {
    expect(errorOf({ success: true })).toBeUndefined();
    expect(errorOf(undefined)).toBeUndefined();
    expect(errorOf(null)).toBeUndefined();
    expect(errorOf({ error: "" })).toBeUndefined();
    expect(errorOf({ error: 42 })).toBeUndefined();
  });
});
