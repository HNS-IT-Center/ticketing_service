import "server-only";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * TLS settings for the Postgres connection.
 *
 * Leaving DATABASE_SSL unset keeps the exact production behaviour: TLS on with
 * certificate verification off, because the Supabase session pooler serves a
 * self-signed chain.
 *
 * Set DATABASE_SSL=false for a local Postgres container, which speaks plain TCP
 * — node-pg otherwise aborts the handshake with "The server does not support
 * SSL connections".
 */
function resolveSsl(): { rejectUnauthorized: boolean } | false {
  return process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false };
}

function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
    ssl: resolveSsl(),
  });

  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
