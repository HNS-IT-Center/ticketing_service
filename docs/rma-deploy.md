# Runbook Deploy — RMA / Warranty Claim

Menerapkan branch `feat/rma-warranty-claim` ke server. Ditulis untuk dijalankan sendirian,
di luar jam kerja, sambil membaca.

> **Belum ada satu pun perintah di dokumen ini yang pernah dijalankan terhadap server mana
> pun.** Semuanya untuk dieksekusi manual, setelah backup.

**Bagian A** memindahkan schema database. **Bagian B** menjalankan aplikasinya.
Keduanya perlu dikerjakan; A saja tidak membuat aplikasi hidup, B saja membuatnya crash.

---

## ⛔ GERBANG KEPUTUSAN — baca sebelum apa pun

### Database harus PostgreSQL

Runbook ini **hanya berlaku untuk PostgreSQL**, baik Supabase maupun Postgres yang Anda
jalankan sendiri di VPS.

Kalau rencananya memakai **MySQL / MariaDB bawaan Hostinger, berhenti di sini.** Kode ini
tidak jalan di MySQL tanpa port yang belum dikerjakan — `extra_services String[]` bahkan
gagal di `prisma validate`, bukan gagal saat runtime. Inventaris lengkapnya:
`docs/plan-mariadb-port.md`. Jangan jalankan baseline di bawah kalau MariaDB dipilih; SQL-nya
sintaks Postgres dan akan terbuang.

### Untuk staging, Postgres sendiri lebih murah daripada Supabase

Kalau tujuannya staging dengan data buang, jangan sentuh Supabase sama sekali. Jalankan
Postgres di VPS yang sama:

```bash
docker run -d --name hns-pg -p 127.0.0.1:5432:5432 \
  -e POSTGRES_PASSWORD=GANTI_INI -e POSTGRES_DB=ticketing \
  -v hns-pg-data:/var/lib/postgresql/data --restart unless-stopped postgres:17
```

Lalu **lewati seluruh Bagian A** dan cukup jalankan, sekali saja, terhadap database kosong itu:

```bash
DATABASE_URL="postgresql://postgres:GANTI_INI@127.0.0.1:5432/ticketing" \
DATABASE_SSL=false npx prisma db push
```

Baseline dan migration hanya perlu kalau databasenya **sudah berisi data yang harus
dipertahankan**. Lanjut ke Bagian B.

### Hosting harus bisa menjalankan proses Node

Next.js 16 dengan server actions butuh proses Node yang hidup terus. **Shared hosting
PHP tidak bisa**, sekalipun mengiklankan "Node.js support" untuk static export. Perlu VPS,
atau paket yang benar-benar memberi Anda shell dan proses yang persisten.

---

## Pre-flight — jangan mulai sebelum semua ✅

| Cek | Perintah / cara | Harus |
|---|---|---|
| Branch sinkron dengan remote | `git fetch origin && git rev-parse main origin/main` | Dua hash **sama** |
| Tidak ada commit tertinggal | `git log --oneline main..origin/main` | **Kosong** |
| Branch fitur sudah di-rebase | `git log --oneline origin/main..HEAD` | Hanya commit RMA |
| Kode lolos | `npx tsc --noEmit && npm test` | 477 test lulus |
| Build produksi lolos | `npm run build` | Compiled successfully |
| Punya kredensial R2 | — | Lihat Bagian B; tanpa ini upload mati |
| Punya akses DB | `psql "<DATABASE_URL>" -c "select 1"` | Berhasil |
| **Backup sudah jadi** | Langkah 0 | Jangan dilewati |

### ⚠️ Baseline WAJIB dari `origin/main`, bukan `main` lokal

`main` lokal bisa tertinggal jauh tanpa terlihat. Ini **pernah terjadi di proyek ini**: sebuah
branch dibuat dari `main` lokal yang tertinggal 40 commit, dan schema-nya jadi salah
(menambahkan `device_sn` yang ternyata sudah ada).

Baseline dari schema yang salah menghasilkan migration yang salah, lalu
`migrate resolve --applied` menandainya sudah diterapkan — sehingga selisihnya **tidak akan
pernah terdeteksi lagi**.

