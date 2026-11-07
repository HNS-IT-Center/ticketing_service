/**
 * HNS SSO client, end to end against the local database.
 *
 * SSO itself is replaced at the HTTP layer only: openid-client's customFetch
 * answers the token endpoint and the JWKS, and the id_token is signed with a
 * test RSA key. Everything openid-client checks — state, iss, PKCE, signature,
 * aud, nonce — runs for real.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const ISSUER = "https://auth.hnsitcenter.id";
const CLIENT_ID = "ticketing-test-client";
const SECRET = "hns_cs_test_secret";
const REDIRECT = "https://ticketing.test/auth/sso/callback";
const POST_LOGOUT = "https://ticketing.test/login";
Object.assign(process.env, {
  SSO_ISSUER: ISSUER,
  SSO_CLIENT_ID: CLIENT_ID,
  SSO_CLIENT_SECRET: SECRET,
  SSO_REDIRECT_URI: REDIRECT,
  SSO_POST_LOGOUT_REDIRECT_URI: POST_LOGOUT,
  SESSION_SECRET: process.env.SESSION_SECRET || "test-session-secret-at-least-32-characters",
});

const h = vi.hoisted(() => ({
  config: null as unknown,
  localKeys: null as unknown,
  tokenBody: (() => ({ body: {} })) as (form: URLSearchParams) => { status?: number; body: object },
  tokenRequests: [] as { auth: string | null; form: URLSearchParams }[],
  /** How long the token endpoint takes to answer, to let two requests overlap. */
  tokenDelayMs: 0,
  cookies: new Map<string, string>(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (h.cookies.has(name) ? { name, value: h.cookies.get(name)! } : undefined),
    set: (name: string, value: string) => void h.cookies.set(name, value),
    delete: (name: string) => void h.cookies.delete(name),
  }),
  headers: async () => new Map(),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("@/lib/sso/config", async (orig) => {
  const m = await orig<typeof import("@/lib/sso/config")>();
  return { ...m, getSsoConfig: async () => h.config };
});
vi.mock("@/lib/sso/backchannel", async (orig) => {
  const m = await orig<typeof import("@/lib/sso/backchannel")>();
  return { ...m, verifyLogoutToken: (t: string) => m.verifyLogoutToken(t, h.localKeys as never) };
});

const oidc = await import("openid-client");
const jose = await import("jose");
const { NextRequest } = await import("next/server");
const { db } = await import("@/lib/db");
const { GET: LOGIN } = await import("./login/route");
const { GET: CALLBACK } = await import("./callback/route");
const { POST: BACKCHANNEL } = await import("./backchannel-logout/route");
const { openFlow } = await import("@/lib/sso/flow");
const { decrypt, encrypt } = await import("@/lib/session-token");
const { verifySessionPayload } = await import("@/lib/session");
const { ensureSsoSessionActive } = await import("@/lib/sso/sso-session");
const { logoutAction } = await import("@/app/actions/auth");

const RUN = `ssot${Date.now().toString(36)}`;
let privateKey: CryptoKey;
let otherKey: CryptoKey;
let staffId: string;
const staffEmail = `${RUN}.budi@qc.local`;

async function signIdToken(claims: Record<string, unknown>) {
  const now = Math.floor(Date.now() / 1000);
  return new jose.SignJWT({ azp: CLIENT_ID, ...claims })
    .setProtectedHeader({ alg: "RS256", kid: "test-kid", typ: "JWT" })
    .setIssuer(ISSUER)
    .setAudience(CLIENT_ID)
    .setIssuedAt(now)
    .setExpirationTime(now + 600)
    .sign(privateKey);
}

async function logoutToken(
  claims: Record<string, unknown>,
  opts: { key?: CryptoKey; typ?: string; iat?: number } = {}
) {
  const iat = opts.iat ?? Math.floor(Date.now() / 1000);
  return new jose.SignJWT({ events: { "http://schemas.openid.net/event/backchannel-logout": {} }, ...claims })
    .setProtectedHeader({ alg: "RS256", kid: "test-kid", typ: opts.typ ?? "logout+jwt" })
    .setIssuer(ISSUER)
    .setAudience(CLIENT_ID)
    .setIssuedAt(iat)
    .setExpirationTime(iat + 120)
    .setJti(Math.random().toString(36))
    .sign(opts.key ?? privateKey);
}

