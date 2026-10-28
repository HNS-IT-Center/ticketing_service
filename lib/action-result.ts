/**
 * The error message a server action returned, if it returned one.
 *
 * The actions answer `{ error: string }` on failure and something else (or
 * nothing) on success. Forms used to read that with `(result as any)?.error`;
 * this is the same check with a type.
 */
export function errorOf(result: unknown): string | undefined {
  if (result && typeof result === "object" && "error" in result && typeof result.error === "string" && result.error) {
    return result.error;
  }
  return undefined;
}
