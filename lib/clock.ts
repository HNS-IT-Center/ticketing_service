/**
 * The request's clock, for server components. A server component renders once
 * per request, so reading the clock there is safe — but `react-hooks/purity`
 * cannot tell a server component from a client one. Read it once, at the top of
 * the page, and pass the number down; never call this from a client component,
 * where a re-render would read a different time (the H8 hydration fault).
 */
export function requestNow(): number {
  return Date.now();
}
