/**
 * Which pages ignore the staff member's theme and stay light: the invoice
 * (printed for the cashier) and the customer's own ticket page — the short
 * link /t/{code} and the older /{yyyy-mm-dd}/{token}. Pure, so it is tested.
 */
export function forcesLightTheme(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return /^\/(faktur|t)(\/|$)/.test(pathname) || /^\/\d{4}-\d{2}-\d{2}(\/|$)/.test(pathname);
}
