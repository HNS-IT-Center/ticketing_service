import "server-only";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { mariadbPoolConfig, MARIADB_ADAPTER_OPTIONS } from "./mariadb";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  // Connection settings, including the forced strict sql_mode, live in
  // lib/mariadb.ts — shared with prisma/seed.ts and scripts/create-user.ts so
  // the three cannot drift apart.
  const adapter = new PrismaMariaDb(mariadbPoolConfig(), MARIADB_ADAPTER_OPTIONS);

  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
