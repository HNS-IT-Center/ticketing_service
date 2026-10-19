import { SignJWT, jwtVerify } from "jose";

/**
 * The signed session cookie, and nothing else.
 *
 * Split out of lib/session.ts so proxy.ts can read a cookie without pulling in
 * the database: the proxy only makes the optimistic check. Whether the session
 * is still good — account active, role unchanged, SSO session not revoked — is
 * decided server side by lib/session.ts on every request.
 */

export type SessionPayload = {
  userId: string;
  role: string;
  name: string;
  /** SsoSession.id when the session came through HNS SSO; absent for a password login. */
  sso?: string;
};

export const SESSION_COOKIE = "session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

const encodedKey = () => new TextEncoder().encode(process.env.SESSION_SECRET!);

export async function encrypt(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(encodedKey());
}

export async function decrypt(
  session: string | undefined = ""
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(session, encodedKey(), {
      algorithms: ["HS256"],
    });
    // A token minted for another purpose with the same secret (the SSO flow
    // cookie) must never pass as a session.
    if (typeof payload.userId !== "string" || typeof payload.role !== "string") return null;
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

/**
 * Cookie attributes for the session. No `maxAge` by default: a session cookie
 * the browser drops when it closes; the JWT inside still expires after 7 days.
 */
export function sessionCookieOptions(rememberMe?: boolean) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    ...(rememberMe ? { maxAge: SESSION_MAX_AGE_SECONDS } : {}),
  };
}
