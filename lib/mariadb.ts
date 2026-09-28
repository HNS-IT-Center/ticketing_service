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