---

# BAGIAN A — Schema

Lewati bagian ini kalau database Anda baru dan kosong (lihat gerbang keputusan).

## Kenapa tidak bisa langsung `migrate deploy`

Repo **tidak punya `prisma/migrations/`**. Schema di server selama ini diterapkan lewat
`prisma db push`, yang tidak meninggalkan riwayat. Tanpa baseline, Prisma menganggap database
kosong dan mencoba membuat ulang semua tabel yang sudah ada.

Karena itu: **baseline dulu, baru migration RMA.**

## Langkah 0 — Backup (WAJIB)

Supabase Dashboard → **Database** → **Backups** → *Create backup*, tunggu selesai.

Cadangan kedua ke file:

```bash
docker run --rm -v "$PWD:/out" postgres:17 \
  pg_dump "<DATABASE_URL>" --no-owner --no-acl -Fc -f /out/pre-rma-backup.dump
```

File `.dump` berisi data customer asli. **Jangan di-commit**, jangan dipakai mengisi database
lokal.

## Langkah 1 — Ambil schema acuan

```bash
git fetch origin
git show origin/main:prisma/schema.prisma > main-schema.prisma
```

## Langkah 2 — Baseline

> **Perintah `migrate diff` berubah di Prisma 7.** Flag `--from-schema-datamodel` sudah
> dihapus; sekarang `--from-schema`. Versi lama dokumen ini memakai flag yang salah dan akan
> gagal.

```bash
mkdir -p prisma/migrations/00000000000000_baseline

npx prisma migrate diff \
  --from-empty \
  --to-schema main-schema.prisma \
  --script > prisma/migrations/00000000000000_baseline/migration.sql
```

### 2b — VERIFIKASI sebelum `resolve` (jangan dilewati)

`migrate resolve --applied` adalah pernyataan sepihak: ia bilang "schema ini sudah ada"
tanpa memeriksa apa pun. Kalau keliru, selisihnya tersembunyi permanen.

Perintah berikut **hanya membaca**:

```bash
npx prisma migrate diff \
  --from-url "<DATABASE_URL>" \
  --to-schema main-schema.prisma \
  --script
```

**Harus kosong** (atau hanya komentar, tanpa satu pun DDL).

- **Kosong** → lanjut.
- **Ada isinya** → **BERHENTI.** Server menyimpang dari `origin/main`: ada `db push` yang tak
  masuk git, SQL manual, atau commit belum ter-deploy. Pahami selisihnya dulu. Jangan
  `migrate resolve`, dan jangan "membetulkan" dengan `db push` — itu menghapus buktinya.

### 2c — Tandai baseline

Hanya setelah 2b kosong. Ini **hanya menulis ke `_prisma_migrations`**, tidak mengubah tabel:

```bash
npx prisma migrate resolve --applied 00000000000000_baseline
npx prisma migrate status     # harus: "Database schema is up to date!"
```

## Langkah 3 — Migration RMA, dipecah dua

Dipecah karena Postgres tidak mengizinkan nilai enum baru **dipakai** dalam transaksi yang
sama dengan yang menambahkannya, sedangkan Prisma membungkus tiap migration dalam satu
transaksi. Migration ini sebenarnya tidak melanggarnya, tapi memisahkannya menghilangkan
risiko dan memudahkan rollback.

### 3a — Nilai enum saja

```bash
mkdir -p prisma/migrations/20260927000100_rma_enum_values
```

Isi `migration.sql`:

```sql
ALTER TYPE "Role"             ADD VALUE IF NOT EXISTS 'RMA';
ALTER TYPE "TicketStatus"     ADD VALUE IF NOT EXISTS 'rma_process';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'rma_update';
```

> Hanya tiga. `ineligible` **tidak** di sini karena ia bagian dari `RmaStatus`, tipe yang
> baru dibuat di 3b — bukan penambahan ke enum yang sudah ada.

### 3b — Tipe, tabel, kolom

