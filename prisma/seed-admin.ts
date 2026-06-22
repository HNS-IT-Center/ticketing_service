import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { config } from "dotenv";

config({ path: ".env.local" });

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
  ssl: { rejectUnauthorized: false },
});
const db = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Wiping database and seeding Admin only...");

  // Optional: clear out existing data if you want to be completely sure it's empty
  // (Usually `db push --force-reset` handles this, but just in case)

  const hash = (p: string) => bcrypt.hash(p, 12);

  // ─── Admin ─────────────────────────────────────────────────────────────
  const admin = await db.user.upsert({
    where: { email: "admin@techserve.id" },
    update: {
      is_active: true,
      password: await hash("admin123"),
    },
    create: {
      name: "Admin TechServe",
      email: "admin@techserve.id",
      phone_number: "+6281200000001",
      address: "Jl. Teknologi No. 1, Jakarta",
      role: "Administrator",
      password: await hash("admin123"),
    },
  });
  console.log("✅ Admin:", admin.email);

  // ─── Upgrades (Required for Ticket Creation Form to work properly) ─────
  const upgradeItems = [
    { name: "RAM Upgrade", points: 2 },
    { name: "SSD Upgrade", points: 2 },
    { name: "GPU Upgrade", points: 3 },
    { name: "CPU Upgrade", points: 4 },
    { name: "PSU Upgrade", points: 2 },
    { name: "Cooling Upgrade", points: 2 },
    { name: "Casing Upgrade", points: 2 },
    { name: "ARGB Configuration", points: 2 },
  ];

  for (const u of upgradeItems) {
    await db.upgrade.upsert({
      where: { name: u.name },
      update: {},
      create: u,
    });
  }
  console.log("✅ Upgrades seeded");

  console.log("\n🎉 Seed complete! Login credentials:");
  console.log("  Admin:      admin@techserve.id    / admin123");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
