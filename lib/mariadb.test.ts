/**
 * Guards on the MariaDB connection settings.
 *
 * These exist because the failure they prevent **cannot be reproduced against
 * the local test database.** That is not a gap in the fixtures; it is a
 * difference between the two servers, measured with `SELECT COLLATION(?)`:
 *
 *              text protocol          binary protocol
 *   local      utf8mb4_unicode_ci     utf8mb4_unicode_ci   ← agree
 *   Hostinger  utf8mb4_unicode_ci     utf8mb4_general_ci   ← disagree
 *
 * Prisma renders `contains` as `col LIKE CONCAT('%', ?, '%')`. Where the two
 * protocols disagree, that expression mixes collations and MariaDB refuses it
 * with error 1267, taking every search box in the application with it — admin
 * tickets, users, logs, RMA logs, sales and technician lists. Locally all of it
 * passes, because there is nothing to disagree about.
 *
 * `useTextProtocol` avoids the bound parameter entirely. A behavioural test
 * cannot pin that down here, so these read the source instead: blunt, but they
 * fail loudly if someone removes the option to "use prepared statements", which
 * reads like an optimisation and is a production outage.
 *
 * The strict sql_mode guard is here for the same shape of reason: the local
 * container is strict by default and the server is not, so dropping the
 * override breaks nothing locally and silently truncates data in production.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { MARIADB_ADAPTER_OPTIONS, STRICT_SESSION_SQL, mariadbPoolConfig } from "./mariadb";

/** Every entry point that builds its own Prisma client. */
const ENTRY_POINTS = [
  "lib/db.ts",
  "prisma/seed.ts",
  "prisma/seed-admin.ts",
  "prisma/restore-admin.ts",
  "scripts/create-user.ts",
  "scripts/migrate-to-r2.ts",
  "scratch/update_upgrades.ts",
];

describe("MariaDB adapter options", () => {
  it("uses the text protocol", () => {
    expect(MARIADB_ADAPTER_OPTIONS.useTextProtocol).toBe(true);
  });

  it("forces strict sql_mode on every connection", () => {
    expect(STRICT_SESSION_SQL).toContain("STRICT_TRANS_TABLES");
  });

  it("puts the strict statement on the pool as initSql", () => {
    process.env.DATABASE_URL ??= "mysql://u:p@127.0.0.1:3306/d";
    expect(mariadbPoolConfig().initSql).toBe(STRICT_SESSION_SQL);
  });

  it("does not turn TLS on by default", () => {
    // Both targets speak plain TCP: the local container, and Hostinger through
    // an SSH tunnel. Defaulting to TLS would break every normal setup.
    const before = process.env.DATABASE_SSL;
    delete process.env.DATABASE_SSL;
    expect(mariadbPoolConfig().ssl).toBeUndefined();
    if (before !== undefined) process.env.DATABASE_SSL = before;
  });
});

describe("every Prisma entry point shares those settings", () => {
  let sources: Record<string, string>;

  beforeAll(async () => {
    sources = Object.fromEntries(
      await Promise.all(
        ENTRY_POINTS.map(async (f) => [
          f,
          await readFile(path.join(process.cwd(), f), "utf8"),
        ]),
      ),
    );
  });

  it.each(ENTRY_POINTS)("%s passes MARIADB_ADAPTER_OPTIONS", (file) => {
    expect(sources[file]).toContain("MARIADB_ADAPTER_OPTIONS");
  });

  it.each(ENTRY_POINTS)("%s builds its pool from mariadbPoolConfig()", (file) => {
    expect(sources[file]).toContain("mariadbPoolConfig()");
  });

  it.each(ENTRY_POINTS)("%s no longer constructs its own connection settings", (file) => {
    // A hand-rolled `connectionString` here would skip initSql and the text
    // protocol, which is exactly how the settings drifted apart before.
    expect(sources[file]).not.toContain("connectionString:");
  });

  it.each(ENTRY_POINTS)("%s does not use the PostgreSQL adapter", (file) => {
    expect(sources[file]).not.toContain("PrismaPg");
  });
});
