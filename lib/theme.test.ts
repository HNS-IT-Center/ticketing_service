import { describe, expect, it } from "vitest";
import { forcesLightTheme } from "./theme";

describe("pages that stay light whatever the theme", () => {
  it("keeps the invoice and the customer's ticket page light", () => {
    expect(forcesLightTheme("/faktur/NGW-000657")).toBe(true);
    expect(forcesLightTheme("/t/ab12cd")).toBe(true);
    expect(forcesLightTheme("/2026-09-28/0f3c9a2b")).toBe(true);
  });

  it("lets every staff page follow the chosen theme", () => {
    for (const p of ["/admin/dashboard", "/technician/tickets/abc", "/rma/cases/1", "/toko/dashboard", "/login", "/", "/tickets", "/fakturx"]) {
      expect(forcesLightTheme(p), p).toBe(false);
    }
    expect(forcesLightTheme(null)).toBe(false);
  });
});