/** Start a sign-in and return what the callback needs. */
async function startLogin(query = "") {
  const res = await LOGIN(new NextRequest(`http://10.0.0.5:3000/auth/sso/login${query}`));
  const cookie = res.cookies.get("sso_flow")!.value;
  const flow = (await openFlow(cookie))!;
  return { res, cookie, flow };
}

function callbackRequest(search: string, flowCookie?: string) {
  return new NextRequest(`http://10.0.0.5:3000/auth/sso/callback${search}`, {
    headers: flowCookie ? { cookie: `sso_flow=${flowCookie}` } : {},
  });
}

function tokenSuccess(claims: Record<string, unknown>, refresh = "rt-1") {
  h.tokenBody = () => ({ body: {} });
  return async () => {
    const idToken = await signIdToken(claims);
    h.tokenBody = () => ({
      body: {
        access_token: "at-1",
        token_type: "Bearer",
        expires_in: 600,
        scope: "openid profile email",
        id_token: idToken,
        refresh_token: refresh,
        refresh_token_expires_in: 43200,
      },
    });
  };
}

beforeAll(async () => {
  const pair = await jose.generateKeyPair("RS256", { extractable: true });
  privateKey = pair.privateKey;
  otherKey = (await jose.generateKeyPair("RS256")).privateKey;
  const jwk = { ...(await jose.exportJWK(pair.publicKey)), kid: "test-kid", alg: "RS256", use: "sig" };
  const jwks = { keys: [jwk] };
  h.localKeys = jose.createLocalJWKSet(jwks);

  const config = new oidc.Configuration(
    {
      issuer: ISSUER,
      authorization_endpoint: `${ISSUER}/oauth/authorize`,
      token_endpoint: `${ISSUER}/oauth/token`,
      jwks_uri: `${ISSUER}/.well-known/jwks.json`,
      end_session_endpoint: `${ISSUER}/oauth/logout`,
      authorization_response_iss_parameter_supported: true,
    },
    CLIENT_ID,
    { client_secret: SECRET },
    oidc.ClientSecretBasic(SECRET)
  );
  const fakeSso: NonNullable<(typeof config)[typeof oidc.customFetch]> = async (url, init) => {
    if (url.endsWith("/oauth/token")) {
      const form = new URLSearchParams(String(init.body));
      h.tokenRequests.push({ auth: new Headers(init.headers as HeadersInit).get("authorization"), form });
      const { status = 200, body } = h.tokenBody(form);
      if (h.tokenDelayMs) await new Promise((r) => setTimeout(r, h.tokenDelayMs));
      return Response.json(body, { status });
    }
    if (url.endsWith("/.well-known/jwks.json")) return Response.json(jwks);
    throw new Error(`unexpected fetch ${url}`);
  };
  config[oidc.customFetch] = fakeSso;
  h.config = config;

  const staff = await db.user.create({
    data: { name: "Budi Lama", email: staffEmail, phone_number: "+628100000000", address: "QC", role: "Technician", password: "x" },
    select: { id: true },
  });
  staffId = staff.id;
});

