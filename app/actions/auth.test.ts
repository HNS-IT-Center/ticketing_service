/**
 * loginAction routing per role.
 *
 * Runs against the local Postgres container so the user lookup and the
 * is_active guard are exercised for real; only the Next.js redirect and the
 * cookie-backed session are stubbed.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import bcrypt from "bcryptjs";

vi.mock("server-only", () => ({}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

/** redirect() throws NEXT_REDIRECT in Next.js; mirror that with the path attached. */
class RedirectError extends Error {
  constructor(public readonly path: string) {
    super(`NEXT_REDIRECT:${path}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new RedirectError(path);
  },
}));

const createdSessions: { userId: string; role: string }[] = [];
let sessionDeleted = false;
vi.mock("@/lib/session", () => ({
  createSession: async (userId: string, role: string) => {
    createdSessions.push({ userId, role });
  },
  deleteSession: async () => {
    sessionDeleted = true;
  },
}));

const { db } = await import("@/lib/db");
const { loginAction } = await import("./auth");

const RUN = `authtest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const PASSWORD = "secret123";

type Case = { role: "Administrator" | "Technician" | "Sales" | "RMA" | "Customer"; email: string };
const USERS: Case[] = [
  { role: "Administrator", email: `${RUN}.admin@test.local` },
  { role: "Technician", email: `${RUN}.tech@test.local` },
  { role: "Sales", email: `${RUN}.sales@test.local` },
  { role: "RMA", email: `${RUN}.rma@test.local` },
  { role: "Customer", email: `${RUN}.customer@test.local` },
];

function form(email: string, password: string) {
  const fd = new FormData();
  fd.append("email", email);
  fd.append("password", password);
  return fd;
}

/** Calls loginAction and reports the redirect path, or the returned message. */
async function login(email: string, password = PASSWORD) {
  sessionDeleted = false;
  try {
    const result = await loginAction(undefined, form(email, password));
    return { redirected: null as string | null, result };
  } catch (err) {
    if (err instanceof RedirectError) return { redirected: err.path, result: undefined };
    throw err;
  }
}

beforeAll(async () => {
  const hashed = await bcrypt.hash(PASSWORD, 10);
  for (const u of USERS) {
    await db.user.create({
      data: {
        name: `${RUN} ${u.role}`,
        email: u.email,
        phone_number: "+628100000000",
        address: "Test",
        role: u.role,
        password: hashed,
      },
    });
  }
  await db.user.create({
    data: {
      name: `${RUN} inactive rma`,
      email: `${RUN}.inactive@test.local`,
      phone_number: "+628100000000",
      address: "Test",
      role: "RMA",
      password: hashed,
      is_active: false,
    },
  });
});

afterAll(async () => {
  // These users carry the RMA and Administrator roles, so a handover running
  // concurrently in rma.test.ts notifies them. Clear the notifications before
  // the users, or the foreign key blocks the delete.
  const users = await db.user.findMany({
    where: { email: { startsWith: RUN } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (ids.length > 0) {
    await db.notification.deleteMany({ where: { user_id: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
  }
  await db.$disconnect();
});

// ─────────────────────────────────────────────────────────────────────────────

describe("loginAction — RMA", () => {
  it("logs in and lands on /rma/dashboard", async () => {
    const { redirected } = await login(`${RUN}.rma@test.local`);
    expect(redirected).toBe("/rma/dashboard");
  });

  it("creates the session with the RMA role", async () => {
    const before = createdSessions.length;
    await login(`${RUN}.rma@test.local`);
    expect(createdSessions.length).toBe(before + 1);
    expect(createdSessions.at(-1)).toMatchObject({ role: "RMA" });
  });

  it("does not delete the session on the way out", async () => {
    await login(`${RUN}.rma@test.local`);
    expect(sessionDeleted).toBe(false);
  });

  it("still refuses a deactivated RMA account", async () => {
    const { redirected, result } = await login(`${RUN}.inactive@test.local`);
    expect(redirected).toBeNull();
    expect(result?.message).toContain("deactivated");
  });

  it("still refuses a wrong password", async () => {
    const { redirected, result } = await login(`${RUN}.rma@test.local`, "wrong");
    expect(redirected).toBeNull();
    expect(result?.message).toContain("Invalid email or password");
  });
});

describe("loginAction — the other roles are unchanged", () => {
  it.each([
    ["Administrator", "/admin/dashboard"],
    ["Technician", "/technician/dashboard"],
    ["Sales", "/sales/dashboard"],
  ])("%s lands on %s", async (role, expected) => {
    const user = USERS.find((u) => u.role === role)!;
    const { redirected } = await login(user.email);
    expect(redirected).toBe(expected);
  });

  it("Customer is refused and its session is cleared", async () => {
    const { redirected, result } = await login(`${RUN}.customer@test.local`);
    expect(redirected).toBeNull();
    expect(result?.message).toContain("ticket link");
    expect(sessionDeleted).toBe(true);
  });
});
