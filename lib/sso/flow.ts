import { SignJWT, jwtVerify } from "jose";

/**
 * The short-lived record of one sign-in attempt, between the redirect to SSO
 * and the callback: state, nonce, PKCE verifier and where to return.
 *
 * Kept in a signed, HttpOnly cookie scoped to /auth/sso and valid for ten
 * minutes. Signed so it cannot be edited in the browser; single use because
 * the callback deletes it whatever the outcome.
 */

export type SsoFlow = {
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string | null;
};

export const FLOW_COOKIE = "sso_flow";
export const FLOW_MAX_AGE_SECONDS = 600;
const FLOW_PURPOSE = "hns-sso-flow";

const key = () => new TextEncoder().encode(process.env.SESSION_SECRET!);

export async function sealFlow(flow: SsoFlow): Promise<string> {
  return new SignJWT({ ...flow, purpose: FLOW_PURPOSE })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${FLOW_MAX_AGE_SECONDS}s`)
    .sign(key());
}

export async function openFlow(token: string | undefined): Promise<SsoFlow | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    if (payload.purpose !== FLOW_PURPOSE) return null;
    const { state, nonce, codeVerifier, returnTo } = payload as Record<string, unknown>;
    if (typeof state !== "string" || typeof nonce !== "string" || typeof codeVerifier !== "string") {
      return null;
    }
    return { state, nonce, codeVerifier, returnTo: typeof returnTo === "string" ? returnTo : null };
  } catch {
    return null;
  }
}

export function flowCookieOptions(maxAge = FLOW_MAX_AGE_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/auth/sso",
    maxAge,
  };
}
