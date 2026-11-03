import { describe, expect, it } from "vitest";
import { newPublicShortCode, SHORT_CODE_LENGTH } from "./short-code";
import { isPublicTicketPath } from "./routes";

describe("newPublicShortCode", () => {
  it("is 12 base62 characters", () => {
    for (let i = 0; i < 200; i++) {
      expect(newPublicShortCode()).toMatch(/^[A-Za-z0-9]{12}$/);
    }
    expect(SHORT_CODE_LENGTH).toBe(12);
  });

  it("does not repeat", () => {
    const seen = new Set(Array.from({ length: 5000 }, () => newPublicShortCode()));
    expect(seen.size).toBe(5000);
  });

  it("makes a path the proxy lets through", () => {
    expect(isPublicTicketPath(`/t/${newPublicShortCode()}`)).toBe(true);
  });
});
