# RMA / Warranty Claim — Schema Deployment

Cara menerapkan perubahan schema branch `feat/rma-warranty-claim` ke Supabase.

> **Tidak ada satu pun perintah di dokumen ini yang sudah dijalankan terhadap Supabase.**
> Semuanya ditulis untuk dieksekusi manual oleh operator, setelah backup.

---

## 1. Bagaimana perubahan schema Fase 1 dibuat

**Tidak dengan `migrate dev`, dan tidak dengan `db push`.** Tidak ada database yang disentuh
sama sekali.

Repo ini tidak punya `.env.local`, jadi tidak ada koneksi DB yang tersedia. Yang dijalankan
hanya dua perintah yang murni bekerja di atas file:

```powershell
DATABASE_URL="postgresql://u:p@127.0.0.1:1/db" npx prisma validate   # parse + cek relasi
DATABASE_URL="postgresql://u:p@127.0.0.1:1/db" npx prisma generate   # tulis ulang Prisma Client
```

`DATABASE_URL` palsu itu diperlukan karena `prisma.config.ts` memanggil `env("DATABASE_URL")`
saat memuat config — bahkan `validate` gagal tanpanya. URL itu menunjuk port 1 di localhost
dan tidak pernah dikoneksi.

Artinya: **`prisma/schema.prisma` saat ini adalah satu-satunya sumber kebenaran, dan belum
tercermin di database mana pun** — baik lokal maupun Supabase.

---

## 2. Kondisi awal yang perlu dipahami

- Repo **tidak punya `prisma/migrations/`**. Schema di Supabase selama ini diterapkan lewat
  `prisma db push`, yang tidak meninggalkan riwayat.
- Karena itu `prisma migrate deploy` **tidak bisa langsung dipakai**. Tanpa baseline, Prisma
  menganggap database kosong dan akan mencoba membuat ulang semua tabel yang sudah ada.
- Langkahnya wajib dua tahap: **baseline dulu** (menandai schema yang sudah ada sebagai
  "sudah diterapkan"), **baru migration RMA**.

### Peringatan MariaDB

Kalau rencana pindah ke MariaDB jadi dilakukan, SQL hasil baseline ini **akan terbuang** —
sintaksnya Postgres. Pertimbangkan menunda baseline sampai keputusan database final.
Alternatif jangka pendek: terapkan perubahan RMA ke Supabase dengan `db push` (sama seperti
selama ini), dan baseline dikerjakan sekali saja setelah database final ditentukan.

---

## 3. Langkah deploy

### Langkah 0 — Backup (WAJIB, jangan dilewati)

Supabase Dashboard → **Database** → **Backups** → *Create backup*, tunggu sampai selesai.

Sebagai cadangan kedua, dump ke file lokal:

```powershell
docker run --rm -v "${PWD}:/out" postgres:17 `
  pg_dump "<DATABASE_URL_SUPABASE>" --no-owner --no-acl -Fc -f /out/pre-rma-backup.dump
```

File `.dump` berisi data customer asli. **Jangan di-commit**, jangan dipakai mengisi database
lokal (lihat `docs/rma-test-checklist.md` — database lokal diisi `npm run seed`, bukan
salinan production).

### Langkah 1 — Siapkan schema `main` sebagai titik acuan

```powershell
git show main:prisma/schema.prisma | Out-File -Encoding utf8 .\main-schema.prisma
```

Ini adalah schema yang **sudah** ada di Supabase sekarang.

### Langkah 2 — Buat baseline migration

```powershell
New-Item -ItemType Directory -Force prisma\migrations\00000000000000_baseline

npx prisma migrate diff `
  --from-empty `
  --to-schema-datamodel .\main-schema.prisma `
  --script | Out-File -Encoding utf8 prisma\migrations\00000000000000_baseline\migration.sql
```

Tandai sebagai sudah diterapkan — **ini hanya menulis ke tabel `_prisma_migrations`, tidak
mengubah tabel apa pun:**

```powershell
npx prisma migrate resolve --applied 00000000000000_baseline
```

Verifikasi:

```powershell
npx prisma migrate status    # harus: "Database schema is up to date!"
```

Kalau langkah ini melaporkan drift, **berhenti**. Artinya schema Supabase berbeda dari
`main` — selisihnya harus diperiksa manual dulu sebelum lanjut.

### Langkah 3 — Buat migration RMA, dipecah dua

Dipecah karena Postgres tidak mengizinkan nilai enum baru (`ALTER TYPE ... ADD VALUE`)
**dipakai** di transaksi yang sama dengan yang menambahkannya, sedangkan Prisma membungkus
tiap migration dalam satu transaksi. Migration RMA ini sebenarnya tidak melanggar aturan itu
(nilai barunya tidak direferensikan DDL apa pun di migration yang sama), tapi memisahkannya
menghilangkan risiko sepenuhnya dan membuat rollback lebih mudah.

**3a — nilai enum saja:**

