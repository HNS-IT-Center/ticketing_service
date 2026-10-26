/**
 * The password rule for accounts set up from the command line —
 * `npm run create-user` and `npm run set-password`.
 *
 * One copy, so the two scripts cannot drift apart. It is stricter than the
 * admin form's eight-character minimum on purpose: these scripts run against
 * production, usually for an administrator.
 */

/** Passwords this project has published in its own docs and seed. */
export const KNOWN_WEAK = [
  "admin123",
  "tech123",
  "sales123",
  "rma123",
  "customer123",
  "password",
  "12345678",
];

export const MIN_SCRIPT_PASSWORD_LENGTH = 12;

/** Null when acceptable, otherwise the reason in words for the terminal. */
export function validatePassword(value: string): string | null {
  // Checked before the length rule: every published password is short, so the
  // length message would otherwise always win and this list would never speak.
  if (KNOWN_WEAK.includes(value.toLowerCase())) {
    return "Password itu ada di seed/dokumentasi repo ini. Pakai yang lain.";
  }
  if (value.length < MIN_SCRIPT_PASSWORD_LENGTH) {
    return `Password minimal ${MIN_SCRIPT_PASSWORD_LENGTH} karakter.`;
  }
  if (!/[a-z]/.test(value) || !/[A-Z]/.test(value) || !/\d/.test(value)) {
    return "Password harus memuat huruf kecil, huruf besar, dan angka.";
  }
  return null;
}
