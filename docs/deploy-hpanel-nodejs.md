# Deploy — hPanel Node.js Web Apps + MariaDB Hostinger

Tahap 5 dari [`plan-mysql-port-execution.md`](plan-mysql-port-execution.md).
Menggantikan [`deploy-staging-vps.md`](deploy-staging-vps.md), yang ditulis untuk VPS +
PostgreSQL dan disimpan kalau suatu saat kembali ke sana.

---

## Yang SUDAH selesai, jangan diulang

| | Status |
|---|---|
| Schema di `<DB_NAME>` | ✅ **Sudah diterapkan 2026-09-28.** 25 tabel, 35 foreign key, semua InnoDB, enum lengkap termasuk `ineligible` dan `rma_process` |
| Mode strict di server | ✅ Terbukti menang atas `sql_mode` global Hostinger yang longgar |
| `output: "standalone"` | ✅ Aktif dan teruji lokal, termasuk penyalinan aset |

**Jangan jalankan `prisma db push` lagi** kecuali schema berubah. Dan begitu database
berisi data pelanggan, `db push` tidak lagi aman — saat itu baseline migration jadi wajib,
lihat Bagian A `docs/rma-deploy.md`.

---

## ⛔ Tiga larangan

1. **`npm run seed`** — enam akun dengan password yang tertulis di repo, dan `upsert`-nya
   me-reset password admin yang sudah ada.
2. **`npx prisma db seed` dan `npx prisma migrate reset`** — dua pintu belakang ke file yang
   sama, lewat `prisma.config.ts`.
3. **`npm test` selagi SSH tunnel terbuka.** Lewat tunnel, database Hostinger muncul sebagai
   `127.0.0.1`, dan `LOCAL_HOSTS` di `vitest.setup.ts` akan menerimanya. 477 test membuat dan
   menghapus baris.

---

## Variabel env untuk panel

Lebih pendek dari sebelumnya: **tiga variabel Supabase tidak dibutuhkan lagi.** Modul
`lib/supabase.ts` sudah dihapus karena tidak ada lagi yang mengimpornya.

| Variabel | Nilai | Catatan |
|---|---|---|
| `DATABASE_URL` | `mysql://<DB_USER>:<PASSWORD>@127.0.0.1:3306/<DB_NAME>` | Lihat peringatan host di bawah |
| `SESSION_SECRET` | acak 32+ karakter | **Berbeda dari lokal.** `openssl rand -base64 48` |
| `NEXT_PUBLIC_APP_URL` | `https://ticketing.hnsitcenter.id` | **Ditanam saat build** — ubah = wajib build ulang |
| `R2_ACCOUNT_ID` | dari Cloudflare | |
| `R2_ACCESS_KEY_ID` | dari Cloudflare | |
| `R2_SECRET_ACCESS_KEY` | dari Cloudflare | |
| `R2_BUCKET_NAME` | dari Cloudflare | |
| `NEXT_PUBLIC_R2_PUBLIC_URL` | URL publik bucket | Ditanam saat build |
| `R2_ENDPOINT` | **kosongkan** | Diisi hanya untuk S3 selain Cloudflare. Endpoint non-`https://` ditolak saat produksi |
| `RESEND_API_KEY` | opsional | Tanpa ini aplikasi tetap jalan, email saja tidak terkirim |
| `NEXT_PUBLIC_FROM_EMAIL` | opsional | |

**Jangan diisi:** `DATABASE_SSL` (sekarang opt-in, dan koneksinya plain TCP lokal),
`STORAGE_DRIVER` (`local` ditolak saat `NODE_ENV=production`), dan semua variabel
`*SUPABASE*`.

### ⚠️ Host database — kemungkinan besar titik gagal pertama

Grant user-nya **spesifik per host**, dan saat ini hanya `@127.0.0.1`:

```
GRANT ALL PRIVILEGES ON `<DB_NAME>`.* TO `<DB_USER>`@`127.0.0.1`
```

Itu berarti `127.0.0.1` benar **hanya kalau aplikasi Node berjalan di mesin yang sama dengan
MySQL.** Kalau Node.js Web Apps ternyata berjalan di container terpisah, koneksinya akan
ditolak dengan pesan yang menyebutkan IP asalnya:

```
Access denied for user '<DB_USER>'@'10.x.x.x'
```

**Kalau itu muncul:** catat IP di pesan itu, lalu tambahkan di hPanel → Database →
**Remote MySQL**, dan ganti host di `DATABASE_URL` sesuai yang dipakai panel. Pesan errornya
sendiri yang memberi tahu jawabannya — jangan menebak.

---

## Langkah

### 1. Push branch

```bash
git push -u origin port/postgres-to-mariadb
```

Node.js Web Apps deploy dari Git, jadi branch harus ada di remote dulu.

**🛑 Jangan deploy branch lain.** `fix/points-table-unification` ada di remote dan
**mengubah angka poin yang terlihat teknisi** — tidak boleh naik tanpa pengumuman
(`docs/points-change-announcement.md`).

### 2. Buat aplikasinya di hPanel

hPanel → Node.js / Web Apps → aplikasi baru:

| Kolom | Isi |
|---|---|
| Repository | `HNS-IT-Center/ticketing_service` |
| Branch | `port/postgres-to-mariadb` |
| Build command | `npm ci && npm run build` |
| Start command | `npm run start` |
| Node version | 20 LTS atau lebih baru (Next.js 16 minimal 20.9) |

`npm run build` memicu `postbuild`, yang menyalin `.next/static` dan `public/` ke dalam
`.next/standalone`. Tanpa langkah itu setiap halaman tetap menjawab 200 sementara seluruh
CSS dan JS 404 — halaman polos yang lolos semua pemeriksaan status.

