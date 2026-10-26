import { describe, it, expect } from "vitest";
import { validatePassword } from "./password-policy";

describe("validatePassword (command-line accounts)", () => {
  it("accepts a long mixed password", () => {
    expect(validatePassword("Batam2026Servis")).toBeNull();
  });

  it("refuses the passwords this repo has published, in any case", () => {
    expect(validatePassword("ADMIN123")).toMatch(/seed/);
    expect(validatePassword("password")).toMatch(/seed/);
  });

  it("wants twelve characters", () => {
    expect(validatePassword("Abcdef12345")).toMatch(/12 karakter/);
  });

  it("wants lower case, upper case and a digit", () => {
    expect(validatePassword("abcdefghijk1")).toMatch(/huruf/);
    expect(validatePassword("ABCDEFGHIJK1")).toMatch(/huruf/);
    expect(validatePassword("Abcdefghijkl")).toMatch(/huruf/);
  });
});
