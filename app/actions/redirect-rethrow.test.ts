/**
 * A session that ended mid-task makes the action redirect. The catch-alls in
 * the actions used to catch that redirect and return its message, so the
 * phone showed a toast reading "NEXT_REDIRECT" on "Confirm Work Done" instead
 * of going to the sign-in page (2026-11-07). They rethrow it now.
 */
import { describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/email", () => ({ sendTicketStatusEmail: vi.fn(async () => undefined), EMAIL_MILESTONES: [] }));
vi.mock("@/lib/session", () => {
  const ended = (): never => redirect("/auth/session-ended");
  return { requireSession: vi.fn(async () => ended()), requireRole: vi.fn(async () => ended()), getSession: vi.fn(async () => null) };
});

function isRedirect(err: unknown): boolean {
  return typeof (err as { digest?: unknown })?.digest === "string" && (err as { digest: string }).digest.startsWith("NEXT_REDIRECT");
}

async function outcome(run: () => Promise<unknown>): Promise<"redirected" | unknown> {
  try {
    return await run();
  } catch (err) {
    return isRedirect(err) ? "redirected" : err;
  }
}

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("a session that ended redirects, it is not an error message", () => {
  it("marking work done", async () => {
    const { updateTicketStatusAction } = await import("./technician");
    expect(await outcome(() => updateTicketStatusAction(form({ ticketId: "x", newStatus: "done" })))).toBe("redirected");
  });

  it("creating a ticket", async () => {
    const { createTicketAction } = await import("./tickets");
    expect(await outcome(() => createTicketAction(form({})))).toBe("redirected");
  });

  it("handing a claim to RMA, and moving an RMA case", async () => {
    const { handoverToRmaAction, transitionRmaAction } = await import("./rma");
    expect(await outcome(() => handoverToRmaAction(form({ ticketId: "x" })))).toBe("redirected");
    expect(await outcome(() => transitionRmaAction(form({ rmaCaseId: "x", toStatus: "verified" })))).toBe("redirected");
  });
});
