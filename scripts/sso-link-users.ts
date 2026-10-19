/**
 * Tie local accounts to their HNS SSO identity in bulk (HNS-SSO-CLIENT.md §3.2).
 *
 *   npm run sso:link-users -- <sso-export.csv>                 (dry run, the default)
 *   npm run sso:link-users -- <sso-export.csv> --apply
 *   npm run sso:link-users -- <sso-export.csv> --apply --clear-staff-passwords
 *
 * Input is SSO's "API Management → this app → Ekspor CSV (sub ↔ email)".
 * Matches by email, case-insensitive, and only ever fills `sso_sub`: no primary
 * key changes, no deletions, no merges. Conflicts are reported and skipped.
 *
 * --clear-staff-passwords is the go-live step: linked staff then have one
 * password, the SSO one. Accounts listed in BREAK_GLASS_EMAILS keep theirs.
 *
 * (No --by-username: this app has no usernames to match on. Fix the email on
 * whichever side is wrong and run again.)
 */
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { mariadbPoolConfig, MARIADB_ADAPTER_OPTIONS } from "../lib/mariadb";
import { parseSsoExport, planLinks, isStaff } from "../lib/sso/accounts";
import { breakGlassEmails } from "../lib/auth/local-login";

config({ path: ".env.local" });

async function main() {
  const file = process.argv.slice(2).find((a) => !a.startsWith("--"));
  const apply = process.argv.includes("--apply");
  const clearPasswords = process.argv.includes("--clear-staff-passwords");
  if (!file) {
    console.error("Pakai: npm run sso:link-users -- <file-ekspor-sso.csv> [--apply] [--clear-staff-passwords]");
    process.exit(1);
  }

  const { rows, error } = parseSsoExport(readFileSync(file, "utf8"));
  if (error) {
    console.error(error);
    process.exit(1);
  }

  const db = new PrismaClient({ adapter: new PrismaMariaDb(mariadbPoolConfig(), MARIADB_ADAPTER_OPTIONS) });
  try {
    const accounts = await db.user.findMany({
      select: { id: true, name: true, email: true, role: true, password: true, is_active: true, sso_sub: true },
    });
    const plan = planLinks(rows, accounts);

    console.log(`Mode: ${apply ? "APPLY" : "DRY RUN (tidak ada yang diubah)"}`);
    console.log(`Baris SSO: ${rows.length}`);
    console.log(`  akan ditautkan   : ${plan.link.length}`);
    console.log(`  sudah tertaut    : ${plan.alreadyLinked.length}`);
    console.log(`  tidak ditemukan  : ${plan.notFound.length}`);
    console.log(`  konflik          : ${plan.conflicts.length}`);
    for (const c of plan.conflicts) console.log(`    ! ${c.email} — ${c.reason}`);
    for (const r of plan.notFound) console.log(`    ? ${r.email} — ada di SSO, tidak ada akun lokal (akan dibuat otomatis saat login)`);
    if (plan.localNotInSso.length > 0) {
      console.log(`Akun staf lokal yang TIDAK ada di SSO (${plan.localNotInSso.length}) — impor ke SSO, atau biarkan sebagai akun riwayat:`);
      for (const u of plan.localNotInSso) console.log(`    - ${u.email} (${u.name})`);
    }

    if (!apply) {
      console.log("Jalankan lagi dengan --apply untuk menyimpan.");
      return;
    }

    let linked = 0;
    for (const l of plan.link) {
      // Guarded: a row that got linked meanwhile (first SSO login) is left alone.
      const r = await db.user.updateMany({ where: { id: l.userId, sso_sub: null }, data: { sso_sub: l.sub } });
      linked += r.count;
    }
    console.log(`Tertaut: ${linked}`);

    if (clearPasswords) {
      const keep = new Set(breakGlassEmails());
      const linkedIds = new Set([...plan.link, ...plan.alreadyLinked].map((l) => l.userId));
      const targets = accounts.filter(
        (a) => linkedIds.has(a.id) && isStaff(a.role) && a.password && !keep.has(a.email.trim().toLowerCase())
      );
      for (const a of targets) {
        await db.user.update({ where: { id: a.id }, data: { password: null } });
      }
      console.log(`Password lokal staf dikosongkan: ${targets.length} (break-glass dipertahankan: ${keep.size})`);
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
