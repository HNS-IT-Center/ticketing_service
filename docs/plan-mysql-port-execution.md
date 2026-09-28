# Rencana Eksekusi — Port ke MySQL/MariaDB + Deploy hPanel Node.js Web Apps

Status: **menunggu persetujuan.** Belum ada satu baris kode pun yang diubah.

Keputusan yang mendasari rencana ini (diambil 2026-09-27, tidak dibuka lagi):

- Database **MySQL/MariaDB hPanel Hostinger**, bukan PostgreSQL
- Proses Node di **hPanel Node.js Web Apps**, bukan VPS
- Konsekuensinya: BL15 dikerjakan lebih dulu; deploy menyusul setelahnya

Menggantikan rencana di [`docs/deploy-staging-vps.md`](deploy-staging-vps.md), yang
disimpan apa adanya kalau suatu saat kembali ke Postgres.

---

## Fakta server — terverifikasi 2026-09-27, bukan asumsi

Dibaca langsung dari server lewat SSH tunnel, probe read-only.

| Yang dibaca | Nilai | Artinya untuk rencana ini |
|---|---|---|
| `VERSION()` | **11.8.9-MariaDB-log** | DEFAULT pada kolom TEXT/JSON diizinkan (larangan itu khas MySQL 8). `@default("[]")` aman |
| `@@lower_case_table_names` | **0** | Nama tabel sensitif huruf. Bukan masalah — lihat catatan di Tahap 1 |
| Collation database | **utf8mb4_unicode_ci** | Sudah case-insensitive. Menghapus 15 `mode: "insensitive"` **tidak mengubah perilaku pencarian** — ini yang membuktikannya |
| `sql_mode` | `IGNORE_SPACE, NO_AUTO_CREATE_USER, NO_ENGINE_SUBSTITUTION` | ⚠️ **Tidak ada `STRICT_TRANS_TABLES`.** Lihat peringatan di bawah |
| Daftar tabel | **kosong** | Database benar-benar baru |
| Grants | `ALL PRIVILEGES ON <DB_NAME>.*` ke `@127.0.0.1` | Cukup untuk `prisma db push`, termasuk foreign key. Dan **hanya dari loopback** — itu sebabnya tunnel wajib |
| `max_user_connections` | 125 | Longgar. Bukan kendala |
| `max_statement_time` | 240 detik | Longgar |
| InnoDB | `DEFAULT` | Foreign key didukung |

### ⚠️ Server tidak berjalan dalam mode strict

`sql_mode` tidak memuat `STRICT_TRANS_TABLES`. Konsekuensinya nyata dan mudah
terlewat: nilai yang **ditolak PostgreSQL dengan error** akan **diterima diam-diam**
oleh server ini — string melebihi panjang kolom dipotong, tanggal tidak valid jadi
`0000-00-00`, kolom wajib yang kosong diisi nilai default.

Selama ini Postgres bertindak sebagai jaring pengaman terakhir di bawah validasi
aplikasi. Setelah port, jaring itu hilang kecuali dipasang kembali.

**Masuk sebagai butir baru di Tahap 1:** paksa `SET SESSION sql_mode='STRICT_TRANS_TABLES'`
saat koneksi dibuat di `lib/db.ts`, dan samakan di container lokal Tahap 0 — kalau
tidak, test berjalan dengan aturan yang lebih longgar daripada server.

---

## ⚠️ Satu konsekuensi yang harus disadari sebelum mulai

**Aplikasi ini sudah hidup di atas Supabase PostgreSQL dengan data customer asli.**
Buktinya ada di runbook induk sendiri: Langkah 0 memerintahkan `pg_dump` dan
menyebut hasilnya "berisi data customer asli", dan ada sprint "Post-Launch
Refinements" di `CLAUDE.md`.

Port ini membuat kode hanya bisa berjalan di **satu** engine — `provider` di
`schema.prisma` adalah satu nilai, bukan dua. Jadi ada dua akhir yang mungkin,
dan keduanya perlu diputuskan, meski belum sekarang:

| Akhir | Artinya |
|---|---|
| **Produksi ikut pindah ke MySQL** | Perlu migrasi data Supabase → MySQL: dump, konversi tipe, `extra_services` dan `work_days` dari array Postgres ke JSON, lalu verifikasi jumlah baris per tabel. Proyek tersendiri, dengan downtime |
| **Produksi tetap Postgres** | Tidak bisa. Setelah `provider = "mysql"`, branch yang sama tidak lagi jalan di Supabase — jadi produksi akan membeku di commit lama dan tidak bisa menerima fitur baru |

Rencana di bawah **tidak menyelesaikan ini**. Ia menghasilkan aplikasi yang jalan
di MySQL. Nasib data produksi adalah keputusan terpisah yang perlu diambil
sebelum port ini di-merge ke `main`.

