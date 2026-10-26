import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Turn the identity SSO vouched for into a local user row.
 *
 * Order, from HNS-SSO-CLIENT.md §3.3:
 *   1. the row already tied to this `sub`;
 *   2. otherwise a row with the same email that is not tied to anyone yet,
 *      which is then tied — email is only ever used for this first link;
 *   3. otherwise a new row, role `Pending`, until an administrator gives it one.
 *
 * Reaching the callback already means SSO's whitelist let this person into the
 * app, so there is no whitelist here — only what they may do once inside.
 * Primary keys never change and rows are never merged: every ticket, log and
 * point a person earned stays attached to the row it always was.
 */

export type SsoIdentity = {
  sub: string;
  email?: string | null;
  name?: string | null;
  preferredUsername?: string | null;
};

export type LinkedUser = { id: string; name: string; role: string; email: string };

export type LinkResult =
  | { ok: true; user: LinkedUser; created: boolean; linked: boolean }
  | {
      ok: false;
      reason: "inactive" | "email_conflict" | "customer_account" | "no_email";
    };

const STAFF_SELECT = { id: true, name: true, role: true, email: true, is_active: true, sso_sub: true } as const;

function displayName(identity: SsoIdentity): string {
  return (
    identity.name?.trim() ||
    identity.preferredUsername?.trim() ||
    identity.email?.split("@")[0] ||
    "Pengguna SSO"
  );
}

export async function linkSsoUser(identity: SsoIdentity): Promise<LinkResult> {
  const email = identity.email?.trim() || null;

  // 1. Already linked.
  let user = await db.user.findUnique({ where: { sso_sub: identity.sub }, select: STAFF_SELECT });
  let linked = false;
  let created = false;

  // 2. First link, by email.
  if (!user && email) {
    // The collation is case-insensitive, so this matches regardless of case.
    const byEmail = await db.user.findUnique({ where: { email }, select: STAFF_SELECT });
    if (byEmail) {
      if (byEmail.sso_sub && byEmail.sso_sub !== identity.sub) return { ok: false, reason: "email_conflict" };
      // A customer record is never turned into a staff account.
      if (byEmail.role === "Customer") return { ok: false, reason: "customer_account" };
      user = await db.user.update({
        where: { id: byEmail.id },
        data: { sso_sub: identity.sub },
        select: STAFF_SELECT,
      });
      linked = true;
    }
  }

  // 3. Nobody yet: a new account that can do nothing until given a role.
  if (!user) {
    if (!email) return { ok: false, reason: "no_email" };
    try {
      user = await db.user.create({
        data: {
          name: displayName(identity),
          email,
          role: "Pending",
          phone_number: "-",
          address: "-",
          sso_sub: identity.sub,
        },
        select: STAFF_SELECT,
      });
      created = true;
    } catch (err) {
      // Two first logins at once: the other one won, use its row.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        user = await db.user.findUnique({ where: { sso_sub: identity.sub }, select: STAFF_SELECT });
        if (!user) return { ok: false, reason: "email_conflict" };
      } else {
        throw err;
      }
    }
  }

  // A row this app deactivated stays deactivated, whatever SSO says.
  if (!user.is_active) return { ok: false, reason: "inactive" };

  // Keep name and email in step with SSO. Email may change there freely,
  // because the link is the `sub`; skip it if another row already holds it.
  const update: { name?: string; email?: string } = {};
  const freshName = identity.name?.trim();
  if (freshName && freshName !== user.name) update.name = freshName;
  if (email && email.toLowerCase() !== user.email.toLowerCase()) {
    const taken = await db.user.findUnique({ where: { email }, select: { id: true } });
    if (!taken) update.email = email;
  }
  if (Object.keys(update).length > 0) {
    user = await db.user.update({ where: { id: user.id }, data: update, select: STAFF_SELECT });
  }

  return {
    ok: true,
    user: { id: user.id, name: user.name, role: user.role, email: user.email },
    created,
    linked,
  };
}
