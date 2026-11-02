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

/** Without "remember me", and for HNS SSO: about one shift. */
export const SESSION_SHIFT_SECONDS = 60 * 60 * 12;

/**
 * Cookie attributes for the session — always with a lifetime.
 *
 * It used to have none unless "remember me" was ticked (SY1), so the browser
 * dropped it when its process ended. Android Chrome ends it often: a weak
 * signal, the camera opening, low memory. Staff were sent back to /login in the
 * middle of an intake and typed the ticket again (owner, 2026-10-27). The SSO
 * callback never passes "remember me", so after the move to SSO everyone would
 * have hit it. Now: one shift by default, seven days when remembered — the JWT
 * inside expires after seven days regardless, and every request still checks
 * the account against the database (lib/session.ts).
 */
export function sessionCookieOptions(rememberMe?: boolean) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: rememberMe ? SESSION_MAX_AGE_SECONDS : SESSION_SHIFT_SECONDS,
  };
}