```bash
mkdir -p prisma/migrations/20260927000200_rma_tables

npx prisma migrate diff \
  --from-schema main-schema.prisma \
  --to-schema prisma/schema.prisma \
  --script > prisma/migrations/20260927000200_rma_tables/migration.sql
```

Lalu **buka file itu dan hapus ketiga baris `ALTER TYPE ... ADD VALUE`** (sudah ditangani 3a).

Isinya harus ±101 baris dan hanya berisi:

- `CREATE TYPE "UnitOwnership"`, `"RmaStatus"` (10 nilai, termasuk `ineligible`), `"RmaDecision"`
- `ALTER TABLE "TicketWarrantyDetail" ADD COLUMN "claim_eligible" BOOLEAN NOT NULL DEFAULT true`
  dan `ADD COLUMN "ineligibility_reason" TEXT`
- `CREATE TABLE "RmaCase"` — termasuk `recommended_eligible BOOLEAN` (nullable) dan
  `recommendation_note TEXT`
- `CREATE TABLE "RmaEvent"`
- `CREATE UNIQUE INDEX` untuk `rma_code` dan `ticket_id`; `CREATE INDEX` untuk `status`,
  `handler_id`, `rma_case_id`
- 5 × `ADD CONSTRAINT ... FOREIGN KEY`

**Kalau ada `DROP` apa pun, berhenti dan laporkan.** Seluruh perubahan branch ini additive —
diverifikasi: `grep -c DROP` pada hasil diff = **0**.

## Langkah 4 — Uji di lokal dulu

Terhadap container Postgres lokal yang kosong, **bukan** server:

```bash
DATABASE_URL="postgresql://postgres:devpass@127.0.0.1:5433/ticketing" \
DATABASE_SSL=false npx prisma migrate deploy

DATABASE_URL="postgresql://postgres:devpass@127.0.0.1:5433/ticketing" \
DATABASE_SSL=false npx prisma migrate status

npm test
```

## Langkah 5 — Terapkan ke server

Hanya setelah Langkah 0 (backup) **dan** Langkah 4 (lolos lokal):

```bash
export DATABASE_URL="<DATABASE_URL_SERVER>"
unset DATABASE_SSL                 # kembali ke perilaku TLS default

npx prisma migrate status          # TINJAU apa yang PENDING sebelum menerapkan
npx prisma migrate deploy
```

## Langkah 6 — Verifikasi schema

```sql
SELECT unnest(enum_range(NULL::"Role"))::text;             -- memuat RMA
SELECT unnest(enum_range(NULL::"TicketStatus"))::text;     -- memuat rma_process
SELECT unnest(enum_range(NULL::"RmaStatus"))::text;        -- 10 nilai, memuat ineligible
SELECT count(*) FROM "RmaCase";                            -- 0
SELECT count(*) FROM "RmaEvent";                           -- 0
SELECT column_name FROM information_schema.columns
  WHERE table_name='RmaCase' AND column_name LIKE 'recommend%';   -- 2 baris
SELECT count(*) FROM "Ticket";                             -- TIDAK berubah dari sebelum deploy
```

```bash
rm main-schema.prisma
```

---

# BAGIAN B — Aplikasi

## Env yang wajib ada di server

| Variabel | Catatan |
|---|---|
| `DATABASE_URL` | Postgres. Untuk Supabase pooler, akhiri `?sslmode=no-verify` |
| `DATABASE_SSL` | Set `false` **hanya** untuk Postgres lokal tanpa TLS. Kosongkan untuk Supabase |
| `SESSION_SECRET` | Acak, 32+ karakter. **Berbeda dari lokal** |
| `NEXT_PUBLIC_APP_URL` | URL publik server. Salah isi = link share dan email menunjuk ke tempat yang salah |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` | Wajib, lihat di bawah |
| `NEXT_PUBLIC_R2_PUBLIC_URL` | URL publik bucket |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Hanya untuk Realtime. Kalau tidak pakai Supabase, isi placeholder supaya `lib/supabase.ts` tidak crash saat import — konsekuensinya lonceng notifikasi tidak update otomatis |
| `SUPABASE_SERVICE_ROLE_KEY` | Idem |
| `RESEND_API_KEY`, `NEXT_PUBLIC_FROM_EMAIL` | Email. Di tier gratis Resend, **hanya bisa mengirim ke alamat yang terdaftar di akun Resend Anda** |
| `JWT_SECRET`, `NEXT_PUBLIC_SSO_URL` | Hanya kalau `/api/auth/sso-sync` dipakai. Belum ada di `.env.example` |

### ⛔ Penyimpanan file di produksi

`lib/r2.ts` **menolak** dua hal saat `NODE_ENV=production`:

1. `STORAGE_DRIVER=local` — upload akan melempar error.
2. `R2_ENDPOINT` yang bukan `https://` — termasuk MinIO di `127.0.0.1`.

