import { describe, expect, it } from "vitest";
import { parseDraft, DRAFT_MAX_AGE_MS } from "./draft";

const stored = (savedAt: number, data: unknown = { notes: "Layar berkedip" }) =>
  JSON.stringify({ savedAt, data });

describe("parseDraft", () => {
  const now = 1_800_000_000_000;

  it("returns a recent draft", () => {
    expect(parseDraft(stored(now - 60_000), now)).toEqual({
      savedAt: now - 60_000,
      data: { notes: "Layar berkedip" },
    });
  });

  it("drops a draft older than the maximum age", () => {
    expect(parseDraft(stored(now - DRAFT_MAX_AGE_MS - 1), now)).toBeNull();
  });

  it("does not age a draft when no clock is given", () => {
    expect(parseDraft(stored(0))).not.toBeNull();
  });

  it.each([null, "", "not json", "{}", JSON.stringify({ savedAt: "x", data: {} })])(
    "treats %j as no draft rather than throwing",
    (raw) => {
      expect(parseDraft(raw, now)).toBeNull();
    },
  );
});