---

## Yang berubah dari inventaris lama

Saya telusuri ulang kodenya hari ini. Dua butir di
[`docs/plan-mariadb-port.md`](plan-mariadb-port.md) meleset:

### Lebih ringan dari perkiraan: Realtime

Dokumen lama menulis "harus ditulis ulang jadi polling atau SSE", terdengar
seperti pekerjaan besar. Ternyata **polling-nya sudah ada dan sudah dipakai**:

- `components/layout/NotificationBell.tsx:30` sudah punya `pollUnreadCount()`
  yang memanggil `/api/notifications?count=1`
- Endpoint `app/api/notifications/` dan `app/api/ticket-requests/` sudah berdiri

Jadi perubahannya: ganti blok `.channel(...).subscribe()` dengan
`setInterval(pollUnreadCount, 30_000)` plus `clearInterval` di cleanup. Sekitar
10 baris per komponen, di 2 komponen. Bukan penulisan ulang.

### ~~Lebih berat dari perkiraan: default kolom~~ — SELESAI, tidak jadi masalah

Kekhawatirannya: MySQL 8 **melarang DEFAULT pada kolom JSON/TEXT**, sehingga
`@default([])` di `extra_services` tidak bisa ikut pindah.

**Terjawab.** Server Hostinger adalah **MariaDB 11.8.9** — dibaca langsung dari
banner handshake di `<MYSQL_HOST>:3306` (versi diumumkan sebelum autentikasi).
MariaDB mengizinkan DEFAULT pada TEXT/BLOB sejak 10.2, jadi `@default("[]")`
aman. Larangan itu khas MySQL 8, dan kita tidak memakainya.

---

## Keputusan yang masih terbuka — `extra_services`

Ini menentukan bentuk migrasi, jadi harus diputuskan sebelum Tahap 1.

**Rekomendasi saya: kolom `Json`.** Bukan karena paling gampang, tapi karena
buktinya mengarah ke sana.

Saya telusuri **seluruh 16 pemakaian** `extra_services`. Semuanya baca-tulis
seluruh array:

```
app/actions/tickets.ts:473    select: { extra_services: true }
app/actions/tickets.ts:482    const current = ticket.extra_services as string[]
app/actions/tickets.ts:489    data: { extra_services: updated }
app/sales/tickets/page.tsx           4× baca, semua `as string[]`
app/technician/tickets/page.tsx      4× baca, semua `as string[]`
app/technician/tickets/[id]/page.tsx 1× baca
```

Dua hal yang menentukan:

1. **Tidak ada satu pun filter database terhadap kolom ini.** `grep` untuk
   `has:`, `hasEvery`, `hasSome`, `isEmpty` → **nol hasil**. Yang ada hanya
   `(t.extra_services as string[])?.length > 0`, dan itu berjalan di JavaScript
   setelah baris diambil. Artinya kelemahan utama kolom Json di MariaDB —
   tidak bisa difilter di SQL — **tidak mengorbankan apa pun di sini**.

2. **Pola `Json` sudah terbukti di repo ini.** `work_days Json?`
   (`schema.prisma:188`) bentuknya identik: array string, dibaca utuh, di-cast
   `Array.isArray(...) ? (... as string[]) : []`. Sudah jalan sejak lama.

Bonus: call site-nya sudah di-cast `as string[]` di semua tempat, jadi
perubahannya nyaris nol diff di luar schema.

| | Kolom `Json` (rekomendasi) | Tabel join `TicketExtraService` |
|---|---|---|
| File tersentuh | schema + 1 action | schema + 6 file + migrasi data |
| Bisa difilter di SQL | Tidak | Ya |
| Apakah itu dibutuhkan? | **Tidak — nol filter DB hari ini** | — |
| Benar secara relasional | Tidak | Ya |

Pilih tabel join **hanya kalau** sudah ada rencana konkret melaporkan "tiket mana
saja yang punya extra service X" lewat query. Kalau belum ada, itu membangun
untuk kebutuhan yang belum ada — dan BL18 mencatat `extra_services` bahkan belum
menghasilkan poin apa pun.

---

## Tahapan

Tiap tahap punya gerbang verifikasi. Jangan lanjut kalau gerbangnya merah.

### Tahap 0 — Siapkan MariaDB lokal (tanpa perubahan kode)

Port ini tidak boleh diuji langsung terhadap Hostinger.

Versi server sudah dipastikan: **MariaDB 11.8.9**, dibaca dari banner handshake
Hostinger. Tag image disamakan dengan itu — bukan `mariadb:11` yang mengambang.

```bash
docker run -d --name hns-mariadb -p 127.0.0.1:3307:3306 \
  -e MARIADB_ROOT_PASSWORD=devpass -e MARIADB_DATABASE=ticketing \
  -v hns-mariadb-data:/var/lib/mysql --restart unless-stopped mariadb:11.8
```

