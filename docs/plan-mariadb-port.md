# BL15 — Port ke MySQL / MariaDB

Inventaris nyata, dibuat 2026-09-27 dengan menelusuri kode, bukan perkiraan.
Konteks: rencana staging di Hostinger memakai database bawaannya.

---

## Ringkasan

Ini **bukan** pekerjaan deploy. Ada satu perubahan schema yang memaksa migrasi data, satu
fitur yang mati total dan harus ditulis ulang, dan 477 test yang saat ini berjalan di atas
Postgres.

**Baca bagian "Jalan pintas" di bawah dulu.** Untuk kebutuhan staging, kemungkinan besar
tidak perlu port sama sekali.

---

## Yang patah, satu per satu

### 1. ⛔ `extra_services String[]` — blocker keras

`prisma/schema.prisma:280`. **Scalar list hanya ada di PostgreSQL dan MongoDB.** Prisma tidak
bisa memetakannya ke MySQL/MariaDB sama sekali — ini gagal di `prisma validate`, bukan gagal
saat runtime.

Pilihan penggantinya:

| Opsi | Konsekuensi |
|---|---|
| Kolom `Json` | Perubahan paling kecil. Tapi MariaDB JSON adalah alias LONGTEXT tanpa operator filter, jadi query "tiket yang punya extra service X" harus difilter di aplikasi |
| Tabel join `TicketExtraService` | Benar secara relasional dan bisa di-query. Perlu migrasi data dan menyentuh setiap pembaca |

Pembacanya: `app/actions/tickets.ts` (`toggleExtraServiceAction`),
`app/sales/tickets/page.tsx`, `app/technician/tickets/page.tsx`,
`app/technician/tickets/[id]/page.tsx`.

### 2. ⛔ Supabase Realtime mati total

`components/layout/NotificationBell.tsx` dan `components/layout/RequestsBell.tsx` memakai
`.channel(...).on("postgres_changes", ...)`. Itu membaca **WAL PostgreSQL** lewat Supabase.
Tidak ada padanannya kalau databasenya MariaDB dan Supabase tidak lagi dipakai.

Harus ditulis ulang jadi polling atau SSE. Catatan: aturan #9 di `AGENTS.md` ("Real-time
features use Supabase `.channel()` WebSockets, not `setInterval` polling") jadi tidak berlaku
dan harus ikut diubah, kalau tidak sesi berikutnya akan mengembalikannya.

### 3. `mode: "insensitive"` — 15 pemakaian, 6 file

PostgreSQL-only di Prisma; MySQL menolaknya.

Kabar baiknya: collation default MySQL/MariaDB (`utf8mb4_general_ci`) **sudah**
case-insensitive, jadi perbaikannya adalah **menghapus opsinya**, bukan mencari penggantinya.
Perilaku pencarian tetap sama.

File: `app/admin/logs/page.tsx`, `app/admin/tickets/page.tsx`, `app/admin/users/page.tsx`,
`app/rma/logs/page.tsx`, `app/sales/tickets/page.tsx`, `app/technician/tickets/page.tsx`.

### 4. `pg_advisory_xact_lock` — 1 tempat

`app/actions/rma.ts:44`, di `allocateRmaCode()`. Mengunci per-prefix supaya dua staff di toko
yang sama tidak mengambil nomor RMA yang sama.

Penggantinya `GET_LOCK()` / `RELEASE_LOCK()`. **Atau** dihapus saja: fungsi itu sudah punya
retry 3 kali terhadap unique-violation sebagai jaring pengaman. Tanpa lock, retry lebih sering
terpicu tapi hasilnya tetap benar. Untuk staging, menghapusnya cukup.

### 5. `work_days Json?`

`prisma/schema.prisma:188`. Didukung Prisma di MariaDB, tapi sebagai LONGTEXT tanpa operator
filter JSON. Perlu dicek apakah ada yang memfilter berdasarkan isinya, bukan sekadar membaca.

### 6. Nama tabel PascalCase

`Ticket`, `RmaCase`, `User`. MySQL di Linux membedakan huruf besar-kecil pada nama tabel.
Perlu `lower_case_table_names=1` di server, atau `@@map` di setiap model.

### 7. `distinct` — 2 tempat

`app/actions/rma.ts:416`, `app/rma/cases/[id]/page.tsx:111`. Prisma mengemulasikannya di
memori untuk MySQL. Jalan, hanya kurang efisien. Tidak memblokir.

### 8. Test suite

477 test berjalan terhadap container Postgres lokal, dan `vitest.setup.ts` menolak
`DATABASE_URL` non-lokal. Port ini berarti suite-nya perlu MariaDB juga — kalau tidak, yang
diuji tetap perilaku Postgres sementara produksi berjalan di MariaDB. Itu jenis kesenjangan
yang menghasilkan bug yang cuma muncul di server.

### 9. Enum

MySQL punya ENUM native dan Prisma mendukungnya. Justru lebih longgar dari Postgres: nilai
enum di MySQL **bisa** dihapus.

### 10. Adapter

`@prisma/adapter-mariadb@7.10.0` ada dan versinya cocok dengan Prisma 7.10.0 yang dipakai.
`lib/db.ts` dan `prisma/seed.ts` perlu diubah, termasuk penanganan SSL-nya.

---

## Jalan pintas yang sebaiknya dipertimbangkan dulu

Kebutuhannya adalah **staging dengan data yang boleh dibuang**. Untuk itu, port MariaDB
memberi kerugian besar tanpa manfaat yang sepadan.

**Jalankan PostgreSQL di VPS Hostinger-nya.** Satu container:

```bash
docker run -d --name hns-pg -p 127.0.0.1:5432:5432 \
  -e POSTGRES_PASSWORD=... -e POSTGRES_DB=ticketing \
  -v hns-pg-data:/var/lib/postgresql/data --restart unless-stopped postgres:17
```

Lalu `prisma db push` ke database kosong itu dan `npm run create-user`. **Nol perubahan
kode**, dan staging-nya menjalankan kode yang sama persis dengan yang akan berjalan di
produksi — yang justru inti dari staging.

Yang hilang hanya Supabase Realtime (lonceng notifikasi tidak update otomatis), karena itu
fitur Supabase, bukan fitur Postgres. Untuk staging biasanya bisa diterima.

Kalau keputusan pindah ke MariaDB memang final untuk produksi, port-nya tetap perlu — tapi
kerjakan sebagai proyeknya sendiri, bukan sebagai bagian dari "mencoba di Hostinger".

---

## Urutan kalau port tetap dilakukan

1. **Putuskan `extra_services` dulu** (Json atau tabel join). Ini menentukan bentuk migrasi.
2. MariaDB lokal + `@prisma/adapter-mariadb`, `provider = "mysql"`, `prisma validate` sampai
   bersih.
3. Hapus 15 `mode: "insensitive"`, ganti advisory lock.
4. Jalankan 477 test terhadap MariaDB. Perkirakan kegagalan pada pencarian case-insensitive
   dan pada apa pun yang menyentuh `extra_services`.
5. Tulis ulang Realtime jadi polling/SSE, dan perbarui aturan #9 di `AGENTS.md`.
6. Baru deploy.

⚠️ **Jangan jalankan baseline Postgres di `docs/rma-deploy.md` kalau MariaDB jadi dipilih.**
SQL-nya sintaks Postgres dan akan terbuang. Dokumen itu sendiri sudah memperingatkan hal ini.
