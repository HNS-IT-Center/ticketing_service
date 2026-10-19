/**
 * Who may still sign in with a password once HNS SSO is in place.
 *
 * Pure: reads only the two environment variables it is given, so the rule is
 * unit tested and every caller — the login action, the login page, the session
 * check — agrees on it.
 *
 * `LOCAL_LOGIN=all` (the default) keeps today's behaviour, so this code can be
 * deployed before the app is registered with SSO and before accounts are
 * linked. Switching to `break-glass` is the go-live step: from then on only the
 * emergency administrator accounts listed in `BREAK_GLASS_EMAILS` may use a
 * password, and every other staff password session ends on its next request.
 */

export type LocalLoginMode = "all" | "break-glass";

export function localLoginMode(env: NodeJS.ProcessEnv = process.env): LocalLoginMode {
  return env.LOCAL_LOGIN?.trim().toLowerCase() === "break-glass" ? "break-glass" : "all";
}

export function breakGlassEmails(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.BREAK_GLASS_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Whether this account may hold a password session. Break-glass accounts must
 * also be administrators: the point of the exception is getting an admin in
 * while SSO is down, not keeping a technician off SSO.
 */
export function mayUsePassword(
  user: { email: string; role: string },
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (localLoginMode(env) === "all") return true;
  return (
    user.role === "Administrator" &&
    breakGlassEmails(env).includes(user.email.trim().toLowerCase())
  );
}
