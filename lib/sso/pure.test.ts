import { describe, expect, it } from "vitest";
import { safeReturnTo } from "./return-to";
import { parseCsv, toCsv } from "../csv";
import { buildExportRows, parseSsoExport, planLinks, type LocalAccount } from "./accounts";
import { breakGlassEmails, localLoginMode, mayUsePassword } from "../auth/local-login";

describe("safeReturnTo", () => {
  it.each(["/rma/tickets", "/admin/tickets?status=done"])("keeps the relative path %s", (p) => {
    expect(safeReturnTo(p)).toBe(p);
  });
  it.each([
    "https://evil.example/x",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "rma/tickets",
    "/login",
    "/auth/sso/login",
    "/a\nb",
    "",
    null,
  ])("drops %j", (p) => {
    expect(safeReturnTo(p as string | null)).toBeNull();
  });
});

describe("csv", () => {
  it("round-trips quotes, commas and line breaks", () => {
    const rows = [["a", 'he said "hi"', "x,y", "line1\nline2"]];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
  it("reads CRLF, a BOM and a trailing newline", () => {
    expect(parseCsv("﻿sub,email\r\n1,a@b.c\r\n")).toEqual([["sub", "email"], ["1", "a@b.c"]]);
  });
});

describe("local login rule", () => {
  const env = (o: Record<string, string>) => o as NodeJS.ProcessEnv;
  it("lets everyone use a password until go-live", () => {
    expect(localLoginMode(env({}))).toBe("all");
    expect(mayUsePassword({ email: "t@x.id", role: "Technician" }, env({}))).toBe(true);
  });
  it("after go-live only listed administrators may", () => {
    const e = env({ LOCAL_LOGIN: "break-glass", BREAK_GLASS_EMAILS: " Admin@X.id , other@x.id" });
    expect(breakGlassEmails(e)).toEqual(["admin@x.id", "other@x.id"]);
    expect(mayUsePassword({ email: "admin@x.id", role: "Administrator" }, e)).toBe(true);
    expect(mayUsePassword({ email: "admin@x.id", role: "Technician" }, e)).toBe(false);
    expect(mayUsePassword({ email: "tech@x.id", role: "Administrator" }, e)).toBe(false);
  });
});

const account = (o: Partial<LocalAccount>): LocalAccount => ({
  id: o.id ?? Math.random().toString(36).slice(2),
  name: o.name ?? "Staf",
  email: o.email ?? "staf@hns.id",
  role: o.role ?? "Technician",
  password: o.password ?? null,
  is_active: o.is_active ?? true,
  sso_sub: o.sso_sub ?? null,
});

describe("buildExportRows", () => {
  it("exports staff only, with bcrypt hashes and nothing else", () => {
    const { rows, skipped, withPassword } = buildExportRows([
      account({ email: "a@hns.id", password: "$2b$12$abcdefghijklmnopqrstuv" }),
      account({ email: "b@hns.id", password: "md5:deadbeef" }),
      account({ email: "c@hns.id", is_active: false }),
      account({ email: "cust@hns.id", role: "Customer" }),
      account({ email: "x__deleted__@deactivated.local" }),
      account({ email: "fixture@qc.local" }),
      account({ email: "seed@techserve.id" }),
    ], { excludeDomains: ["techserve.id"] });
    expect(rows).toEqual([
      ["a@hns.id", "", "Staf", "active", "$2b$12$abcdefghijklmnopqrstuv"],
      ["b@hns.id", "", "Staf", "active", ""],
      ["c@hns.id", "", "Staf", "disabled", ""],
    ]);
    expect(withPassword).toBe(1);
    expect(skipped.reduce((n, s) => n + s.count, 0)).toBe(4);
  });
});

describe("planLinks", () => {
  const sso = (sub: string, email: string) => ({ sub, email, username: "", name: "", status: "active" });

  it("links by email case-insensitively and reports everything else", () => {
    const a = account({ id: "a", email: "Budi@HNS.id" });
    const b = account({ id: "b", email: "siti@hns.id", sso_sub: "sub-siti" });
    const c = account({ id: "c", email: "agus@hns.id", sso_sub: "sub-other" });
    const d = account({ id: "d", email: "cust@hns.id", role: "Customer" });
    const e = account({ id: "e", email: "lama@hns.id" });
    const { rows } = parseSsoExport(
      "sub,username,email,name,status\r\n'sub-budi,,budi@hns.id,,active\r\nsub-siti,,siti@hns.id,,\r\nsub-agus,,agus@hns.id,,\r\nsub-cust,,cust@hns.id,,\r\nsub-new,,baru@hns.id,,\r\n"
    );
    const plan = planLinks(rows, [a, b, c, d, e]);
    expect(plan.link).toEqual([{ userId: "a", email: "Budi@HNS.id", sub: "sub-budi" }]);
    expect(plan.alreadyLinked.map((x) => x.userId)).toEqual(["b"]);
    expect(plan.conflicts.map((x) => x.email)).toEqual(["agus@hns.id", "cust@hns.id"]);
    expect(plan.notFound.map((x) => x.email)).toEqual(["baru@hns.id"]);
    expect(plan.localNotInSso.map((x) => x.userId)).toEqual(["e"]);
  });

  it("never gives one sub to two accounts", () => {
    const plan = planLinks(
      [sso("dup", "x@hns.id"), sso("dup", "y@hns.id")],
      [account({ id: "x", email: "x@hns.id" }), account({ id: "y", email: "y@hns.id" })]
    );
    expect(plan.link).toHaveLength(1);
    expect(plan.conflicts).toHaveLength(1);
  });

  it("refuses a file without sub and email columns", () => {
    expect(parseSsoExport("email,name\r\na@b.c,A\r\n").error).toMatch(/sub/);
  });
});
