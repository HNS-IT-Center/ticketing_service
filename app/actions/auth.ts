"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import * as oidc from "openid-client";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { destinationForRoleName } from "@/lib/routes";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { createSession, deleteSession } from "@/lib/session";
import { decrypt, SESSION_COOKIE } from "@/lib/session-token";
import { mayUsePassword } from "@/lib/auth/local-login";
import { getSsoConfig, ssoEnv } from "@/lib/sso/config";
import { revokeSsoSession } from "@/lib/sso/sso-session";

// ─── Schemas ───────────────────────────────────────────────────────────────

const LoginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
  rememberMe: z.boolean().optional(),
});

export type FormState = {
  errors?: Record<string, string[]>;
  message?: string;
  rememberMe?: boolean;
} | undefined;

// ─── Register ──────────────────────────────────────────────────────────────
// Registration for customers is disabled in Phase 3.
// Admins create staff accounts directly.

// ─── Login ─────────────────────────────────────────────────────────────────

export async function loginAction(
  state: FormState,
  formData: FormData
): Promise<FormState> {
  const raw = {
    email: formData.get("email"),
    password: formData.get("password"),
    rememberMe: formData.get("rememberMe") === "on",
  };

  const validated = LoginSchema.safeParse(raw);
  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors, rememberMe: raw.rememberMe };
  }

  const { email, password, rememberMe } = validated.data;

  let user;
  try {
    user = await db.user.findUnique({ where: { email: email as string } });
  } catch (err) {
    console.error("[loginAction] DB error:", err);
    return {
      message: "A server error occurred. Please try again later.",
      rememberMe,
    };
  }

  if (!user || !user.password) {
    return { message: "Invalid email or password", rememberMe };
  }

  const passwordMatch = await bcrypt.compare(password as string, user.password);

  if (!passwordMatch) {
    return { message: "Invalid email or password", rememberMe };
  }

  // Guard: deactivated accounts cannot log in
  if (!user.is_active) {
    return { message: "This account has been deactivated. Please contact an administrator.", rememberMe };
  }

  // Once LOCAL_LOGIN=break-glass, staff sign in through HNS SSO; only the
  // listed emergency administrators may still use a password.
  if (!mayUsePassword({ email: user.email, role: user.role })) {
    return {
      message: "Login dengan password sudah dinonaktifkan. Gunakan tombol \"Masuk dengan SSO HNS\".",
      rememberMe,
    };
  }

  try {
    await createSession(user.id, user.role, user.name, rememberMe);
  } catch (err) {
    console.error("[loginAction] createSession error:", err);
    return {
      message: "Failed to create session. Please check server configuration.",
      rememberMe,
    };
  }

  // Redirect based on role.
  // NOTE: redirect() throws a special Next.js error (NEXT_REDIRECT) — this is intentional.
  // It must NOT be inside a try/catch that re-throws generic errors.
  // Destination comes from lib/routes.ts so every entry point agrees on it.
  const destination = destinationForRoleName(user.role);
  if (!destination.allowed) {
    await deleteSession();
    return { message: destination.reason, rememberMe };
  }
  redirect(destination.dashboard);
}

// ─── Logout ────────────────────────────────────────────────────────────────

/**
 * Sign out. A server action, so Next's own origin check stands in for CSRF
 * protection.
 *
 * The local session goes first, whatever happens next. For an SSO session the
 * server-side record is revoked too, and the browser is sent to SSO's end
 * session endpoint with the id_token as hint, which ends the SSO session and
 * returns to the registered post-logout URI. If SSO cannot be reached the user
 * is still signed out of this app.
 */
export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  const payload = await decrypt(cookieStore.get(SESSION_COOKIE)?.value);
  await deleteSession();
  revalidatePath("/", "layout");

  let endSessionUrl: string | null = null;
  if (payload?.sso) {
    const row = await db.ssoSession.findUnique({
      where: { id: payload.sso },
      select: { id_token: true },
    });
    await revokeSsoSession(payload.sso, "logout");
    const env = ssoEnv();
    if (row && env) {
      try {
        const config = await getSsoConfig();
        endSessionUrl = oidc.buildEndSessionUrl(config, {
          id_token_hint: row.id_token,
          post_logout_redirect_uri: env.postLogoutRedirectUri,
        }).href;
      } catch (err) {
        console.error("[SSO LOGOUT ERROR]", err);
      }
    }
  }

  // redirect() throws; kept outside the try above so it is never swallowed.
  redirect(endSessionUrl ?? "/login");
}
