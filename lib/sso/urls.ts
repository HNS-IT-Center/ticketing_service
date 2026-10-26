import { ssoEnv } from "./config";

/**
 * This app's public origin, for redirects issued by the auth routes.
 *
 * Taken from configuration, in order: the registered SSO redirect URI (it is
 * this app's public address by definition), then NEXT_PUBLIC_APP_URL, then the
 * forwarded host. Never `request.url` first: behind Hostinger's proxy that is
 * the internal address, and a redirect there leaves the user stranded.
 */
export function appOrigin(request?: Request): string {
  const env = ssoEnv();
  if (env) return new URL(env.redirectUri).origin;
  if (process.env.NEXT_PUBLIC_APP_URL) return new URL(process.env.NEXT_PUBLIC_APP_URL).origin;
  if (request) {
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
    if (host) {
      const proto = request.headers.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
      return `${proto}://${host}`;
    }
  }
  return "http://localhost:3000";
}

export function appUrl(path: string, request?: Request): URL {
  return new URL(path, appOrigin(request));
}

/**
 * SSO's end-session URL for someone who has no id_token here — the error page,
 * where sign-in never completed. The client is identified by `client_id`.
 */
export function ssoLogoutUrlWithoutHint(): string | null {
  const env = ssoEnv();
  if (!env) return null;
  const url = new URL(`${env.issuer}/oauth/logout`);
  url.searchParams.set("client_id", env.clientId);
  url.searchParams.set("post_logout_redirect_uri", env.postLogoutRedirectUri);
  return url.href;
}
