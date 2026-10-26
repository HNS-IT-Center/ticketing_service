import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

// lib/db.ts imports "server-only", which throws outside a React Server Component.
vi.mock("server-only", () => ({}));

import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { findPasswordTarget, passwordUsableNow, setPassword } from "./set-password";

const STAMP = `setpw-${Date.now()}`;
const email = (k: string) => `${STAMP}-${k}@example.test`;
const ids: Record<string, string> = {};

beforeAll(async () => {
  const base = { phone_number: "+6281200000000", address: "-" };
  ids.sso = (await db.user.create({ data: { ...base, name: "SSO Admin", email: email("sso"), role: "Administrator", password: null } })).id;
  ids.has = (await db.user.create({ data: { ...base, name: "Has Pw", email: email("has"), role: "Technician", password: await bcrypt.hash("Lama12345678", 4) } })).id;
  ids.off = (await db.user.create({ data: { ...base, name: "Off", email: email("off"), role: "Technician", is_active: false } })).id;
  ids.cust = (await db.user.create({ data: { ...base, name: "Cust", email: email("cust"), role: "Customer" } })).id;
});

afterAll(async () => {
  await db.user.deleteMany({ where: { email: { startsWith: STAMP } } });
});

describe("findPasswordTarget", () => {
  it("finds a passwordless staff account and says it has none", async () => {
    const r = await findPasswordTarget(db, `  ${email("sso")} `);
    expect(r).toMatchObject({ ok: true, user: { id: ids.sso, role: "Administrator", hasPassword: false } });
  });

  it("says when an account already has a password", async () => {
    expect(await findPasswordTarget(db, email("has"))).toMatchObject({ ok: true, user: { hasPassword: true } });
  });

  it("refuses an unknown email, a deactivated account and a customer", async () => {
    expect(await findPasswordTarget(db, email("nobody"))).toMatchObject({ ok: false, error: expect.stringMatching(/Tidak ada akun/) });
    expect(await findPasswordTarget(db, email("off"))).toMatchObject({ ok: false, error: expect.stringMatching(/nonaktif/) });
    expect(await findPasswordTarget(db, email("cust"))).toMatchObject({ ok: false, error: expect.stringMatching(/Customer/) });
  });
});

describe("setPassword", () => {
  it("stores a bcrypt hash that the login check accepts, and changes nothing else", async () => {
    const before = await db.user.findUniqueOrThrow({ where: { id: ids.sso }, select: { role: true, is_active: true } });
    expect(await setPassword(db, ids.sso, "Batam2026Servis")).toEqual({ ok: true });
    const after = await db.user.findUniqueOrThrow({ where: { id: ids.sso }, select: { role: true, is_active: true, password: true } });
    expect(after.password).not.toBe("Batam2026Servis");
    expect(await bcrypt.compare("Batam2026Servis", after.password!)).toBe(true);
    expect({ role: after.role, is_active: after.is_active }).toEqual(before);
  });

  it("refuses a weak password and writes nothing", async () => {
    const before = (await db.user.findUniqueOrThrow({ where: { id: ids.has }, select: { password: true } })).password;
    expect(await setPassword(db, ids.has, "admin123")).toMatchObject({ ok: false });
    expect((await db.user.findUniqueOrThrow({ where: { id: ids.has }, select: { password: true } })).password).toBe(before);
  });

  it("does not write to an account deactivated after it was looked up", async () => {
    expect(await setPassword(db, ids.off, "Batam2026Servis")).toMatchObject({ ok: false, error: expect.stringMatching(/berubah/) });
    expect((await db.user.findUniqueOrThrow({ where: { id: ids.off }, select: { password: true } })).password).toBeNull();
  });
});

describe("passwordUsableNow", () => {
  it("is true by default and false for a non-break-glass account under break-glass", () => {
    const user = { email: "a@x.test", role: "Administrator" as const };
    const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv;
    expect(passwordUsableNow(user, env({}))).toBe(true);
    expect(passwordUsableNow(user, env({ LOCAL_LOGIN: "break-glass", BREAK_GLASS_EMAILS: "b@x.test" }))).toBe(false);
    expect(passwordUsableNow(user, env({ LOCAL_LOGIN: "break-glass", BREAK_GLASS_EMAILS: "A@x.test" }))).toBe(true);
  });
});
