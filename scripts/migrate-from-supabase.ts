/**
 * Menyalin seluruh data Supabase PostgreSQL ke MariaDB.
 *
 *   PGURL="postgresql://..." DATABASE_URL="mysql://..." npm run migrate:from-supabase
 *
 * Supabase HANYA DIBACA — tidak ada satu pun perintah tulis terhadapnya.
 *
 * Aman diulang: tujuan dikosongkan lebih dulu, dalam urutan terbalik dari urutan
 * impor. `FOREIGN_KEY_CHECKS` sengaja TIDAK dimatikan, supaya urutan yang salah
 * gagal dengan berisik alih-alih menyisakan baris yatim. Mode strict dari
 * lib/mariadb.ts juga tetap berlaku, jadi nilai yang melewati batas kolom
 * ditolak, bukan dipotong diam-diam.
 *
 * ID adalah `cuid` berupa string dan dipertahankan apa adanya, jadi tidak ada
 * pemetaan ID baru dan seluruh relasi tetap utuh tanpa tabel terjemahan.
 *
 * Kolom yang ada di sumber tapi tidak ada di tujuan dilaporkan di akhir, bukan
 * didiamkan — itulah diff schema-nya, dihasilkan dari eksekusi.
 *
 * Yang TIDAK disalin, dan memang tidak perlu:
 *   - `RmaCase` / `RmaEvent` — belum pernah ada di Supabase
 *   - File lampiran — `TicketAttachment.file_url` menunjuk ke Cloudflare R2.
 *     Selama bucket dan NEXT_PUBLIC_R2_PUBLIC_URL tidak berubah, file tetap
 *     terbaca. JANGAN ganti bucket saat cutover.
 *
 * Dijalankan dua kali sepanjang proyek ini: sekali sebagai latihan terhadap
 * container lokal, dan sekali saat cutover terhadap Hostinger — karena produksi
 * terus menerima tiket baru sampai detik terakhir.
 */
import { Client } from "pg";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { config } from "dotenv";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { mariadbPoolConfig, MARIADB_ADAPTER_OPTIONS } from "../lib/mariadb";

config({ path: ".env.local" });

/** Induk lebih dulu. Pengosongan berjalan terbalik. */
const ORDER = [
  "StoreLocation",
  "User",
  "Upgrade",
  "TechnicianStoreAssignment",
  "TechnicianPerformance",
  "TechnicianWorkload",
  "TechnicianLeave",
  "ShiftOverride",
  "UserTitle",
  "Leaderboard",
  "Ticket",
  "TicketServiceDetail",
  "TicketWarrantyDetail",
  "TicketCleaningDetail",
  "TicketPcBuildDetail",
  "TicketPcBuildComponent",
  "TicketUpgradeDetail",
  "TicketAttachment",
  "TicketMessage",
  "TicketStatusLog",
  "TicketAssignmentRequest",
  "TicketTimeLog",
  "Notification",
] as const;

const accessor = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
const CHUNK = 500;

type AnyDelegate = Record<
  string,
  {
    deleteMany: () => Promise<{ count: number }>;
    createMany: (a: unknown) => Promise<unknown>;
    count: () => Promise<number>;
  }
>;

/**
 * Konfirmasi selalu diminta, tidak pernah disimpulkan dari host.
 *
 * Versi pertama melewati konfirmasi kalau host-nya `127.0.0.1`. Itu cacat:
 * database Hostinger dijangkau lewat SSH tunnel, jadi ia MUNCUL sebagai
 * `127.0.0.1` dan penjaganya lolos begitu saja — persis cacat yang sama dengan
 * `LOCAL_HOSTS` di `vitest.setup.ts`, yang juga menilai host dan tidak bisa
 * membedakan tunnel dari container.
 *
 * Skrip ini mengosongkan 23 tabel sebelum menyalin, jadi "sepertinya lokal"
 * bukan alasan yang cukup. Untuk pemakaian non-interaktif, set MIGRATE_YES=1
 * secara sadar.
 */
async function confirmTarget(host: string, port: number, database: string) {
  if (process.env.MIGRATE_YES === "1") {
    console.log("   (MIGRATE_YES=1 — konfirmasi dilewati secara sadar)");
    return;
  }
  console.log(`\n⚠️  Skrip ini MENGOSONGKAN seluruh 23 tabel di ${host}:${port}/${database}`);
  console.log("   Lewat SSH tunnel, database Hostinger pun terlihat sebagai 127.0.0.1.");
  console.log("   Periksa nama database di atas, bukan host-nya.");
  const rl = createInterface({ input: stdin, output: stdout });
  const answer = (await rl.question("   Ketik 'ya' untuk lanjut: ")).trim().toLowerCase();
  rl.close();
  if (answer !== "ya") {
    console.log("Dibatalkan. Tidak ada yang ditulis.");
    process.exit(0);
  }
}

