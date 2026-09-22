/**
 * Test-run guard.
 *
 * Integration tests create, mutate and delete rows. Nothing in this suite may
 * ever touch a remote database, so the run aborts before a single test loads if
 * DATABASE_URL points anywhere other than this machine.
 *
 * Production data is never copied into the local database either — the local
 * Postgres container starts empty and is filled by `npm run seed`, and each
 * integration test builds and tears down its own fixtures.
 */
import { config } from "dotenv";

config({ path: ".env.local" });

const LOCAL_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "[::1]",
  "host.docker.internal",
]);

/**
 * Pull the host out of a Postgres connection string.
 *
 * `new URL()` handles the normal case, but a password containing unescaped
 * characters can make it throw, so fall back to a regex rather than silently
 * letting an unparseable URL through the guard.
 */
function extractHost(connectionString: string): string | null {
  try {
    const parsed = new URL(connectionString);
    if (parsed.hostname) return parsed.hostname.replace(/^\[|\]$/g, "");
  } catch {
    // fall through to the regex
  }
  const match = connectionString.match(/@([^/?#]+)/);
  if (!match) return null;
  const authority = match[1];
  // strip the port, keeping bracketed IPv6 literals intact
  const host = authority.startsWith("[")
    ? authority.slice(1, authority.indexOf("]"))
    : authority.split(":")[0];
  return host || null;
}

const url = process.env.DATABASE_URL;

if (url) {
  const host = extractHost(url);

  if (host === null) {
    throw new Error(
      "DATABASE_URL is set but its host could not be parsed. Refusing to run tests " +
        "rather than risk connecting to a remote database."
    );
  }

  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `Refusing to run tests against a non-local database (host: ${host}).\n` +
        "Tests create and delete rows and must never run against Supabase or any\n" +
        "other shared database. Point DATABASE_URL at a local Postgres container:\n\n" +
        '  DATABASE_URL="postgresql://postgres:devpass@127.0.0.1:5433/ticketing"\n' +
        "  DATABASE_SSL=false\n"
    );
  }
}
