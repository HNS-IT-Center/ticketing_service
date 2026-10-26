import "server-only";
import * as oidc from "openid-client";

/**
 * HNS SSO client configuration.
 *
 * Everything comes from the environment. Redirect URLs are never built from the
 * incoming request: behind Hostinger's proxy `request.url` is the internal
 * address, which would send users to the wrong host and make the token
 * endpoint answer `invalid_grant`.
 */

export type SsoEnv = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  postLogoutRedirectUri: string;
};

/** The SSO settings, or null when any is missing — SSO is then simply off. */
export function ssoEnv(env: NodeJS.ProcessEnv = process.env): SsoEnv | null {
  const issuer = env.SSO_ISSUER?.trim().replace(/\/+$/, "");
  const clientId = env.SSO_CLIENT_ID?.trim();
  const clientSecret = env.SSO_CLIENT_SECRET?.trim();
  const redirectUri = env.SSO_REDIRECT_URI?.trim();
  const postLogoutRedirectUri = env.SSO_POST_LOGOUT_REDIRECT_URI?.trim();
  if (!issuer || !clientId || !clientSecret || !redirectUri || !postLogoutRedirectUri) {
    return null;
  }
  return { issuer, clientId, clientSecret, redirectUri, postLogoutRedirectUri };
}

export function isSsoConfigured(): boolean {
  return ssoEnv() !== null;
}

export const SSO_SCOPE = "openid profile email";
/** Seconds of clock skew tolerated when checking token times (the server allows 30). */
export const SSO_CLOCK_TOLERANCE = 30;

const DISCOVERY_TTL_MS = 5 * 60 * 1000;
let cached: { at: number; config: Promise<oidc.Configuration> } | null = null;

/** Discovery, cached for 5 minutes; a failed lookup is not cached. */
export function getSsoConfig(): Promise<oidc.Configuration> {
  const env = ssoEnv();
  if (!env) return Promise.reject(new Error("HNS SSO is not configured"));
  if (cached && Date.now() - cached.at < DISCOVERY_TTL_MS) return cached.config;

  const config = oidc
    .discovery(
      new URL(env.issuer),
      env.clientId,
      { client_secret: env.clientSecret, [oidc.clockTolerance]: SSO_CLOCK_TOLERANCE },
      oidc.ClientSecretBasic(env.clientSecret)
    )
    .catch((err) => {
      cached = null;
      throw err;
    });
  cached = { at: Date.now(), config };
  return config;
}