Jadi server **wajib** punya kredensial R2 asli (atau S3-compatible ber-HTTPS). Tanpa itu,
setiap upload gagal: intake attachment, foto kerusakan saat handover, foto bukti penolakan
RMA, dan proof serah terima.

## Menjalankan

```bash
git clone <repo> && cd ticketing_service
git checkout feat/rma-warranty-claim     # atau main setelah di-merge

npm ci                     # bukan `npm install`
# .env.production / .env — isi tabel di atas

npx prisma generate
npm run build
npm run start              # port 3000
```

Taruh di belakang Nginx sebagai reverse proxy dengan TLS, dan jalankan lewat PM2 atau systemd
supaya hidup lagi setelah reboot:

```bash
pm2 start npm --name hns-ticketing -- start
pm2 save && pm2 startup
```

> **Catatan ukuran:** `next.config.ts` belum memakai `output: "standalone"`, jadi server perlu
> seluruh `node_modules`. Kalau ruang VPS sempit, menambahkan opsi itu memperkecil deploy
> secara signifikan — tapi ubah dan uji **sebelum** malam deploy, bukan saat itu.

## Akun pertama

```bash
npm run create-user        # interaktif, role default RMA
```

Untuk staging kosong, buat minimal: satu Administrator, satu Technician, satu RMA.

---

# Smoke test setelah deploy

Urutkan; kalau satu gagal, berhenti dan lihat log.

1. Login sebagai Administrator → dashboard terbuka, tidak ada redirect loop
2. Login RMA (`/rma/dashboard`) → **halaman ini paling cepat mengungkap schema yang kurang**,
   karena membaca `RmaCase`, `RmaEvent`, dan semua enum baru
3. Buka satu tiket lama di portal admin → tidak error walau tidak punya `rma_case`
4. Buat tiket Service biasa → berhasil, kode tiketnya berurutan
5. Buat tiket Warranty Claim → SN dan tanggal beli wajib, tombol Create Ticket **aktif**
6. Ambil tiket klaim itu sebagai teknisi → "Serahkan ke RMA" muncul, "Mark Done" tidak
7. Handover: unggah 1 foto + pilih rekomendasi → berhasil. **Ini menguji R2 sekaligus**
8. Login RMA → case muncul, foto bisa dibuka di modal
9. Buka halaman publik tiket → status dan banner benar, tidak ada data internal bocor

---

# Rollback

## Kalau gagal di Bagian A

Nilai enum Postgres **tidak bisa dihapus** — `ALTER TYPE ... DROP VALUE` tidak ada. Rollback
penuh berarti restore dari backup Langkah 0.

Rollback parsial, **hanya kalau belum ada tiket yang masuk `rma_process`**:

```sql
DROP TABLE IF EXISTS "RmaEvent";
DROP TABLE IF EXISTS "RmaCase";
DROP TYPE  IF EXISTS "RmaDecision";
DROP TYPE  IF EXISTS "RmaStatus";
DROP TYPE  IF EXISTS "UnitOwnership";
ALTER TABLE "TicketWarrantyDetail"
  DROP COLUMN IF EXISTS "claim_eligible",
  DROP COLUMN IF EXISTS "ineligibility_reason";
DELETE FROM "_prisma_migrations" WHERE migration_name LIKE '%rma%';
```

Nilai enum `RMA`, `rma_process`, `rma_update` akan tertinggal. Tidak berbahaya — tidak ada
kode yang menghasilkannya setelah rollback — tapi permanen sampai restore penuh.

