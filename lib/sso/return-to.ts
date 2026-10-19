/**
 * Where to send the user after signing in — only ever a path on this site.
 *
 * `return_to` arrives in a query string anyone can write, so anything that is
 * not a plain relative path is dropped rather than followed: `//evil.example`
 * and `/\evil.example` are protocol-relative in browsers, and an absolute URL
 * or a `javascript:` scheme would be an open redirect.
 */
export function safeReturnTo(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!v.startsWith("/")) return null;
  if (v.startsWith("//") || v.startsWith("/\\")) return null;
  if (/[\u0000-\u001f\u007f]/.test(v)) return null;
  // Signing in again from the sign-in pages would only loop.
  if (v.startsWith("/login") || v.startsWith("/auth/")) return null;
  return v.length > 512 ? null : v;
}
