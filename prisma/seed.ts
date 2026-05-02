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
  console.log("🌱 Seeding database...");

  const hash = (p: string) => bcrypt.hash(p, 12);

  // ─── Admin ─────────────────────────────────────────────────────────────
  const admin = await db.user.upsert({
    where: { email: "admin@techserve.id" },
    update: {},
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

  // ─── Technicians ───────────────────────────────────────────────────────
  const techData = [
    { name: "Budi Santoso", email: "budi@techserve.id", shift: "morning", days: ["Mon","Tue","Wed","Thu","Fri"] },
    { name: "Siti Rahayu", email: "siti@techserve.id", shift: "noon", days: ["Mon","Wed","Fri","Sat"] },
    { name: "Agus Pratama", email: "agus@techserve.id", shift: "morning", days: ["Tue","Thu","Sat","Sun"] },
  ];

  for (const t of techData) {
    const tech = await db.user.upsert({
      where: { email: t.email },
      update: {},
      create: {
        name: t.name,
        email: t.email,
        phone_number: `+62812000000${techData.indexOf(t) + 10}`,
        address: "Jl. Servis No. 5, Jakarta",
        role: "Technician",
        shift: t.shift as any,
        work_days: t.days,
        password: await hash("tech123"),
      },
    });

    await db.technicianWorkload.upsert({
      where: { technician_id: tech.id },
      update: {},
      create: { technician_id: tech.id, current_points: 0, max_points: 7 },
    });

    await db.technicianPerformance.upsert({
      where: { technician_id: tech.id },
      update: {},
      create: { technician_id: tech.id },
    });

    console.log("✅ Technician:", tech.email);
  }

  // ─── Sales ─────────────────────────────────────────────────────────────
  const sales = await db.user.upsert({
    where: { email: "sales@techserve.id" },
    update: {},
    create: {
      name: "Sales TechServe",
      email: "sales@techserve.id",
      phone_number: "+6281200000020",
      address: "Jl. Penjualan No. 3, Jakarta",
      role: "Sales",
      password: await hash("sales123"),
    },
  });
  console.log("✅ Sales:", sales.email);

  // ─── Customer ──────────────────────────────────────────────────────────
  const customer = await db.user.upsert({
    where: { email: "customer@example.com" },
    update: {},
    create: {
      name: "John Doe",
      email: "customer@example.com",
      phone_number: "+6281200000099",
      address: "Jl. Pelanggan No. 10, Jakarta",
      role: "Customer",
      password: await hash("customer123"),
    },
  });
  console.log("✅ Customer:", customer.email);

  // ─── Upgrades ──────────────────────────────────────────────────────────
  const upgradeItems = [
    { name: "RAM Upgrade", points: 2 },
    { name: "SSD Upgrade", points: 2 },
    { name: "GPU Upgrade", points: 3 },
    { name: "CPU Upgrade", points: 4 },
    { name: "PSU Upgrade", points: 2 },
    { name: "Cooling Upgrade", points: 2 },
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
  console.log("  Technician: budi@techserve.id     / tech123");
  console.log("  Sales:      sales@techserve.id    / sales123");
  console.log("  Customer:   customer@example.com  / customer123");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
