import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { mariadbPoolConfig, MARIADB_ADAPTER_OPTIONS } from "../lib/mariadb";
import { config } from "dotenv";
import * as path from "path";

// Ensure .env.local is loaded
config({ path: path.join(process.cwd(), ".env.local") });

async function main() {
  const adapter = new PrismaMariaDb(mariadbPoolConfig(), MARIADB_ADAPTER_OPTIONS);
  const prisma = new PrismaClient({ adapter });

  console.log("Upserting new upgrades...");

  const upgrades = [
    { name: "Casing Upgrade", points: 2 },
    { name: "ARGB Configuration", points: 2 },
  ];

  for (const upgrade of upgrades) {
    await prisma.upgrade.upsert({
      where: { name: upgrade.name },
      update: {},
      create: upgrade,
    });
    console.log(`- ${upgrade.name}`);
  }

  console.log("Done.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
