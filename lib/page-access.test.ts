import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";

/**
 * Since the RBAC change the proxy lets any staff member into /admin, /rma,
 * /stok, /finance and /logs (lib/routes.ts); the page itself decides. So a
 * page there without a check would be open to every staff member — this reads
 * the source of each one and fails the build instead.
 */
const ROOT = join(__dirname, "..");
const SHARED = ["app/admin", "app/rma", "app/stok", "app/finance", "app/logs"];
const GUARDS = /\b(requirePage|pageSession|requireRole|requireStoreViewer)\(/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/** A client page cannot check on the server; its own folder's layout must. */
function guardedByLayout(file: string): boolean {
  const layout = join(dirname(file), "layout.tsx");
  return existsSync(layout) && GUARDS.test(readFileSync(layout, "utf-8"));
}

describe("every page under a shared prefix checks who may open it", () => {
  const files = SHARED.flatMap((d) => walk(join(ROOT, d))).filter((f) => /[\\/](page\.tsx|route\.ts)$/.test(f));

  it("finds the pages", () => {
    expect(files.length).toBeGreaterThan(40);
  });

  it.each(files.map((f) => relative(ROOT, f).replace(/\\/g, "/")))("%s", (file) => {
    const src = readFileSync(join(ROOT, file), "utf-8");
    expect(GUARDS.test(src) || guardedByLayout(join(ROOT, file)), `${file} has no requirePage / pageSession / requireRole`).toBe(true);
  });

  it("does not let Sales into the administrator's pages through an old role list", () => {
    for (const f of files) {
      const src = readFileSync(f, "utf-8");
      if (!/[\\/]app[\\/]admin[\\/]/.test(f)) continue;
      expect(src, relative(ROOT, f)).not.toMatch(/requireRole\([^)]*"Sales"/);
    }
  });
});