## Kalau gagal di Bagian B

Schema sudah additive dan tidak mengganggu kode lama, jadi cukup kembalikan aplikasi ke commit
sebelumnya dan restart. Database tidak perlu disentuh.

---

# Setelah baseline ada: jangan `db push` lagi

Begitu `prisma/migrations/` ada dan server sudah di-baseline, `prisma db push` akan membuat
schema menyimpang dari riwayat migration dan merusak deploy berikutnya.

- **Server:** `prisma migrate deploy` saja.
- **Lokal:** `prisma migrate dev` untuk perubahan schema baru.

---

# Dua larangan yang mahal kalau dilanggar

> ### ⛔ JANGAN jalankan `npm run seed` terhadap server
>
> `prisma/seed.ts` membuat enam akun dengan password yang tertulis terbuka di repo ini:
> `admin@techserve.id` / `admin123`, tiga teknisi / `tech123`, `sales@techserve.id` /
> `sales123`.
>
> Dan bukan cuma membuat. Seed memakai `upsert` yang **juga menulis password di blok
> `update`**:
>
> ```ts
> await db.user.upsert({
>   where:  { email: "admin@techserve.id" },
>   update: { is_active: true, password: await hash("admin123") },   // ← ini
>   create: { ... },
> });
> ```
>
> Kalau server sudah punya `admin@techserve.id`, seed akan **me-reset password administrator
> itu jadi `admin123` dan mengaktifkan kembali akunnya** — sekalipun sebelumnya sengaja
> dinonaktifkan. Seed hanya untuk database lokal yang boleh dibuang.
>
> Penggantinya `npm run create-user`: satu user, password diketik saat itu, menolak menimpa
> email yang sudah ada, tidak pernah mencetak password.

> ### ⛔ JANGAN pakai `NODE_TLS_REJECT_UNAUTHORIZED="0"`
>
> Berlaku **se-proses**, bukan hanya koneksi Postgres — mematikan verifikasi sertifikat untuk
> semua koneksi TLS keluar, termasuk ke Resend dan R2.
>
> Untuk Postgres juga **tidak memberi apa-apa**: `lib/db.ts` dan `scripts/create-user.ts`
> sudah meneruskan `ssl: { rejectUnauthorized: false }` langsung ke driver, yang cakupannya
> hanya koneksi database.
>
> | Gejala | Tindakan |
> |---|---|
> | `SELF_SIGNED_CERT_IN_CHAIN` ke pooler Supabase | Sudah ditangani di level driver. Kalau masih muncul, ada klien lain yang tidak lewat `lib/db.ts` — cari klien itu |
> | `UNABLE_TO_VERIFY_LEAF_SIGNATURE` | Unduh CA bundle Supabase, lalu `ssl: { ca: fs.readFileSync(...) }`. Ini yang seharusnya dituju untuk produksi |
> | Error TLS ke Resend / R2 | Bukan soal Postgres. Biasanya jam sistem meleset atau proxy menyuntik sertifikat |

**Utang teknis:** `rejectUnauthorized: false` di `lib/db.ts` juga bukan tujuan akhir.
Targetnya CA bundle yang benar — BL14 di backlog `CLAUDE.md`.

---

# Yang TIDAK ditangani runbook ini

| | |
|---|---|
| **RLS** | Belum aktif di tabel mana pun, sekarang termasuk `RmaCase` dan `RmaEvent`. SQL-nya ada di `CLAUDE.md` bagian "🔒 SECURITY: RLS". BL12 |
| **Data demo** | NGW-000004…NGW-000009 ada di database lokal, bukan di server. Jangan ikut terbawa |
| **Merge ke `main`** | Runbook ini mengasumsikan branch fitur. Setelah stabil, merge dan deploy ulang dari `main` |
| **Tiga branch kecil** | `fix/ticket-code-collision`, `fix/claude-md-seed-warning`, `fix/points-table-unification` belum di-push. Yang ketiga **mengubah angka poin yang terlihat** — jangan ikut di-deploy tanpa mengumumkan ke teknisi (`docs/points-change-announcement.md`) |
