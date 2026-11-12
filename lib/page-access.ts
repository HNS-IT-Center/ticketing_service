import "server-only";
import { redirect } from "next/navigation";
import { accessFor } from "@/lib/access-server";
import type { Capability } from "@/lib/access";
import { destinationForRoleName } from "@/lib/routes";
import { getSession, requireSession, type SessionPayload } from "@/lib/session";

/**
 * The door of a page that Pengaturan Akses decides (owner, 2026-11-11: RBAC).
 * proxy.ts only lets staff into /admin, /rma, /stok, /finance and /logs; which
 * staff may open which page is checked here, from the same capability the
 * sidebar reads (lib/nav.ts) — so a page missing from someone's menu also
 * refuses them when the link is typed. Every page under those prefixes calls
 * one of these; lib/page-access.test.ts reads the source and fails otherwise.
 */
export async function requirePage(...caps: Capability[]): Promise<SessionPayload> {
  const session = await requireSession();
  if (!destinationForRoleName(session.role).allowed) redirect("/unauthorized");
  const access = await accessFor(session.userId);
  if (!caps.some((c) => access.can(c))) redirect("/unauthorized");
  return session;
}

/**
 * The same check for a route handler (an Excel export), which answers 403
 * instead of redirecting. Null when the caller may not.
 */
export async function pageSession(...caps: Capability[]): Promise<SessionPayload | null> {
  const session = await getSession();
  if (!session || !destinationForRoleName(session.role).allowed) return null;
  const access = await accessFor(session.userId);
  return caps.some((c) => access.can(c)) ? session : null;
}

/** Any staff member: the door of a layout whose pages each check their own capability. */
export async function requireStaff(): Promise<SessionPayload> {
  const session = await requireSession();
  if (!destinationForRoleName(session.role).allowed) redirect("/unauthorized");
  return session;
}