afterAll(async () => {
  const users = await db.user.findMany({ where: { email: { startsWith: RUN } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await db.ssoSession.deleteMany({ where: { user_id: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.$disconnect();
});

describe("GET /auth/sso/login", () => {
  it("redirects to authorize with every required parameter", async () => {
    const { res, flow } = await startLogin("?return_to=/technician/tickets&login_hint=a@hns.id");
    expect(res.status).toBe(307);
    const loc = new URL(res.headers.get("location")!);
    expect(`${loc.origin}${loc.pathname}`).toBe(`${ISSUER}/oauth/authorize`);
    const p = loc.searchParams;
    expect(p.get("client_id")).toBe(CLIENT_ID);
    expect(p.get("redirect_uri")).toBe(REDIRECT);
    expect(p.get("response_type")).toBe("code");
    expect(p.get("scope")).toBe("openid profile email");
    expect(p.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    expect(p.get("code_challenge_method")).toBe("S256");
    expect(p.get("state")).toBe(flow.state);
    expect(p.get("nonce")).toBe(flow.nonce);
    expect(p.get("login_hint")).toBe("a@hns.id");
    expect(flow.returnTo).toBe("/technician/tickets");
  });

  it("keeps the flow in an HttpOnly cookie scoped to /auth/sso", async () => {
    const { res } = await startLogin();
    const c = res.cookies.get("sso_flow")!;
    expect(c.httpOnly).toBe(true);
    expect(c.path).toBe("/auth/sso");
    expect(c.sameSite).toBe("lax");
  });

  it("drops an open-redirect return_to", async () => {
    const { flow } = await startLogin("?return_to=//evil.example");
    expect(flow.returnTo).toBeNull();
  });
});

describe("GET /auth/sso/callback", () => {
  it("rejects a wrong state before any token request", async () => {
    const { cookie } = await startLogin();
    const before = h.tokenRequests.length;
    const res = await CALLBACK(callbackRequest(`?code=abc&state=WRONG&iss=${encodeURIComponent(ISSUER)}`, cookie));
    expect(res.headers.get("location")).toBe("https://ticketing.test/auth/sso/error?code=callback_failed");
    expect(res.cookies.get("session")).toBeUndefined();
    expect(res.cookies.get("sso_flow")?.value).toBe("");
    expect(h.tokenRequests.length).toBe(before);
  });

  it("rejects a callback from another issuer", async () => {
    const { cookie, flow } = await startLogin();
    const res = await CALLBACK(callbackRequest(`?code=abc&state=${flow.state}&iss=https%3A%2F%2Fevil.example`, cookie));
    expect(res.headers.get("location")).toContain("code=callback_failed");
  });

  it("explains access_denied", async () => {
    const res = await CALLBACK(callbackRequest("?error=access_denied&state=x"));
    expect(res.headers.get("location")).toBe("https://ticketing.test/auth/sso/error?code=access_denied");
  });

  it("asks to start over when the flow cookie is gone", async () => {
    const res = await CALLBACK(callbackRequest("?code=abc&state=x"));
    expect(res.headers.get("location")).toContain("code=flow_expired");
  });

  it("links an existing account by email, then signs it in by sub", async () => {
    const { cookie, flow } = await startLogin("?return_to=/technician/tickets");
    await tokenSuccess({ sub: `${RUN}-sub-budi`, sid: `${RUN}-sid-1`, nonce: flow.nonce, email: staffEmail, name: "Budi Santoso" })();
    const res = await CALLBACK(callbackRequest(`?code=abc&state=${flow.state}&iss=${encodeURIComponent(ISSUER)}`, cookie));

    // Built from SSO_REDIRECT_URI, never from the internal request host.
    expect(res.headers.get("location")).toBe("https://ticketing.test/technician/tickets");
    const session = await decrypt(res.cookies.get("session")!.value);
    expect(session).toMatchObject({ userId: staffId, role: "Technician", name: "Budi Santoso" });
    expect(session?.sso).toBeTruthy();

    const user = await db.user.findUnique({ where: { id: staffId }, select: { sso_sub: true, name: true } });
    expect(user).toEqual({ sso_sub: `${RUN}-sub-budi`, name: "Budi Santoso" });
    const row = await db.ssoSession.findUnique({ where: { id: session!.sso! } });
    expect(row).toMatchObject({ sid: `${RUN}-sid-1`, refresh_token: "rt-1", revoked_at: null });

    const req = h.tokenRequests.at(-1)!;
    expect(req.auth).toMatch(/^Basic /);
    expect(req.form.get("grant_type")).toBe("authorization_code");
    expect(req.form.get("code_verifier")).toBe(flow.codeVerifier);
    expect(req.form.get("redirect_uri")).toBe(REDIRECT);
  });

  it("refuses an id_token with the wrong nonce", async () => {
    const { cookie, flow } = await startLogin();
    await tokenSuccess({ sub: `${RUN}-sub-budi`, sid: `${RUN}-sid-x`, nonce: "not-the-nonce", email: staffEmail })();
    const res = await CALLBACK(callbackRequest(`?code=abc&state=${flow.state}&iss=${encodeURIComponent(ISSUER)}`, cookie));
    expect(res.headers.get("location")).toContain("code=callback_failed");
    expect(res.cookies.get("session")).toBeUndefined();
  });

  it("creates an unknown person as Pending and sends them to /unauthorized", async () => {
    const { cookie, flow } = await startLogin();
    const email = `${RUN}.baru@qc.local`;
    await tokenSuccess({ sub: `${RUN}-sub-baru`, sid: `${RUN}-sid-2`, nonce: flow.nonce, email, name: "Staf Baru" })();
    const res = await CALLBACK(callbackRequest(`?code=abc&state=${flow.state}&iss=${encodeURIComponent(ISSUER)}`, cookie));
    expect(res.headers.get("location")).toBe("https://ticketing.test/unauthorized");
    const user = await db.user.findUnique({ where: { email }, select: { role: true, sso_sub: true, password: true } });
    expect(user).toEqual({ role: "Pending", sso_sub: `${RUN}-sub-baru`, password: null });
  });
});

describe("session checks and back-channel logout", () => {
  async function ssoSessionFor(sid: string, expiresInMs = 10 * 60_000) {
    const row = await db.ssoSession.create({
      data: {
        user_id: staffId,
        sub: `${RUN}-sub-budi`,
        sid,
        id_token: "id-token-for-hint",
        access_token: "at",
        refresh_token: `rt-${sid}`,
        access_expires_at: new Date(Date.now() + expiresInMs),
      },
    });
    return row.id;
  }

  it("a live SSO session passes; the back-channel ends it", async () => {
    const sso = await ssoSessionFor(`${RUN}-sid-bc`);
    const payload = { userId: staffId, role: "Technician", name: "Budi Santoso", sso };
    expect(await verifySessionPayload(payload)).not.toBeNull();

    const form = new FormData();
    form.set("logout_token", await logoutToken({ sid: `${RUN}-sid-bc`, sub: `${RUN}-sub-budi` }));
    const res = await BACKCHANNEL(new Request("http://x/auth/sso/backchannel-logout", { method: "POST", body: form }));
    expect(res.status).toBe(200);
    expect(await verifySessionPayload(payload)).toBeNull();
  });

  it.each([
    ["signed by another key", () => logoutToken({ sid: "s" }, { key: otherKey })],
    ["typ is not logout+jwt", () => logoutToken({ sid: "s" }, { typ: "JWT" })],
    ["carries a nonce", () => logoutToken({ sid: "s", nonce: "n" })],
    ["has no back-channel event", () => logoutToken({ sid: "s", events: {} })],
    ["is older than two minutes", () => logoutToken({ sid: "s" }, { iat: Math.floor(Date.now() / 1000) - 600 })],
  ])("answers 400 to a token that %s", async (_label, make) => {
    const sso = await ssoSessionFor("s");
    const form = new FormData();
    form.set("logout_token", await make());
    const res = await BACKCHANNEL(new Request("http://x/auth/sso/backchannel-logout", { method: "POST", body: form }));
    expect(res.status).toBe(400);
    expect((await db.ssoSession.findUnique({ where: { id: sso } }))?.revoked_at).toBeNull();
  });

  it("answers 400 to an empty body", async () => {
    const res = await BACKCHANNEL(new Request("http://x/auth/sso/backchannel-logout", { method: "POST" }));
    expect(res.status).toBe(400);
  });

  it("refreshes a token about to expire and keeps the rotated refresh token", async () => {
    const sso = await ssoSessionFor(`${RUN}-sid-rf`, 30_000);
    h.tokenBody = (form) => {
      expect(form.get("grant_type")).toBe("refresh_token");
      expect(form.get("refresh_token")).toBe(`rt-${RUN}-sid-rf`);
      return { body: { access_token: "at-new", token_type: "Bearer", expires_in: 600, refresh_token: "rt-rotated" } };
    };
    expect(await ensureSsoSessionActive(sso)).toBe(true);
    const row = await db.ssoSession.findUnique({ where: { id: sso } });
    expect(row).toMatchObject({ access_token: "at-new", refresh_token: "rt-rotated", refresh_locked_until: null });
  });

  it("two requests on an expired token: one refreshes, the other waits for it instead of ending the session", async () => {
    // A phone idle past the token's lifetime sends the action and the bells'
    // polling at once; the loser used to be told the session was over.
    const sso = await ssoSessionFor(`${RUN}-sid-race`, -60_000);
    h.tokenRequests.length = 0;
    h.tokenDelayMs = 400;
    h.tokenBody = () => ({ body: { access_token: "at-race", token_type: "Bearer", expires_in: 600, refresh_token: "rt-race-2" } });
    try {
      const results = await Promise.all([ensureSsoSessionActive(sso), ensureSsoSessionActive(sso)]);
      expect(results).toEqual([true, true]);
      // The refresh token is sent once: a second use would end the chain at SSO.
      expect(h.tokenRequests.filter((r) => r.form.get("grant_type") === "refresh_token")).toHaveLength(1);
      expect(await db.ssoSession.findUnique({ where: { id: sso } })).toMatchObject({ refresh_token: "rt-race-2", revoked_at: null });
    } finally {
      h.tokenDelayMs = 0;
    }
  });

  it("the waiting request still sees a session ended by the other refresh", async () => {
    const sso = await ssoSessionFor(`${RUN}-sid-race-ig`, -60_000);
    h.tokenDelayMs = 400;
    h.tokenBody = () => ({ status: 400, body: { error: "invalid_grant", error_description: "session ended" } });
    try {
      expect(await Promise.all([ensureSsoSessionActive(sso), ensureSsoSessionActive(sso)])).toEqual([false, false]);
    } finally {
      h.tokenDelayMs = 0;
    }
  });

  it("ends the session when SSO answers invalid_grant", async () => {
    const sso = await ssoSessionFor(`${RUN}-sid-ig`, 30_000);
    h.tokenBody = () => ({ status: 400, body: { error: "invalid_grant", error_description: "session ended" } });
    expect(await ensureSsoSessionActive(sso)).toBe(false);
    expect((await db.ssoSession.findUnique({ where: { id: sso } }))?.revoked_reason).toBe("refresh_invalid_grant");
  });

  it("a changed role or a deactivated account ends the session", async () => {
    const sso = await ssoSessionFor(`${RUN}-sid-role`);
    expect(await verifySessionPayload({ userId: staffId, role: "Administrator", name: "x", sso })).toBeNull();
    await db.user.update({ where: { id: staffId }, data: { is_active: false } });
    expect(await verifySessionPayload({ userId: staffId, role: "Technician", name: "x", sso })).toBeNull();
    await db.user.update({ where: { id: staffId }, data: { is_active: true } });
  });

  it("after go-live a staff password session ends; a break-glass admin's does not", async () => {
    const admin = await db.user.create({
      data: { name: "Admin Darurat", email: `${RUN}.admin@qc.local`, phone_number: "-", address: "-", role: "Administrator", password: "x" },
      select: { id: true },
    });
    Object.assign(process.env, { LOCAL_LOGIN: "break-glass", BREAK_GLASS_EMAILS: `${RUN}.admin@qc.local` });
    try {
      expect(await verifySessionPayload({ userId: staffId, role: "Technician", name: "x" })).toBeNull();
      expect(await verifySessionPayload({ userId: admin.id, role: "Administrator", name: "x" })).not.toBeNull();
    } finally {
      delete process.env.LOCAL_LOGIN;
      delete process.env.BREAK_GLASS_EMAILS;
    }
  });
});

describe("logoutAction", () => {
  it("clears the local session, revokes the SSO one, and goes to end session", async () => {
    const row = await db.ssoSession.create({
      data: {
        user_id: staffId,
        sub: `${RUN}-sub-budi`,
        sid: `${RUN}-sid-out`,
        id_token: "the-id-token",
        access_token: "at",
        access_expires_at: new Date(Date.now() + 600_000),
      },
    });
    h.cookies.set("session", await encrypt({ userId: staffId, role: "Technician", name: "x", sso: row.id }));

    const err = await logoutAction().catch((e: Error) => e);
    const url = new URL(String((err as Error).message).replace(/^REDIRECT:/, ""));
    expect(`${url.origin}${url.pathname}`).toBe(`${ISSUER}/oauth/logout`);
    expect(url.searchParams.get("id_token_hint")).toBe("the-id-token");
    expect(url.searchParams.get("post_logout_redirect_uri")).toBe(POST_LOGOUT);
    expect(h.cookies.has("session")).toBe(false);
    expect((await db.ssoSession.findUnique({ where: { id: row.id } }))?.revoked_reason).toBe("logout");
  });

  it("a password session just goes to /login", async () => {
    h.cookies.set("session", await encrypt({ userId: staffId, role: "Technician", name: "x" }));
    const err = await logoutAction().catch((e: Error) => e);
    expect((err as Error).message).toBe("REDIRECT:/login");
    expect(h.cookies.has("session")).toBe(false);
  });
});
