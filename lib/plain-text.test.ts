import { describe, expect, it } from "vitest";
import { notesToPlainText } from "./plain-text";

describe("notesToPlainText", () => {
  it("leaves plain intake text as it was", () => {
    expect(notesToPlainText("Layar berkedip saat booting")).toBe("Layar berkedip saat booting");
  });

  it("turns editor HTML into lines", () => {
    expect(notesToPlainText("<p>Layar berkedip</p><p>Engsel &amp; casing retak<br>sejak jatuh</p>")).toBe(
      "Layar berkedip\nEngsel & casing retak\nsejak jatuh",
    );
  });

  it("keeps list items readable", () => {
    expect(notesToPlainText("<ul><li>Mati total</li><li>Charger panas</li></ul>")).toBe("- Mati total\n- Charger panas");
  });

  it("is empty for nothing", () => {
    expect(notesToPlainText(null)).toBe("");
    expect(notesToPlainText("<p></p>")).toBe("");
  });
});