`npm run start` menjalankan `node .next/standalone/server.js`. **`next start` sudah tidak
berlaku** dengan output standalone; ia menyala lalu memperingatkan, jadi salah tanpa gagal.

### ⛔ Jangan set `NODE_ENV=production` di panel

`npm ci` melewati `devDependencies` kalau `NODE_ENV=production`, dan yang hilang bukan
hal sepele:

| Paket | Yang mati |
|---|---|
| `typescript`, `tailwindcss`, `@tailwindcss/postcss` | `npm run build` |
| `tsx` | `npm run create-user` |

Server Next menyetel `NODE_ENV=production` sendiri saat berjalan. Tidak perlu, dan tidak
boleh, diset lebih dulu.

### 3. Isi env, lalu deploy

Isi seluruh tabel di atas **sebelum** build pertama. Variabel `NEXT_PUBLIC_*` ditanam ke
dalam bundle saat build — mengubahnya nanti tanpa build ulang tidak berpengaruh, dan tidak
memunculkan error apa pun.

**🛑 BERHENTI** kalau build gagal:

| Gejala | Sebab |
|---|---|
| hanya `Killed` | Kehabisan memori saat build |
| `Cannot find module 'typescript'` | `NODE_ENV=production` diset — lihat di atas |
| `R2_ENDPOINT must use https in production` | `R2_ENDPOINT` diisi. Kosongkan |
| error TypeScript | Branch salah. `tsc` bersih di branch ini |

### 4. Akun pertama — dari laptop, lewat tunnel

Node.js Web Apps tidak memberi shell interaktif, dan `create-user` memang interaktif. Tapi
skrip itu hanya butuh koneksi database, bukan harus berada di server.

Terminal 1 — biarkan terbuka:

```bash
ssh -p 65002 -N -L 3309:127.0.0.1:3306 <SSH_USER>@<SSH_HOST>
```

Terminal 2 — tiga kali, satu per role:

```bash
DATABASE_URL="mysql://<DB_USER>:<PASSWORD>@127.0.0.1:3309/<DB_NAME>" npm run create-user
```

Buat minimal: satu **Administrator**, satu **Technician**, satu **RMA**.

Yang akan diminta, supaya tidak kaget di tengah prompt:

- **Role** — ketik persis: `Administrator`, `Technician`, `RMA`
- **WhatsApp** — wajib `+62XXXXXXXXX`, 8–13 digit setelah `+62`
- **Password** — minimal **12 karakter**, harus ada huruf kecil, besar, dan angka.
  `admin123` / `tech123` / `rma123` ditolak: skrip memuat daftar password yang pernah
  dipublikasikan di repo ini
- Konfirmasi — ketik `ya`

Catat di password manager sekarang. Tidak ada cara membacanya lagi.

**Tutup tunnel begitu selesai.**

### 5. Smoke test

| # | Uji | Lolos kalau |
|---|---|---|
| 1 | Login Administrator | Dashboard terbuka, tidak ada redirect loop |
| 2 | **Halaman bergaya**, bukan teks polos | Membuktikan `postbuild` menyalin aset. Kalau polos: cek log build |
| 3 | Login RMA → `/rma/dashboard` | Paling cepat mengungkap schema kurang — membaca `RmaCase`, `RmaEvent`, semua enum baru |
| 4 | Buat tiket Service biasa | Berhasil, kode tiket berurutan |
| 5 | Buat tiket Warranty Claim | SN dan tanggal beli wajib, tombol **Create Ticket aktif** |
| 6 | Ambil tiket klaim sebagai teknisi | "Serahkan ke RMA" muncul, "Mark Done" tidak |
| 7 | Handover: unggah 1 foto + rekomendasi | Berhasil. **Ini yang menguji R2** |
| 8 | Login RMA | Case muncul, foto bisa dibuka |
| 9 | **Lonceng notifikasi** | Bertambah dalam **≤30 detik**, bukan seketika. Itu perilaku benar sekarang — polling, bukan Realtime |

**🛑 #7 gagal upload** → itu R2. Jangan ditambal dengan `STORAGE_DRIVER=local`: ditolak saat
`NODE_ENV=production`, dan kalaupun lolos ia menulis ke filesystem yang hilang tiap deploy.

**🛑 #7 gagal 413** → batas ukuran body di reverse proxy Hostinger. `next.config.ts`
menyetel server action 20 MB; kalau panel punya pengaturan ukuran upload, naikkan ke 25 MB.

---

## Yang TIDAK akan berfungsi, dan itu bukan bug

**Halaman publik tiket** (`/{tanggal}/{kode}`) akan mengarahkan pengunjung ke `/login`.
Itu kerusakan yang sudah ada sebelum port ini — **BL21**, dua kerusakan terpisah di
`proxy.ts` dan `PublicShareButton`. Branch sendiri dari `origin/main`. Jangan dianggap
sebagai akibat deploy ini.

---

## Yang masih terbuka

| | |
|---|---|
| **Data pelanggan di Supabase** | Aplikasi lama berjalan di PostgreSQL Supabase dengan data asli. Port ini membuat kode hanya bisa jalan di MariaDB, jadi data itu perlu keputusan: ikut dimigrasi, atau ditinggal |
| **Baseline migration** | Database ini di-`db push`, jadi tanpa riwayat migration. Aman selama masih kosong; wajib begitu berisi data |
| **RLS** | Tidak berlaku di MariaDB. Pengamanan bertumpu pada grant per-host dan session aplikasi |
| **Rotasi password** | Password MySQL dan SSH saat ini identik, dan port 3306 terbuka ke internet. Buat keduanya berbeda saat rotasi |
