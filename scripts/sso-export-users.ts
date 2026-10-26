/**
 * Export local staff accounts as a CSV for HNS SSO's "Pengguna → Impor CSV".
 *
 *   npm run sso:export-users -- [--out <file>] [--exclude-domain a.com,b.com]
 *
 * Columns: email,username,name,status,password_hash (HNS-SSO-CLIENT.md §3.1).
 * Staff only — never customers — and no deactivated or test accounts. A bcrypt
 * hash is exported so staff can sign in to SSO with the password they already
 * know; nothing else is, because SSO accepts nothing else.
 *
 * The file holds password hashes. It is written outside this repository by
 * default, refused inside it, and its contents are never printed. Import it,
 * then delete it.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { config } from "dotenv";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { mariadbPoolConfig, MARIADB_ADAPTER_OPTIONS } from "../lib/mariadb";
import { buildExportRows, EXPORT_HEADER } from "../lib/sso/accounts";
import { toCsv } from "../lib/csv";

config({ path: ".env.local" });

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const repoRoot = process.cwd();
  const date = new Date().toISOString().slice(0, 10);
  const out = path.resolve(arg("--out") ?? path.join(repoRoot, "..", `sso-users-export-${date}.csv`));
  if (out.startsWith(repoRoot + path.sep)) {
    console.error(`Menolak menulis ${out}: file ini berisi hash password dan tidak boleh berada di dalam repository.`);
    process.exit(1);
  }
  const excludeDomains = (arg("--exclude-domain") ?? "").split(",").map((d) => d.trim()).filter(Boolean);

  const db = new PrismaClient({ adapter: new PrismaMariaDb(mariadbPoolConfig(), MARIADB_ADAPTER_OPTIONS) });
  try {
    const accounts = await db.user.findMany({
      select: { id: true, name: true, email: true, role: true, password: true, is_active: true, sso_sub: true },
      orderBy: { created_at: "asc" },
    });
    const { rows, skipped, withPassword } = buildExportRows(accounts, { excludeDomains });

    writeFileSync(out, toCsv([[...EXPORT_HEADER], ...rows]), { encoding: "utf8", mode: 0o600 });

    const domains: Record<string, number> = {};
    for (const r of rows) {
      const d = r[0].split("@")[1] ?? "?";
      domains[d] = (domains[d] ?? 0) + 1;
    }
    console.log(`Tersimpan: ${out}`);
    console.log(`Staf diekspor: ${rows.length} (dengan hash bcrypt: ${withPassword}, tanpa password: ${rows.length - withPassword})`);
    for (const s of skipped) console.log(`Dilewati — ${s.reason}: ${s.count}`);
    console.log("Per domain email:", domains);
    console.log("Periksa domain di atas. Bila ada akun contoh/seed, ulangi dengan --exclude-domain <domain>.");
    console.log("Setelah diimpor ke SSO, HAPUS file ini.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