**Gerbang:** `docker exec hns-mariadb mariadb -uroot -pdevpass -e "select version()"`
mengembalikan 11.8.x.

### ⛔ Port 3307 dan 3308 tidak boleh tertukar

Kalau Tahap 5 nanti memakai SSH tunnel, database Hostinger akan muncul sebagai
`127.0.0.1` di laptop — dan `LOCAL_HOSTS` di `vitest.setup.ts` akan
menerimanya, lalu 477 test membuat dan menghapus baris **di Hostinger**. Guard
itu menilai host, dan tidak punya cara membedakan tunnel dari container.

| Alamat | Isi | Boleh `npm test`? |
|---|---|---|
| `127.0.0.1:3307` | container lokal | Ya |
| `127.0.0.1:3308` | tunnel ke Hostinger | **Tidak.** Tutup tunnel dulu |

### Tahap 1 — Schema sampai `prisma validate` bersih

Blocker utama. Selama ini merah, tidak ada langkah lain yang bisa dikerjakan.

1. `provider = "postgresql"` → `"mysql"`
2. `extra_services String[] @default([])` → `Json?` (sesuai keputusan di atas)
3. ~~`@@map` pada setiap model~~ — **tidak perlu.** Koreksi terhadap inventaris
   lama dan terhadap perkiraan saya sendiri sebelum probe: server memang
   `lower_case_table_names=0`, jadi nama tabel sensitif huruf — tapi Prisma
   membuat **dan** mengkueri `Ticket` dengan ejaan yang sama, dikutip backtick.
   Konsisten dengan dirinya sendiri, jadi jalan tanpa `@@map`.
   Satu-satunya risiko tersisa: dump lalu restore ke server yang memakai
   `lower_case_table_names=1` akan menurunkan semua nama jadi huruf kecil.
   Catat saja, jangan dikerjakan sekarang
4. **Paksa mode strict.** `SET SESSION sql_mode='STRICT_TRANS_TABLES'` saat
   koneksi dibuka di `lib/db.ts`, `prisma/seed.ts`, dan `scripts/create-user.ts`
   — server berjalan non-strict (lihat "Fakta server" di atas). Container Tahap 0
   disamakan, supaya test tidak berjalan dengan aturan berbeda dari produksi
4. `lib/db.ts` dan `prisma/seed.ts`: `@prisma/adapter-pg` → `@prisma/adapter-mariadb`
   (versi 7.10.0, cocok dengan Prisma 7.10.0 yang terpasang), termasuk penanganan
   SSL-nya
5. `scripts/create-user.ts` ikut, karena ia membuat adapter sendiri

**Gerbang:** `npx prisma validate` bersih **dan** `npx prisma db push` ke
container Tahap 0 berhasil.

### Tahap 2 — Query yang Postgres-only

1. Hapus 15 `mode: "insensitive"` di 6 file: `app/admin/logs/`,
   `app/admin/tickets/`, `app/admin/users/`, `app/rma/logs/`,
   `app/sales/tickets/`, `app/technician/tickets/`. **Dihapus, bukan diganti** —
   collation default MariaDB sudah case-insensitive, jadi perilakunya tetap sama
2. `pg_advisory_xact_lock` di `app/actions/rma.ts:44` (`allocateRmaCode`) →
   dihapus. Fungsi itu sudah punya retry 3× terhadap unique-violation sebagai
   jaring pengaman; tanpa lock, retry lebih sering terpicu tapi hasilnya tetap
   benar. `GET_LOCK()` bisa menyusul kalau retry terbukti sering tabrakan
3. `distinct` di 2 tempat: dibiarkan. Prisma mengemulasikannya di memori untuk
   MySQL — jalan, hanya kurang efisien

**Gerbang:** `npx tsc --noEmit` bersih.

### Tahap 3 — Realtime → polling

1. `NotificationBell.tsx`: buang `.channel(...)`, panggil `pollUnreadCount` di
   `setInterval` 30 detik, `clearInterval` saat unmount
2. `RequestsBell.tsx`: sama polanya, terhadap `/api/ticket-requests`
3. **`AGENTS.md` aturan #9 harus ikut diubah.** Sekarang berbunyi "Real-time
   features use Supabase `.channel()` WebSockets, not `setInterval` polling" —
   kalau dibiarkan, sesi berikutnya akan mengembalikan polling ini ke Realtime
   karena menganggapnya regresi. Aturan itu diganti dengan catatan bahwa
   Realtime tidak berlaku di MySQL
4. Env Supabase jadi opsional. `lib/supabase.ts` masih memanggil `createClient()`
   di module scope, jadi dua komponen itu perlu berhenti meng-import-nya sama
   sekali — kalau tidak, placeholder tetap wajib diisi selamanya

