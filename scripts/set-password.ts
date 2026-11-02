/**
 * Give an existing staff account a new password.
 *
 *   npm run set-password
 *
 * For accounts the old "Sign in with Google (SSO)" button created without a
 * password, and for anyone who has forgotten theirs. Asks for the email, shows
 * the account and the database it is about to write to, asks for the password
 * twice without echoing it, and changes nothing else — not the role, not
 * whether the account is active. The rules live in lib/accounts/set-password.ts.
 *
 * Against production, run it with DATABASE_URL pointing at the SSH tunnel, the
 * same way as `prisma migrate deploy`. An exported DATABASE_URL wins over
 * .env.local, so check the "Database" line before answering 'ya'.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { config } from "dotenv";
import { mariadbPoolConfig, MARIADB_ADAPTER_OPTIONS } from "../lib/mariadb";
import { validatePassword } from "../lib/password-policy";
import { findPasswordTarget, passwordUsableNow, setPassword } from "../lib/accounts/set-password";
import { createPrompt, databaseHost } from "./lib/prompt";

config({ path: ".env.local" });

const adapter = new PrismaMariaDb(mariadbPoolConfig(), MARIADB_ADAPTER_OPTIONS);
const db = new PrismaClient({ adapter });

const { ask, askSecret, askValidated, close } = createPrompt();

async function main() {
  const host = databaseHost();

  console.log("\n─── Set password akun staf ───────────────────────────────────");
  console.log(`Database : ${host}`);
  console.log("Hanya password yang diubah. Role dan status aktif tidak disentuh.\n");

  const email = await ask("Email akun");
  const found = await findPasswordTarget(db, email);
  if (!found.ok) {
    console.error(`\n✗ ${found.error}`);
    process.exitCode = 1;
    return;
  }
  const user = found.user;

  console.log(`\n  Nama          : ${user.name}`);
  console.log(`  Role          : ${user.role}`);
  console.log(`  Punya password: ${user.hasPassword ? "ya — akan DIGANTI" : "belum"}`);
  if (!passwordUsableNow(user)) {
    console.log("\n  ⚠ LOCAL_LOGIN=break-glass dan email ini tidak ada di BREAK_GLASS_EMAILS:");
    console.log("    password ini tidak akan bisa dipakai login sampai pengaturan itu diubah.");
  }
  console.log("");

  let password = "";
  for (;;) {
    password = await askValidated("Password baru", (v) => validatePassword(v), { secret: true });
    const again = await askSecret("Ulangi password");
    if (password === again) break;
    console.error("  ✗ Password tidak sama. Ulangi.");
  }

  const confirm = await ask(`\nSet password untuk ${user.email} di ${host}? ketik 'ya' untuk lanjut`, "tidak");
  if (confirm.toLowerCase() !== "ya") {
    console.log("Dibatalkan. Tidak ada yang ditulis.");
    return;
  }

  const result = await setPassword(db, user.id, password);
  if (!result.ok) {
    console.error(`\n✗ ${result.error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`\n✅ Password ${user.email} sudah diset. Login dengan email dan password itu.`);
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
