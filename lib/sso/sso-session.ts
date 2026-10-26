import "server-only";
import * as oidc from "openid-client";
import { db } from "@/lib/db";
import { getSsoConfig, isSsoConfigured } from "./config";

/**
 * The server-side half of an SSO sign-in: tokens, the SSO `sid`, and whether
 * it has been revoked. The session cookie only carries this row's id.
 */

/** Refresh once the access token has less than this left. */
export const REFRESH_MARGIN_MS = 60_000;
/** How long a refresh may hold the lock before another request may take over. */
const REFRESH_LOCK_MS = 15_000;
const DEFAULT_ACCESS_TTL_S = 600;

type Tokens = {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
};

function expiresAt(tokens: Tokens, now = Date.now()): Date {
  const seconds = typeof tokens.expires_in === "number" ? tokens.expires_in : DEFAULT_ACCESS_TTL_S;
  return new Date(now + seconds * 1000);
}

export async function createSsoSession(input: {
  userId: string;
  sub: string;
  sid: string | null;
  tokens: Tokens;
}): Promise<string> {
  if (!input.tokens.id_token) throw new Error("SSO token response carried no id_token");
  const row = await db.ssoSession.create({
    data: {
      user_id: input.userId,
      sub: input.sub,
      sid: input.sid,
      id_token: input.tokens.id_token,
      access_token: input.tokens.access_token,
      refresh_token: input.tokens.refresh_token ?? null,
      access_expires_at: expiresAt(input.tokens),
    },
    select: { id: true },
  });
  return row.id;
}

export async function revokeSsoSession(id: string, reason: string): Promise<void> {
  await db.ssoSession.updateMany({
    where: { id, revoked_at: null },
    data: { revoked_at: new Date(), revoked_reason: reason },
  });
}

/**
 * Back-channel logout: end every local session tied to this SSO session.
 * Falls back to the subject when the token names no `sid`.
 */
export async function revokeSsoSessionsFor(
  target: { sid?: string | null; sub?: string | null },
  reason: string
): Promise<number> {
  const where = target.sid ? { sid: target.sid } : target.sub ? { sub: target.sub } : null;
  if (!where) return 0;
  const result = await db.ssoSession.updateMany({
    where: { ...where, revoked_at: null },
    data: { revoked_at: new Date(), revoked_reason: reason },
  });
  return result.count;
}

/**
 * Whether the SSO session behind a cookie is still alive, refreshing it when
 * the access token is about to run out.
 *
 * Checked on every authenticated request, so a session ended at SSO — logout
 * elsewhere, password change, access revoked, user disabled — ends here too:
 * the back-channel call kills it at once, and a failed refresh catches the
 * case where that call never arrived (it is sent once, with no retry).
 */
export async function ensureSsoSessionActive(id: string, now = Date.now()): Promise<boolean> {
  const s = await db.ssoSession.findUnique({ where: { id } });
  if (!s || s.revoked_at) return false;
  if (s.access_expires_at.getTime() - now > REFRESH_MARGIN_MS) return true;

  // SSO switched off after this session was issued: nothing can refresh it.
  if (!isSsoConfigured() || !s.refresh_token) {
    await revokeSsoSession(id, "refresh_unavailable");
    return false;
  }

  // One refresher at a time. A reused refresh token revokes the whole chain at
  // SSO, so a second request must never send the same token.
  const lockedNow = new Date(now);
  const lock = await db.ssoSession.updateMany({
    where: {
      id,
      revoked_at: null,
      refresh_token: s.refresh_token,
      OR: [{ refresh_locked_until: null }, { refresh_locked_until: { lt: lockedNow } }],
    },
    data: { refresh_locked_until: new Date(now + REFRESH_LOCK_MS) },
  });
  if (lock.count === 0) {
    // Someone else is refreshing. The access token has up to a minute left,
    // which is all this request needs.
    return s.access_expires_at.getTime() > now;
  }

  try {
    const config = await getSsoConfig();
    const tokens = await oidc.refreshTokenGrant(config, s.refresh_token);
    await db.ssoSession.update({
      where: { id },
      data: {
        access_token: tokens.access_token,
        // Rotated on every use: always keep the new one.
        refresh_token: tokens.refresh_token ?? s.refresh_token,
        id_token: tokens.id_token ?? s.id_token,
        access_expires_at: expiresAt(tokens, now),
        refresh_locked_until: null,
      },
    });
    return true;
  } catch (err) {
    if (err instanceof oidc.ResponseBodyError && err.error === "invalid_grant") {
      // The SSO session is over. End this one with it.
      await revokeSsoSession(id, "refresh_invalid_grant");
      return false;
    }
    // SSO unreachable or erroring: release the lock and keep going on the
    // current access token while it lasts; past that, fail closed.
    console.error("[SSO REFRESH ERROR]", err);
    await db.ssoSession.update({ where: { id }, data: { refresh_locked_until: null } });
    if (s.access_expires_at.getTime() > now) return true;
    await revokeSsoSession(id, "refresh_failed");
    return false;
  }
}
