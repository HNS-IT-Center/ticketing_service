import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";
import * as path from "path";

// Ensure .env.local is loaded
config({ path: path.join(process.cwd(), ".env.local") });

async function main() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
    ssl: { rejectUnauthorized: false },
  });
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
