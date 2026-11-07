/**
 * Whether an error caught around a server action call is Next moving the page
 * rather than a failure.
 *
 * When an action redirects — the login ran out, so it sends the browser to
 * "Sesi Anda telah berakhir. Silakan masuk lagi." — Next rejects the action's
 * promise with its redirect signal while it navigates. A catch that turned
 * every rejection into "Pengiriman gagal, kemungkinan koneksi terputus" showed
 * that toast on top of the sign-in page (2026-11-07). The page is already
 * leaving; there is nothing to report.
 *
 * Client-safe: reads only the error's `digest`, which is how Next marks its own
 * signals (`NEXT_REDIRECT;…`, `NEXT_HTTP_ERROR_FALLBACK;404` for notFound).
 */
export function isNavigationSignal(err: unknown): boolean {
  if (typeof err !== "object" || err === null || !("digest" in err)) return false;
  const digest = (err as { digest?: unknown }).digest;
  return typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK"));
}
