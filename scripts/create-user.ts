/**
 * Interactive single-user creation, for production and staging.
 *
 * This exists because `npm run seed` must never touch a real database. The seed
 * writes six accounts with published passwords (`admin123`, `tech123`,
 * `sales123`, `rma123`) and, worse, its `upsert` sets the password in the
 * `update` branch too — so running it against an environment that already has
 * `admin@techserve.id` resets that administrator's password to `admin123` and
 * reactivates the account.
 *
 * This script creates exactly one user, refuses to overwrite an existing one,
 * and makes you type the password rather than shipping one.
 *
 *   npm run create-user
 *
 * TLS: it uses the same connection settings as lib/db.ts. Do NOT run it with
 * NODE_TLS_REJECT_UNAUTHORIZED=0 — that switch is process-wide and disables
 * certificate verification for every outbound TLS connection, not just
 * Postgres. It also buys nothing here, because the Postgres connection already
 * passes `rejectUnauthorized: false` for the Supabase pooler's self-signed
 * chain.
 */
import { PrismaClient, type Role } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import bcrypt from "bcryptjs";
import { config } from "dotenv";
import { mariadbPoolConfig, MARIADB_ADAPTER_OPTIONS } from "../lib/mariadb";
import { validatePassword } from "../lib/password-policy";
import { createPrompt, databaseHost } from "./lib/prompt";

config({ path: ".env.local" });

// Same settings as lib/db.ts, from the one module both share — including the
// forced strict sql_mode, without which this script would silently write a
// truncated name or address against the Hostinger server.
const adapter = new PrismaMariaDb(mariadbPoolConfig(), MARIADB_ADAPTER_OPTIONS);
const db = new PrismaClient({ adapter });

const { ask, askSecret, askValidated, close } = createPrompt();

const ROLES: Role[] = ["RMA", "Administrator", "Technician", "Sales", "Customer"];

function validateEmail(value: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "Email tidak valid.";
  return null;
}

function validatePhone(value: string): string | null {
  // Project convention: stored as +62XXXXXXXXX — see CLAUDE.md.
  if (!/^\+62\d{8,13}$/.test(value)) {
    return "Nomor harus format +62XXXXXXXXX (8-13 digit setelah +62).";
  }
  return null;
}

async function main() {
  const host = databaseHost();

  console.log("\n─── Buat satu user ───────────────────────────────────────────");
  console.log(`Database : ${host}`);
  console.log("Skrip ini TIDAK menimpa user yang sudah ada.\n");

  const role = (await askValidated(
    `Role (${ROLES.join(" / ")})`,
    (v) => (ROLES.includes(v as Role) ? null : `Role harus salah satu dari: ${ROLES.join(", ")}`),
    { fallback: "RMA" },
  )) as Role;

  const email = await askValidated("Email", (v) => validateEmail(v));

  const existing = await db.user.findUnique({
    where: { email },
    select: { id: true, role: true, is_active: true },
  });
  if (existing) {
    console.error(
      `\n✗ Email ${email} sudah dipakai (role ${existing.role}, ` +
        `${existing.is_active ? "aktif" : "nonaktif"}).`,
    );
    console.error("  Skrip ini sengaja menolak menimpa. Ubah lewat portal admin.");
    process.exitCode = 1;
    return;
  }

  const name = await askValidated("Nama lengkap", (v) =>
    v.length >= 2 ? null : "Nama minimal 2 karakter.",
  );
  const phone = await askValidated("Nomor WhatsApp (+62...)", (v) => validatePhone(v));
  const address = await askValidated("Alamat", (v) =>
    v.length >= 3 ? null : "Alamat tidak boleh kosong.",
  );

  let password = "";
  for (;;) {
    password = await askValidated("Password", (v) => validatePassword(v), { secret: true });
    const again = await askSecret("Ulangi password");
    if (password === again) break;
    console.error("  ✗ Password tidak sama. Ulangi.");
  }

  console.log("\n─── Konfirmasi ───────────────────────────────────────────────");
  console.log(`  Nama     : ${name}`);
  console.log(`  Email    : ${email}`);
  console.log(`  Role     : ${role}`);
  console.log(`  WhatsApp : ${phone}`);
  console.log(`  Alamat   : ${address}`);
  console.log(`  Database : ${host}`);

  const confirm = await ask("\nBuat user ini? ketik 'ya' untuk lanjut", "tidak");
  if (confirm.toLowerCase() !== "ya") {
    console.log("Dibatalkan. Tidak ada yang ditulis.");
    return;
  }

  const user = await db.user.create({
    data: {
      name,
      email,
      phone_number: phone,
      address,
      role,
      password: await bcrypt.hash(password, 12),
    },
    select: { id: true, email: true, role: true },
  });

  console.log(`\n✅ Dibuat: ${user.email} (${user.role}), id ${user.id}`);
  console.log("   Password tidak dicetak dan tidak disimpan di mana pun selain hash di DB.");
}

main()
  .catch((err) => {
    console.error("\n✗ Gagal:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    close();
    await db.$disconnect();
  });
