import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { mayUsePassword } from "@/lib/auth/local-login";
import { ensureSsoSessionActive } from "@/lib/sso/sso-session";
import {
  SESSION_COOKIE,
  decrypt,
  encrypt,
  sessionCookieOptions,
  type SessionPayload,
} from "@/lib/session-token";

export { encrypt, decrypt, type SessionPayload };

/**
 * Where a session that existed but no longer holds is sent: a route handler
 * that deletes the cookie and goes on to /login. Straight to /login would loop,
 * because proxy.ts sees a well-signed cookie there and bounces it back.
 */
export const SESSION_ENDED_PATH = "/auth/session-ended";

export async function createSession(
  userId: string,
  role: string,
  name: string,
  rememberMe?: boolean,
  ssoSessionId?: string
): Promise<void> {
  const token = await encrypt({ userId, role, name, ...(ssoSessionId ? { sso: ssoSessionId } : {}) });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, sessionCookieOptions(rememberMe));
}

export async function updateSession(): Promise<void> {
  // Session cookies don't need renewal — they have no expiry to extend.
  // Kept for backward compatibility; a no-op.
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

/**
 * Whether a correctly signed cookie still stands for a usable session.
 *
 * The signature only proves this app issued the cookie, up to seven days ago.
 * Until 2026-10-19 that was all anything checked, so a deactivated account, a
 * demoted one, or one whose SSO session had ended kept working until the cookie
 * expired (QC 2026-10-14, H4). Now, on every request:
 *
 * - the account must still exist and be active;
 * - its role must be the one the cookie was issued for — a changed role means
 *   signing in again, so the proxy and the pages never disagree about it;
 * - an SSO session must not be revoked, and is refreshed when due;
 * - a password session must still be allowed under LOCAL_LOGIN.
 *
 * Returns the payload with the role as the database has it, or null.
 */
export async function verifySessionPayload(
  payload: SessionPayload
): Promise<SessionPayload | null> {
  const user = await db.user.findUnique({
    where: { id: payload.userId },
    select: { is_active: true, role: true, name: true, email: true },
  });
  if (!user || !user.is_active) return null;
  if (user.role !== payload.role) return null;

  if (payload.sso) {
    if (!(await ensureSsoSessionActive(payload.sso))) return null;
  } else if (!mayUsePassword({ email: user.email, role: user.role })) {
    return null;
  }

  return { userId: payload.userId, role: user.role, name: user.name, ...(payload.sso ? { sso: payload.sso } : {}) };
}

/**
 * The check above, once per request. `cache` keys on argument identity, so it
 * is keyed on the cookie string rather than on a freshly decoded object.
 */
const checkToken = cache(async (token: string): Promise<SessionPayload | null> => {
  const payload = await decrypt(token);
  return payload ? verifySessionPayload(payload) : null;
});

async function readCookie(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE)?.value;
}

export async function getSession(): Promise<SessionPayload | null> {
  const token = await readCookie();
  return token ? checkToken(token) : null;
}

export async function requireSession(): Promise<SessionPayload> {
  const token = await readCookie();
  if (!token || !(await decrypt(token))) redirect("/login");
  const session = await checkToken(token);
  if (!session) redirect(SESSION_ENDED_PATH);
  return session;
}

export async function requireRole(...roles: string[]): Promise<SessionPayload> {
  const session = await requireSession();
  if (!roles.includes(session.role)) redirect("/login");
  return session;
}
