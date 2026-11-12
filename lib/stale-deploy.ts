/**
 * "Server Action … was not found on the server" (2026-11-12, a phone that had
 * the create form open across a deploy): every build gives each server action
 * a new id, so a page loaded before the deploy calls an id the new server does
 * not know. Nothing was saved; reloading fixes it. Raw, the message reads like
 * a crash — so it is recognised here and the page shows the reason instead.
 *
 * Client-safe: no imports.
 */
export const STALE_DEPLOY_EVENT = "hns:stale-deploy";

export function isStaleDeployError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  return /Server Action .* was not found on the server|Failed to find Server Action/i.test(message);
}

/** Opens the app-wide notice (components/app/StaleDeployNotice.tsx). */
export function announceStaleDeploy(reason: "rejected" | "new_version" = "rejected"): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(STALE_DEPLOY_EVENT, { detail: reason }));
}
