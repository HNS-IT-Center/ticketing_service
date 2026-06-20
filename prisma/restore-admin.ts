/**
 * restore-admin.ts
 * Emergency script to restore / re-create the admin account.
 * Run with: $env:NODE_TLS_REJECT_UNAUTHORIZED="0"; npx tsx prisma/restore-admin.ts
 */
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
  const ADMIN_EMAIL = "admin@techserve.id";
  const ADMIN_PASSWORD = "admin123";

  console.log("🔧 Restoring admin account...");

  const hashed = await bcrypt.hash(ADMIN_PASSWORD, 12);

  // Try to find by the original email first
  let admin = await db.user.findUnique({ where: { email: ADMIN_EMAIL } });

  if (admin) {
    // Account exists and is active — nothing to do
    if (admin.is_active) {
      console.log("✅ Admin account is already active. Try logging in with:");
      console.log(`   Email:    ${ADMIN_EMAIL}`);
      console.log(`   Password: ${ADMIN_PASSWORD}`);
      return;
    }

    // Account exists but is deactivated — reactivate it
    await db.user.update({
      where: { id: admin.id },
      data: {
        is_active: true,
        email: ADMIN_EMAIL,
        password: hashed,
      },
    });
    console.log("✅ Admin account reactivated!");
  } else {
    // Original email was scrambled — search by role as fallback
    const deactivatedAdmin = await db.user.findFirst({
      where: {
        role: "Administrator",
        is_active: false,
        email: { contains: "__deleted__" },
      },
      orderBy: { created_at: "asc" }, // restore the oldest admin
    });

    if (deactivatedAdmin) {
      await db.user.update({
        where: { id: deactivatedAdmin.id },
        data: {
          is_active: true,
          email: ADMIN_EMAIL,
          name: "Admin TechServe",
          password: hashed,
        },
      });
      console.log("✅ Deactivated admin account found and restored!");
    } else {
      // No admin found at all — create a fresh one
      await db.user.create({
        data: {
          name: "Admin TechServe",
          email: ADMIN_EMAIL,
          phone_number: "+6281200000001",
          address: "Jl. Teknologi No. 1, Jakarta",
          role: "Administrator",
          password: hashed,
          is_active: true,
        },
      });
      console.log("✅ Fresh admin account created!");
    }
  }

  console.log("\n🎉 Done! Login credentials:");
  console.log(`   Email:    ${ADMIN_EMAIL}`);
  console.log(`   Password: ${ADMIN_PASSWORD}`);
}

main()
  .catch((e) => { console.error("❌ Error:", e); process.exit(1); })
  .finally(() => db.$disconnect());
