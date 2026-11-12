import { describe, expect, it } from "vitest";
import { notesToPlainText } from "./plain-text";
import { plainTextToNotesHtml } from "./plain-text";

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

describe("plainTextToNotesHtml", () => {
  it("escapes what was typed and keeps the lines", () => {
    expect(plainTextToNotesHtml("Layar <b>mati</b> & bergaris\nsetelah jatuh\n\nCharger ikut")).toBe(
      "<p>Layar &lt;b&gt;mati&lt;/b&gt; &amp; bergaris<br>setelah jatuh</p><p>Charger ikut</p>",
    );
  });

  it("reads back to the same text", () => {
    const text = "Layar mati\nsetelah jatuh\nCharger <ikut>";
    expect(notesToPlainText(plainTextToNotesHtml(text))).toBe(text);
  });
});
