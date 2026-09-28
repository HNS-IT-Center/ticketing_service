/**
 * Connection settings for MariaDB, in one place.
 *
 * Three entry points open their own pool — `lib/db.ts` (the app),
 * `prisma/seed.ts` and `scripts/create-user.ts` — and each needs identical
 * settings. Kept here rather than copied three times, because a copy that
 * drifts is how this project ended up with four disagreeing point tables.
 *
 * Deliberately free of `server-only`: the two scripts are plain Node processes
 * and cannot import a module marked that way.
 */

/**
 * Session settings applied to every new pooled connection.
 *
 * The Hostinger server runs WITHOUT strict mode — verified 2026-09-27, its
 * sql_mode is `IGNORE_SPACE,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION`. In that
 * mode MariaDB silently truncates a string that exceeds its column, turns an
 * invalid date into '0000-00-00', and fills a missing NOT NULL column with a
 * default instead of failing.
 *
 * PostgreSQL rejected all three with an error. That rejection was the last line
 * of defence under the application's own validation, and porting to MariaDB
 * would have removed it without a single visible symptom.
 *
 * Forced from the client rather than requested from the host: sql_mode is a
 * server-wide setting on shared hosting and not ours to change. Set per
 * connection, it also keeps the local container (strict by default) and the
 * server behaving identically, so the test suite cannot pass under rules the
 * server does not enforce.
 */
export const STRICT_SESSION_SQL =
  "SET SESSION sql_mode='STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'";

/**
 * Adapter options shared by every entry point.
 *
 * `useTextProtocol` makes the driver send values inline (escaped) with
 * `query()` instead of binding them through a server-side prepared statement
 * with `execute()`. It is not a preference — without it, every search box in
 * the application fails against the Hostinger server:
 *
 *   Code 1267: Illegal mix of collations
 *   (utf8mb4_unicode_ci,IMPLICIT) and (utf8mb4_bin,NONE) for operation 'like'
 *
 * Prisma renders `contains` as `col LIKE CONCAT('%', ?, '%')`. The `'%'`
 * literals take the connection collation; the bound parameter does not, and the
 * two servers disagree about what it takes instead. Measured with
 * `SELECT COLLATION(?)` on both:
 *
 *              text protocol          binary protocol
 *   local      utf8mb4_unicode_ci     utf8mb4_unicode_ci   ← agree
 *   Hostinger  utf8mb4_unicode_ci     utf8mb4_general_ci   ← disagree
 *
 * So the LIKE compares two different collations and MariaDB refuses. `equals`
 * and `orderBy` are unaffected, which is why the failure is narrow and easy to
 * miss: only `contains`, `startsWith` and `endsWith` break.
 *
 * The local container cannot reproduce this — its two protocols agree — so no
 * amount of local testing would have caught it. It was found by running the
 * real Prisma client against the real server before deploying, and that is the
 * reason to keep doing so.
 *
 * Applied everywhere rather than only in production: a setting that differs
 * between the test database and the real one is what created this gap in the
 * first place.
 *
 * Trade-off accepted: no server-side statement cache. Values are still escaped
 * by the driver, so this is not a SQL-injection surface.
 */
export const MARIADB_ADAPTER_OPTIONS = { useTextProtocol: true } as const;

/**
 * TLS for the MariaDB connection.
 *
 * Opt-in, which inverts what DATABASE_SSL meant under PostgreSQL. There it was
 * left unset for Supabase, whose pooler always speaks TLS. Both MariaDB targets
 * here speak plain TCP — the local container, and Hostinger reached through an
 * SSH tunnel, where the tunnel already provides the encryption — so defaulting
 * to TLS would break every normal setup.
 *
 * Set DATABASE_SSL=true only for a MariaDB server that genuinely terminates TLS.
 */
function resolveSsl(): { rejectUnauthorized: boolean } | undefined {
  return process.env.DATABASE_SSL === "true"
    ? { rejectUnauthorized: false }
    : undefined;
}

/**
 * Unpacks DATABASE_URL into a pool config.
 *
 * The adapter also accepts a bare connection string, but a string leaves no
 * room for `initSql`, and that is where strict mode is turned on.
 *
 * Credentials are percent-decoded: a password containing `@`, `/`, `?` or `#`
 * is only legal in a URL when escaped, and forwarding it still escaped fails
 * authentication with a misleading "access denied" that points at the password
 * being wrong rather than at the encoding.
 */
export function mariadbPoolConfig() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set.");

  const url = new URL(raw);
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    ssl: resolveSsl(),
    initSql: STRICT_SESSION_SQL,
  };
}