**Gerbang:** lonceng menampilkan hitungan yang benar, dan bertambah dalam ≤30
detik setelah notifikasi baru.

### Tahap 4 — 477 test terhadap MariaDB

`vitest.setup.ts` memfilter berdasarkan **host**, bukan skema URL, dan
`127.0.0.1` sudah ada di daftar `LOCAL_HOSTS` — jadi guard-nya tetap bekerja
tanpa diubah.

Perkiraan kegagalan, supaya tidak terkejut: pencarian case-insensitive, apa pun
yang menyentuh `extra_services`, dan urutan hasil query yang tidak punya
`orderBy` eksplisit (MySQL dan Postgres berbeda soal ini).

**Gerbang:** 477 lulus. Angka yang lebih rendah bukan "hampir" — telusuri satu
per satu.

### Tahap 5 — Deploy ke hPanel Node.js Web Apps

Baru di sini menyentuh Hostinger.

1. **`output: "standalone"` di `next.config.ts`.** Hostinger membangun Next
   dengan standalone output. Ini perubahan yang **belum pernah diuji di proyek
   ini** — uji `npm run build && node .next/standalone/server.js` di lokal dulu,
   jauh sebelum deploy
2. Buat database MySQL di hPanel — **baru sekarang** form di screenshot itu ada
   gunanya
3. Env lewat panel Hostinger (bukan `.env.local`; panel menyuntikkannya ke build
   dan runtime). Daftar variabelnya sama seperti runbook staging, minus
   `DATABASE_SSL`, dan Supabase boleh benar-benar kosong setelah Tahap 3
4. `prisma db push` dijalankan **dari laptop lewat SSH tunnel** — sudah diuji
   dan berhasil, jadi **Remote MySQL tidak perlu disentuh sama sekali** dan tidak
   ada yang dibuka ke internet:

   ```bash
   ssh -p 65002 -N -L 3309:127.0.0.1:3306 <SSH_USER>@<SSH_HOST>
   ```

   Sasarannya **`127.0.0.1:3306`**, bukan IP publik MySQL. Grant user-nya
   `@127.0.0.1` saja, jadi menunjuk ke `<MYSQL_HOST>:3306` lewat tunnel pun
   tetap ditolak — sudah dibuktikan.
5. `npm run create-user` juga **dari laptop**, lewat tunnel yang sama — skrip itu
   interaktif dan hanya butuh koneksi database, tidak harus berada di server. Ini
   menyelesaikan masalah "tidak ada shell interaktif di Node.js Web Apps"
6. **Tutup tunnel begitu selesai.** Selama terbuka, database Hostinger menyamar
   sebagai `127.0.0.1` dan `npm test` akan menghapus isinya

**Gerbang:** 9 smoke test di `docs/deploy-staging-vps.md` Langkah 10 — isinya
masih berlaku seluruhnya, hanya infrastrukturnya yang berbeda.

---

## Perkiraan dan risiko

| Tahap | Ukuran | Risiko utama |
|---|---|---|
| 0 | kecil | Salah menebak engine Hostinger (MariaDB vs MySQL 8) |
| 1 | sedang | `@@map` menyentuh setiap model; salah satu terlewat = tabel tidak ketemu saat runtime, bukan saat build |
| 2 | kecil | Rendah. Semua mekanis |
| 3 | kecil | Rendah, asal `AGENTS.md` ikut diubah |
| 4 | **tidak bisa diperkirakan** | Ini tahap yang menentukan. 477 test belum pernah jalan di MySQL — jumlah kegagalannya tidak bisa ditebak sebelum dijalankan |
| 5 | sedang | `output: "standalone"` belum teruji |

**Tahap 4 adalah tempat rencana ini bisa meleset jauh.** Semua tahap lain bisa
diperkirakan dari pembacaan kode; yang ini tidak. Kalau kegagalannya banyak dan
berpola dalam (misalnya seputar transaksi atau urutan), itu sinyal untuk
menimbang ulang, bukan untuk menambal satu per satu.

---

## Yang saya minta persetujuannya

1. **`extra_services` → kolom `Json`** (bukan tabel join), dengan alasan di atas
2. **Advisory lock dihapus**, bukan diganti `GET_LOCK()`
3. **Realtime → polling 30 detik**, dan `AGENTS.md` aturan #9 ikut diubah
4. Urutan tahap di atas, dengan **berhenti di setiap gerbang merah**

Dan satu yang perlu kamu cek sebelum Tahap 0: **versi server database di
hPanel** (phpMyAdmin → header), MariaDB atau MySQL 8, beserta angkanya.

Kalau setuju, saya mulai dari Tahap 0 dan 1.