```powershell
New-Item -ItemType Directory -Force prisma\migrations\20260922000100_rma_enum_values
```

Isi `migration.sql` secara manual:

```sql
ALTER TYPE "Role"             ADD VALUE IF NOT EXISTS 'RMA';
ALTER TYPE "TicketStatus"     ADD VALUE IF NOT EXISTS 'rma_process';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'rma_update';
```

**3b — tipe baru, tabel baru, kolom baru:**

```powershell
New-Item -ItemType Directory -Force prisma\migrations\20260922000200_rma_tables

npx prisma migrate diff `
  --from-schema-datamodel .\main-schema.prisma `
  --to-schema-datamodel .\prisma\schema.prisma `
  --script | Out-File -Encoding utf8 prisma\migrations\20260922000200_rma_tables\migration.sql
```

Lalu **buka file itu dan hapus ketiga baris `ALTER TYPE ... ADD VALUE`**, karena sudah
ditangani di 3a. Sisanya harus berisi, dan hanya berisi:

- `CREATE TYPE "UnitOwnership"`, `"RmaStatus"`, `"RmaDecision"`
- `CREATE TABLE "RmaCase"` + `CREATE TABLE "RmaEvent"`
- `CREATE UNIQUE INDEX` untuk `rma_code` dan `ticket_id`, `CREATE INDEX` untuk `status`,
  `handler_id`, `rma_case_id`
- `ALTER TABLE "TicketWarrantyDetail" ADD COLUMN "device_sn" TEXT`
- `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY` untuk relasi RmaCase/RmaEvent

**Kalau ada `DROP` apa pun di file ini, berhenti dan laporkan.** Semua perubahan branch ini
bersifat additive; satu pun `DROP TABLE` / `DROP COLUMN` berarti ada yang salah.

### Langkah 4 — Uji di lokal dulu

Terapkan ke container Postgres lokal yang kosong, bukan ke Supabase:

```powershell
$env:DATABASE_URL="postgresql://postgres:devpass@127.0.0.1:5433/ticketing"
$env:DATABASE_SSL="false"
npx prisma migrate deploy
npx prisma migrate status
npm test
```

### Langkah 5 — Deploy ke Supabase

Hanya setelah Langkah 0 (backup) dan Langkah 4 (lolos di lokal):

```powershell
$env:DATABASE_URL="<DATABASE_URL_SUPABASE>"
Remove-Item Env:\DATABASE_SSL -ErrorAction SilentlyContinue   # kembali ke perilaku Supabase
npx prisma migrate status       # tinjau apa yang PENDING sebelum menerapkan
npx prisma migrate deploy
```

### Langkah 6 — Setelah deploy

```powershell
Remove-Item .\main-schema.prisma
$env:NODE_TLS_REJECT_UNAUTHORIZED="0"; npm run seed    # menambah user rma@techserve.id
```

Cek cepat di Supabase SQL Editor:

```sql
SELECT unnest(enum_range(NULL::"Role"));             -- harus memuat RMA
SELECT unnest(enum_range(NULL::"TicketStatus"));     -- harus memuat rma_process
SELECT count(*) FROM "RmaCase";                      -- 0
SELECT count(*) FROM "Ticket";                       -- tidak berubah dari sebelum deploy
```

---

## 4. Rollback

Enum value di Postgres **tidak bisa dihapus**. `ALTER TYPE ... DROP VALUE` tidak ada.
Jadi rollback penuh berarti restore dari backup Langkah 0.

Rollback parsial (kalau tidak ada tiket yang terlanjur masuk `rma_process`):

```sql
DROP TABLE IF EXISTS "RmaEvent";
DROP TABLE IF EXISTS "RmaCase";
DROP TYPE  IF EXISTS "RmaDecision";
DROP TYPE  IF EXISTS "RmaStatus";
DROP TYPE  IF EXISTS "UnitOwnership";
ALTER TABLE "TicketWarrantyDetail" DROP COLUMN IF EXISTS "device_sn";
DELETE FROM "_prisma_migrations" WHERE migration_name LIKE '%rma%';
```

Nilai enum `RMA`, `rma_process`, `rma_update` akan tertinggal. Tidak berbahaya — tidak ada
kode yang menghasilkannya setelah rollback — tapi permanen sampai restore penuh.

---

## 5. Setelah baseline: jangan pakai `db push` lagi

Begitu `prisma/migrations/` ada dan Supabase sudah di-baseline, `prisma db push` ke Supabase
akan membuat schema menyimpang dari riwayat migration dan merusak deploy berikutnya.

- **Supabase / staging:** `prisma migrate deploy` saja.
- **Lokal:** `prisma migrate dev` untuk perubahan schema baru.

RLS (bagian 🔒 di `CLAUDE.md`) masih belum diaktifkan. Tabel `RmaCase` dan `RmaEvent`
menambah dua tabel lagi ke daftar yang perlu diproteksi:

```sql
ALTER TABLE "RmaCase"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RmaEvent" ENABLE ROW LEVEL SECURITY;
```
