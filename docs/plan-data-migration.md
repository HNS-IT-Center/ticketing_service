# Rencana Migrasi Data — Supabase PostgreSQL → MariaDB Hostinger

Status: **rancangan, belum dieksekusi.** Tidak ada satu baris pun yang dipindahkan.

Keputusan yang mendasari (2026-09-29): **cutover ditunda.** Produksi tetap berjalan di
Supabase sampai data terbukti pindah dengan benar.

---

## ⛔ Kenapa rencana ini ada

Sampai 2026-09-29 rencana deploy berasumsi database tujuan boleh kosong. Asumsi itu
salah. Yang ditemukan dengan membaca database produksi langsung:

| | |
|---|---|
| `ticketing.hnsitcenter.id` | **hidup** — `/login` menjawab HTTP 200 |
| Tiket | **512**, 22 Juni → **28 September 2026** |
| Sebaran | Jun 93 · Jul 189 · Agu 126 · Sep 104 |
| User | **16** — 11 Teknisi, 5 Administrator |
| Akun seed bawaan repo | **1** dari 16; sisanya staf sungguhan |
| `TicketStatusLog` | **2.485** |
| `TechnicianPerformance` | 10 baris |
| `TicketMessage` | 10 |
| `StoreLocation` | 2 |
| `RmaCase` / `RmaEvent` | **tabel belum ada** — fitur RMA belum pernah tayang |

Men-deploy build MariaDB ke aplikasi itu tanpa migrasi berarti: tidak ada akun yang bisa
login, 512 tiket hilang dari tampilan, dan poin 11 teknisi kembali nol. Datanya tetap utuh
di Supabase, tapi sistemnya berhenti berfungsi sampai dikembalikan.

### ⚠️ Bahaya yang aktif sekarang

Variabel env di panel hPanel sudah diubah ke MariaDB. Selama itu terpasang, **restart atau
deploy apa pun akan mengalihkan produksi ke database kosong**, tanpa perlu build baru.

**Kembalikan dulu**: `DATABASE_URL` ke Supabase, plus tiga variabel `*SUPABASE*`, dan build
command ke semula. Baru lanjut membaca.

---

## Yang membuat ini tidak sederhana

Bukan volumenya — 512 tiket kecil dan selesai dalam sekali jalan. Yang menuntut ketelitian
adalah perbedaan bentuk antara dua database.

### 1. Schema tujuan lebih baru daripada schema asal

MariaDB sudah dibentuk dari `prisma/schema.prisma` yang memuat pekerjaan RMA. Supabase
belum. Jadi ada kolom dan tabel di tujuan yang **tidak punya sumber**:

| Di tujuan, tidak ada di Supabase | Perlakuan |
|---|---|
| `RmaCase`, `RmaEvent` | Dibiarkan kosong. Tidak ada riwayat untuk dipindahkan |
| `TicketWarrantyDetail.claim_eligible` | Pakai default `true` |
| `TicketWarrantyDetail.ineligibility_reason` | `NULL` |
| Nilai enum `rma_process`, `RMA`, `rma_update`, seluruh `RmaStatus` | Ada di tujuan, tidak akan muncul di data lama |

**Langkah pertama yang wajib: diff kolom per tabel antara Supabase dan schema baru.**
Tanpa itu, kolom yang berubah nama akan diam-diam tertinggal `NULL`.

### 2. `extra_services` berubah tipe

Di Supabase `text[]` (array asli PostgreSQL); di MariaDB `Json`. Nilai harus dikonversi
dari array Postgres menjadi string JSON. Array kosong harus menjadi `[]`, bukan `null` —
kode membacanya dengan `?.length`.

### 3. Mode strict akan menolak apa yang Postgres terima

Koneksi aplikasi memaksa `STRICT_TRANS_TABLES`. Itu benar dan disengaja, tapi berarti baris
yang melewati batas kolom akan **ditolak saat migrasi**, bukan dipotong diam-diam.

Kemungkinan terbesar: kolom yang di PostgreSQL `TEXT` tanpa batas dan di MySQL menjadi
`VARCHAR(191)` — yaitu kolom **nama**: `User.name`, `Ticket.customer_name`,
`Ticket.device_name`, `TicketPcBuildComponent.component_name`, `RmaCase.vendor_name`,
`StoreLocation.name`, `Upgrade.name`.

**Periksa sebelum migrasi**, bukan saat gagal di tengah:

```sql
SELECT max(length(name)) FROM "User";
SELECT max(length(customer_name)), max(length(device_name)) FROM "Ticket";
```

Kalau ada yang melebihi 191, kolomnya dinaikkan ke `@db.Text` lebih dulu — bukan datanya
yang dipotong.

### 4. Urutan foreign key

35 foreign key di tujuan. Impor harus berurutan dari induk ke anak:

```
StoreLocation
  └─ User
       ├─ TechnicianStoreAssignment
       ├─ TechnicianPerformance / TechnicianWorkload
       ├─ TechnicianLeave / ShiftOverride
       ├─ UserTitle
       └─ Ticket
            ├─ Ticket*Detail (service / warranty / cleaning / upgrade / pcbuild)
            ├─ TicketPcBuildComponent
            ├─ TicketAttachment
            ├─ TicketMessage
            ├─ TicketStatusLog
            ├─ TicketAssignmentRequest
            ├─ TicketTimeLog
            └─ Notification
Upgrade  (mandiri, sebelum TicketUpgradeDetail)
```

