import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * The id of the build this server runs, from `.next/BUILD_ID` (present in the
 * standalone output too). Null when it cannot be read — the version check then
 * stays silent rather than guessing.
 */
let cached: string | null | undefined;
export function currentBuildId(): string | null {
  if (cached !== undefined) return cached;
  try {
    cached = readFileSync(path.join(process.cwd(), ".next", "BUILD_ID"), "utf8").trim() || null;
  } catch {
    cached = null;
  }
  return cached;
}
