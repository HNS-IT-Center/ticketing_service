/**
 * Adds `RmaCase.hold_reason_code` to a database that does not have it yet.
 *
 * This project has no migration history — the schema has always been applied
 * with `prisma db push`, which leaves nothing behind to replay. So a schema
 * change reaches production as a statement someone runs by hand, and running
 * it by hand during an outage is where typos live. This script is that
 * statement, with the checking around it.
 *
 * `prisma db push` is deliberately NOT what this uses: a push against this
 * database would also rewrite `UserTitle.emoji`, pre-existing drift between
 * the schema file and the server that has nothing to do with this column.
 *
 * Safe to run more than once: it looks before it writes, and does nothing when
 * the column is already there.
 *
 *   # look only — prints the target and what it would do
 *   DATABASE_URL="mysql://user:pass@127.0.0.1:3309/dbname" npx tsx scripts/add-hold-reason-column.ts
 *
 *   # actually apply it
 *   DATABASE_URL="mysql://user:pass@127.0.0.1:3309/dbname" npx tsx scripts/add-hold-reason-column.ts --apply
 *
 * Against production, open the tunnel first:
 *   ssh -p 65002 -N -L 3309:127.0.0.1:3306 <SSH_USER>@<SSH_HOST>
 */
import { config } from "dotenv";
import mariadb from "mariadb";

// Only loaded when DATABASE_URL was not given inline, so an inline value always
// wins over .env.local and the target is never a surprise.
if (!process.env.DATABASE_URL) config({ path: ".env.local" });

const TABLE = "RmaCase";
const COLUMN = "hold_reason_code";
const DDL =
  `ALTER TABLE \`${TABLE}\` ADD COLUMN \`${COLUMN}\` ` +
  `ENUM('missing_damage_video','missing_damage_photo','missing_purchase_invoice','other') NULL`;

function parseUrl(raw: string) {
  const u = new URL(raw);
  return {
    host: u.hostname,
    port: Number(u.port || 3306),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ""),
  };
}

(async () => {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    console.error("DATABASE_URL tidak ada. Berikan inline, jangan taruh koneksi produksi di .env.local.");
    process.exit(1);
  }

  const apply = process.argv.includes("--apply");
  const cfg = parseUrl(raw);

  console.log("Target   :", `${cfg.user}@${cfg.host}:${cfg.port}/${cfg.database}`);
  console.log("Mode     :", apply ? "APPLY — akan menulis" : "periksa saja (tambahkan --apply untuk menjalankan)");
  console.log();

  const conn = await mariadb.createConnection({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    // Matches lib/mariadb.ts; see the note there about why both matter.
    initSql: "SET SESSION sql_mode='STRICT_TRANS_TABLES'",
  });

  try {
    const existing = await conn.query(
      `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [cfg.database, TABLE, COLUMN],
    );

    if (existing.length > 0) {
      console.log(`✅ Kolom \`${COLUMN}\` sudah ada. Tidak ada yang dikerjakan.`);
      console.log("   tipe:", existing[0].COLUMN_TYPE);
      return;
    }

    const rows = await conn.query(`SELECT COUNT(*) AS n FROM \`${TABLE}\``);
    console.log(`Kolom \`${COLUMN}\` BELUM ada. Tabel \`${TABLE}\` berisi ${rows[0].n} baris.`);
    console.log("SQL      :", DDL);

    if (!apply) {
      console.log("\nTidak ada yang diubah. Jalankan ulang dengan --apply untuk menerapkannya.");
      return;
    }

    console.log("\nMenjalankan…");
    await conn.query(DDL);

    const after = await conn.query(
      `SELECT COLUMN_TYPE, IS_NULLABLE FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [cfg.database, TABLE, COLUMN],
    );
    if (after.length === 0) {
      console.error("⛔ Kolom tetap tidak ditemukan setelah ALTER. Periksa hak akses user database.");
      process.exitCode = 1;
      return;
    }

    const held = await conn.query(
      `SELECT COUNT(*) AS n FROM \`${TABLE}\` WHERE status = 'on_hold'`,
    );
    console.log("✅ Selesai.");
    console.log("   tipe     :", after[0].COLUMN_TYPE);
    console.log("   nullable :", after[0].IS_NULLABLE);
    console.log(
      `   catatan  : ${held[0].n} case sedang ditahan dan kini bernilai NULL — keduanya tetap menyimpan alasan teks lamanya dan tidak meminta apa pun ke teknisi sampai ditahan ulang dengan kategori.`,
    );
    console.log("\nTidak perlu build ulang: Prisma client yang ter-deploy sudah mengenal kolom ini.");
  } finally {
    await conn.end();
  }
})().catch((err) => {
  console.error("GAGAL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
