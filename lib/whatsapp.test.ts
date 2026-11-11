import { describe, expect, it } from "vitest";
import { readyForPickupText, waLink } from "./whatsapp";

describe("whatsapp", () => {
  it("links a stored +62 number with the message encoded", () => {
    const url = waLink("+62 812-3456-789", readyForPickupText("Budi", "NGH-000001", "https://x.test/t/abc"));
    expect(url?.startsWith("https://wa.me/628123456789?text=Halo%20kak%20Budi")).toBe(true);
  });
  it("offers no link without a usable number", () => {
    expect(waLink(null, "x")).toBeNull();
    expect(waLink("123", "x")).toBeNull();
  });
});