async function main() {
  const pgUrl = process.env.PGURL;
  if (!pgUrl) throw new Error("PGURL belum diset (connection string Supabase).");
  if (!process.env.DATABASE_URL?.startsWith("mysql://")) {
    throw new Error("DATABASE_URL harus mysql:// — skrip ini tidak menulis ke PostgreSQL.");
  }

  const target = mariadbPoolConfig();
  console.log(`sumber : ${new URL(pgUrl).hostname}  (dibaca saja)`);
  console.log(`tujuan : ${target.host}:${target.port}/${target.database}`);
  await confirmTarget(target.host, target.port, target.database);

  const pg = new Client({ connectionString: pgUrl, ssl: { rejectUnauthorized: false } });
  await pg.connect();
  const db = new PrismaClient({
    adapter: new PrismaMariaDb(mariadbPoolConfig(), MARIADB_ADAPTER_OPTIONS),
  });
  const delegates = db as unknown as AnyDelegate;

  // Kolom yang benar-benar ada di tujuan, per tabel.
  const cols = new Map<string, Set<string>>();
  const colRows = await db.$queryRawUnsafe<{ TABLE_NAME: string; COLUMN_NAME: string }[]>(
    `SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.columns WHERE TABLE_SCHEMA = DATABASE()`,
  );
  for (const r of colRows) {
    if (!cols.has(r.TABLE_NAME)) cols.set(r.TABLE_NAME, new Set());
    cols.get(r.TABLE_NAME)!.add(r.COLUMN_NAME);
  }

  console.log("\n── Mengosongkan tujuan");
  for (const t of [...ORDER].reverse()) {
    const n = await delegates[accessor(t)].deleteMany();
    if (n.count) console.log(`   ${t.padEnd(28)} -${n.count}`);
  }

  console.log("\n── Menyalin");
  const dropped = new Map<string, string[]>();
  const summary: { table: string; src: number; dst: number }[] = [];

  for (const t of ORDER) {
    const src = await pg.query(`select * from "${t}"`);
    const allowed = cols.get(t);
    if (!allowed) {
      console.log(`   ${t.padEnd(28)} DILEWATI — tabel tidak ada di tujuan`);
      continue;
    }
    if (src.rows.length > 0) {
      const missing = Object.keys(src.rows[0]).filter((k) => !allowed.has(k));
      if (missing.length) dropped.set(t, missing);
    }
    const rows = src.rows.map((row) =>
      Object.fromEntries(Object.entries(row).filter(([k]) => allowed.has(k))),
    );
    for (let i = 0; i < rows.length; i += CHUNK) {
      await delegates[accessor(t)].createMany({ data: rows.slice(i, i + CHUNK) });
    }
    const dst = await delegates[accessor(t)].count();
    const ok = dst === src.rows.length ? "✅" : "❌";
    console.log(
      `   ${ok} ${t.padEnd(28)} sumber ${String(src.rows.length).padStart(5)}  tujuan ${String(dst).padStart(5)}`,
    );
    summary.push({ table: t, src: src.rows.length, dst });
  }

  if (dropped.size) {
    console.log("\n⚠️  Kolom di sumber yang TIDAK ada di tujuan (tidak disalin):");
    for (const [t, c] of dropped) console.log(`   ${t}: ${c.join(", ")}`);
  } else {
    console.log("\n✅ Setiap kolom di sumber punya pasangan di tujuan.");
  }

  const bad = summary.filter((s) => s.src !== s.dst);
  const totalSrc = summary.reduce((a, s) => a + s.src, 0);
  const totalDst = summary.reduce((a, s) => a + s.dst, 0);
  console.log(`\nTOTAL  sumber ${totalSrc}  tujuan ${totalDst}`);
  console.log(bad.length ? `❌ ${bad.length} tabel tidak cocok` : "✅ Semua tabel cocok.");

  await pg.end();
  await db.$disconnect();
  if (bad.length) process.exit(1);
}

main().catch((e) => {
  console.error("\n✗ Gagal:", e instanceof Error ? e.message : e);
  process.exit(1);
});