ID memakai `cuid` berupa string, jadi **dipertahankan apa adanya** — tidak ada pemetaan ID
baru, dan relasi tetap utuh tanpa tabel terjemahan.

### 5. Lampiran file tidak ikut pindah, dan memang tidak perlu

`TicketAttachment.file_url` menunjuk ke Cloudflare R2, bukan ke database. Selama bucket dan
`NEXT_PUBLIC_R2_PUBLIC_URL` tidak berubah, file tetap terbaca setelah migrasi. **Jangan
ganti bucket saat cutover** — itu memutus setiap lampiran sekaligus.

---

## Tahapan

### ✅ Tahap A–C — SELESAI 2026-09-29, latihan lolos

Rancangan awal memecah ini jadi tiga tahap: diff schema di atas kertas, uji panjang kolom,
baru menyalin. Itu kelewat hati-hati, dan pertanyaannya tepat: **tujuannya kosong dan bukan
produksi, jadi menjalankannya sudah merupakan latihan.**

Menjalankan langsung juga memberi jawaban yang lebih jujur. Mode strict **menolak** nilai
kepanjangan dan foreign key **menolak** urutan yang salah, jadi kegagalannya berisik. Diff
schema pun lahir dari eksekusi: skrip melaporkan sendiri kolom yang tidak punya pasangan.

`scripts/migrate-from-supabase.ts`, sekali jalan terhadap container lokal:

```
TOTAL  sumber 7139  tujuan 7139
✅ Semua tabel cocok.
✅ Setiap kolom di sumber punya pasangan di tujuan.
```

23 tabel, **nol** penolakan mode strict, **nol** pelanggaran foreign key, **nol** kolom
tertinggal. Dijalankan dua kali berturut-turut dengan hasil sama — skripnya idempoten.

Verifikasi isi, bukan sekadar jumlah baris:

| Yang diperiksa | Hasil |
|---|---|
| Password | `$2b$`, 60 karakter — hash bcrypt utuh, staf tetap pakai password lama |
| `extra_services` | `text[]` → Json benar: `["repaste","deep_clean","os_reinstall"]`; yang kosong `[]`, bukan `null` |
| Enum | 428 `completed`, 27 `done`, 10 `waiting`, 6 `cancelled` |
| Relasi | NGH-000005 → teknisi "Dennis Mustika Putra", toko "Nagoya Hill", 5 log, 3 lampiran |
| Poin teknisi | Rianto 115/483, Mitchel 115/481, Steaven 79/302 |
| Leaderboard | 486 log berpoin (`EARNING_STATUS_LOG_FILTER`) |
| Pencarian | `ngw` dan `NGW` sama-sama 365 — case-insensitive terjaga di data asli |
| Test suite | 509 lulus meski container berisi salinan produksi |

**Kekhawatiran `VARCHAR(191)` tidak terbukti** — tidak ada satu pun nilai yang ditolak. Uji
`max(length(...))` yang direncanakan jadi tidak perlu; eksekusinya sudah menjawabnya.

### Tahap D — Latihan lengkap ke Hostinger

Ulangi Tahap C terhadap database Hostinger, lalu bandingkan lagi. Setelah cocok, **kosongkan
kembali** dan tinggalkan sampai jendela cutover — supaya data yang masuk saat cutover adalah
salinan segar, bukan salinan dari beberapa hari sebelumnya.

### Tahap E — Cutover

Di jam sepi, dengan urutan yang bisa dibalik:

1. Umumkan jeda singkat ke staf
2. Produksi dibuat read-only atau dihentikan sebentar — supaya tidak ada tiket baru masuk di
   tengah penyalinan
3. `pg_dump` Supabase sebagai cadangan
4. Jalankan migrasi ke Hostinger
5. Verifikasi jumlah baris
6. Ganti env di panel ke MariaDB, deploy branch `main`
7. Smoke test 10 langkah (`docs/deploy-hpanel-nodejs.md`)

**Mundur:** kembalikan `DATABASE_URL` ke Supabase dan deploy ulang commit lama. Data
Supabase tidak disentuh sepanjang proses, jadi pemulihannya adalah perubahan env, bukan
restore.

---

## Yang perlu diputuskan sebelum Tahap A

| | |
|---|---|
| **Akun seed** | 1 dari 16 user adalah akun bawaan repo dengan password yang tertulis terbuka. Ikut dipindahkan, atau dinonaktifkan saat migrasi? |
| **Jendela waktu** | Kapan toko paling sepi. Penyalinan sendiri hitungan menit; yang menentukan adalah waktu verifikasi |
| **Data demo lokal** | `NGW-000004..NGW-000009` ada di database lokal. Pastikan tidak ikut terbawa ke skrip migrasi |

---

## Yang TIDAK ditangani rencana ini

| | |
|---|---|
| **BL21** | Halaman publik tiket mengarahkan pengunjung ke `/login`. Cacat lama, branch sendiri |
| **Dokumentasi tertinggal** | `CLAUDE.md` dan `AGENTS.md` masih menyebut Supabase Postgres dan `@prisma/adapter-pg`. Aturan #2 `AGENTS.md` sekarang keliru dan akan menyesatkan sesi berikutnya |
| **Baseline migration** | Setelah database berisi data, `prisma db push` tidak lagi aman. Bagian A `docs/rma-deploy.md` jadi wajib untuk perubahan schema berikutnya |
