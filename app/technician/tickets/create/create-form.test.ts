/**
 * Source-level guards on the ticket create form.
 *
 * These read the file as text rather than rendering it. That is a blunt kind of
 * test, and it is here for a specific reason: opening the warranty-claim flow
 * broke three separate times, each time in the same way. The form itself was
 * fine and rendered correctly, but a leftover from the "Coming Soon" placeholder
 * meant the user could not actually reach the end of it:
 *
 *   1. `warranty_claim` was missing from getAvailableCases(), so the chip that
 *      opens the flow never appeared (fixed in 3ed7b55).
 *   2. selecting a device reset the type back to "service", so every claim came
 *      out as a Service ticket (fixed in 9df1897).
 *   3. the Create Ticket button on the confirm step carried
 *      `disabled={... || ticketType === "warranty_claim"}`, so the flow ran to
 *      the last step and then refused to submit.
 *
 * Every one of those was verified as "the form renders" and shipped. Rendering
 * the component properly would need jsdom and a React testing library, which
 * this project does not have; until it does, these assertions cost nothing and
 * pin the exact three things that went wrong.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";

const FORM = path.join(process.cwd(), "app/technician/tickets/create/CreateTicketForm.tsx");
let source: string;

beforeAll(async () => {
  source = await readFile(FORM, "utf8");
});

describe("the warranty claim flow can be reached", () => {
  it("offers warranty_claim for a laptop or a computer", () => {
    const cases = source.slice(
      source.indexOf("const getAvailableCases"),
      source.indexOf("const validateStep"),
    );
    expect(cases).toContain('"warranty_claim"');
  });

  it("has no Coming Soon placeholder left anywhere", () => {
    expect(source).not.toMatch(/coming\s*soon/i);
  });
});

describe("the warranty claim flow can be completed", () => {
  /** The `disabled={...}` expression on the final submit button. */
  function submitDisabledExpression(): string {
    const submitIdx = source.indexOf("onClick={submit}");
    expect(submitIdx, "submit button not found — did the markup change?").toBeGreaterThan(-1);

    const after = source.slice(submitIdx);
    const match = after.match(/disabled=\{([^}]*)\}/);
    expect(match, "submit button has no disabled prop").not.toBeNull();
    return match![1];
  }

  it("does not disable the submit button for a warranty claim", () => {
    // The exact bug: the confirm step rendered, the checkbox ticked, and the
    // button stayed grey with no message explaining why.
    expect(submitDisabledExpression()).not.toContain("warranty_claim");
  });

  it("does not single out any ticket type on the submit button", () => {
    // Same failure shape for whichever type is opened up next.
    const expr = submitDisabledExpression();
    for (const type of ["service", "cleaning", "upgrade", "pc_build"]) {
      expect(expr, type).not.toContain(`"${type}"`);
    }
  });

  it("still blocks the button while a submit is in flight", () => {
    expect(submitDisabledExpression()).toContain("isPending");
  });
});
