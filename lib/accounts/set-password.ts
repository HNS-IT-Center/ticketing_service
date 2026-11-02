/**
 * Giving an existing staff account a password — `npm run set-password`.
 *
 * Needed because the old "Sign in with Google (SSO)" button created staff
 * accounts with no password at all, and the release that replaces it with the
 * HNS SSO client removes that button. Until HNS SSO is switched on, a password
 * is the only way in; an account without one is locked out the moment its
 * session cookie goes. Production had two such administrators (2026-10-26).
 *
 * Nothing else about the account changes: not its role, not whether it is
 * active. Reactivating an account is an administrator's decision, made in the
 * portal where it is logged, never a side effect of a password reset.
 */
import bcrypt from "bcryptjs";
import type { PrismaClient, Role } from "@prisma/client";
// Relative, not "@/": this module also runs under tsx from scripts/.
import { validatePassword } from "../password-policy";
import { mayUsePassword } from "../auth/local-login";

export type PasswordTarget = {
  id: string;
  name: string;
  email: string;
  role: Role;
  hasPassword: boolean;
};

export type LookupResult = { ok: true; user: PasswordTarget } | { ok: false; error: string };

/** The account a reset would touch, or why it may not be touched. */
export async function findPasswordTarget(db: PrismaClient, email: string): Promise<LookupResult> {
  const user = await db.user.findUnique({
    where: { email: email.trim() },
    select: { id: true, name: true, email: true, role: true, is_active: true, password: true },
  });
  if (!user) return { ok: false, error: `Tidak ada akun dengan email ${email.trim()}.` };
  if (!user.is_active) {
    return { ok: false, error: "Akun ini nonaktif. Aktifkan dulu lewat portal admin bila memang boleh dipakai lagi." };
  }
  // Customers cannot sign in to this application at all; a password would
  // open nothing, and changing a customer's credentials is not staff work.
  if (user.role === "Customer") {
    return { ok: false, error: "Akun ini bertipe Customer. Skrip ini hanya untuk akun staf." };
  }
  return {
    ok: true,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, hasPassword: user.password !== null },
  };
}

/**
 * Whether the password can actually be used to sign in under the current
 * LOCAL_LOGIN setting — a warning for the terminal, not a refusal.
 */
export function passwordUsableNow(user: Pick<PasswordTarget, "email" | "role">, env = process.env): boolean {
  return mayUsePassword({ email: user.email, role: user.role }, env);
}

export type SetResult = { ok: true } | { ok: false; error: string };

export async function setPassword(db: PrismaClient, userId: string, password: string): Promise<SetResult> {
  const problem = validatePassword(password);
  if (problem) return { ok: false, error: problem };
  // Conditional on the row still being an active staff account, so a change
  // made in the portal between the lookup and the write is not overridden.
  const { count } = await db.user.updateMany({
    where: { id: userId, is_active: true, role: { not: "Customer" } },
    data: { password: await bcrypt.hash(password, 12) },
  });
  if (count === 0) return { ok: false, error: "Akun berubah sejak dicari (dinonaktifkan atau dihapus). Tidak ada yang ditulis." };
  return { ok: true };
}
