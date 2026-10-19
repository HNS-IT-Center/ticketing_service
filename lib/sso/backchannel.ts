import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { SSO_CLOCK_TOLERANCE, ssoEnv } from "./config";

/**
 * Verify a back-channel `logout_token` from HNS SSO.
 *
 * This endpoint has no session and no CSRF token — anyone can POST to it — so
 * the JWT signature is the only thing that makes a request genuine. Every check
 * the spec asks for is made; a token failing any of them changes nothing.
 */

const BACKCHANNEL_EVENT = "http://schemas.openid.net/event/backchannel-logout";

let remoteKeys: { issuer: string; keys: JWTVerifyGetKey } | null = null;

/** JWKS from the issuer. jose refetches on an unknown `kid`, which covers key rotation. */
function issuerKeys(issuer: string): JWTVerifyGetKey {
  if (!remoteKeys || remoteKeys.issuer !== issuer) {
    remoteKeys = { issuer, keys: createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`)) };
  }
  return remoteKeys.keys;
}

export type LogoutTarget = { sid: string | null; sub: string | null };

/** The session the token ends, or null when the token is not genuine. */
export async function verifyLogoutToken(
  token: string,
  keys?: JWTVerifyGetKey
): Promise<LogoutTarget | null> {
  const env = ssoEnv();
  if (!env || !token) return null;
  try {
    const { payload } = await jwtVerify(token, keys ?? issuerKeys(env.issuer), {
      issuer: env.issuer,
      audience: env.clientId,
      typ: "logout+jwt",
      algorithms: ["RS256"],
      maxTokenAge: "2 minutes",
      clockTolerance: SSO_CLOCK_TOLERANCE,
    });
    const events = payload.events as Record<string, unknown> | undefined;
    if (!events || typeof events !== "object" || !(BACKCHANNEL_EVENT in events)) return null;
    if ("nonce" in payload) return null;
    const sid = typeof payload.sid === "string" ? payload.sid : null;
    const sub = typeof payload.sub === "string" ? payload.sub : null;
    if (!sid && !sub) return null;
    return { sid, sub };
  } catch {
    return null;
  }
}
