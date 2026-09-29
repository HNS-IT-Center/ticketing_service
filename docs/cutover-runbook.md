# Runbook Cutover — Supabase → MariaDB

Memindahkan `ticketing.hnsitcenter.id` dari Supabase PostgreSQL ke MariaDB Hostinger.

**Sistem ini dipakai.** 512 tiket, tiket terakhir 28 September, 11 teknisi dan 5
administrator. Setiap langkah di bawah punya cara mundur, dan tidak ada langkah yang
menyentuh Supabase selain membacanya.

---

## Yang sudah terbukti, dan yang belum

| | Status |
|---|---|
| Port kode ke MariaDB | ✅ 509 test, `tsc` bersih |
| Schema di database Hostinger | ✅ 25 tabel, 35 foreign key |
| Skrip migrasi | ✅ 7.139/7.139 baris, dua kali, lokal **dan** Hostinger |
| Build webpack | ✅ di laptop — ❌ **belum pernah di Hostinger** |
| Aplikasi berjalan di Hostinger | ❌ belum pernah |

**Risiko terbesar cutover ini adalah build pertama di server, bukan datanya.** Turbopack
sudah gagal di sana sekali. `build:webpack` seharusnya lolos karena tidak men-spawn proses,
tapi itu masih hipotesis.

---

## ⛔ Buktikan build-nya dulu, di luar produksi

Sangat disarankan sebelum menyentuh jadwal cutover: **buat aplikasi Node.js kedua** di
hPanel dengan subdomain lain (misal `staging.hnsitcenter.id`), arahkan ke branch
`port/postgres-to-mariadb`, env sama persis dengan rencana produksi.

Kalau build di sana berhasil dan 10 smoke test lolos, cutover berubah dari "coba-coba di
sistem hidup" menjadi "ulangi yang sudah terbukti". Database Hostinger sudah berisi salinan
latihan, jadi aplikasinya langsung punya data untuk diuji.

Kalau tidak mau membuat aplikasi kedua, lanjut ke bawah — tapi sadari Langkah 4 adalah
langkah yang belum pernah berhasil.

---

## Pre-flight

| Cek | Harus |
|---|---|
| ~~Password `admin@techserve.id`~~ | **Diputuskan dibiarkan apa adanya (2026-09-29).** `admin123` terbukti masih berlaku sebagai Administrator aktif, dan tertulis di `CLAUDE.md` + `prisma/seed.ts` di repo publik. Akun ikut pindah bersama 15 lainnya. Dicatat sebagai risiko yang diterima sadar, bukan yang terlewat — dan tidak menghalangi cutover |
| Jam sepi, dan staf diberi tahu | Sekitar 30–45 menit |
| Kredensial SSH + database di tangan | Untuk tunnel |
| `origin/port/postgres-to-mariadb` = `e30e5cb` atau lebih baru | `git fetch && git log --oneline -1 origin/port/postgres-to-mariadb` |
| Bucket R2 **tidak** diganti | 1.390 lampiran menunjuk ke sana |
| Catat posisi branch sekarang | `main` = `ff76d66`, `deploy` = `35377d1` — ini titik mundur |

---

## Langkah

### 1 — Hentikan tiket baru masuk (5 menit)

Umumkan jeda ke staf. Tujuannya bukan formalitas: tiket yang dibuat **setelah** penyalinan
dimulai tidak akan ikut pindah, dan akan hilang dari tampilan setelah cutover.

Kalau ada cara menonaktifkan aplikasi sementara di panel, pakai itu. Kalau tidak, cukup
kesepakatan bahwa tidak ada yang memakai selama jendela ini.

### 2 — Cadangkan Supabase

```bash
docker run --rm -v "$PWD:/out" postgres:17 \
  pg_dump "<DATABASE_URL_SUPABASE>" --no-owner --no-acl -Fc -f /out/pre-cutover.dump
```

File ini berisi data pelanggan asli. **Jangan di-commit.** Ini jaring pengaman terakhir;
meski begitu, Supabase tidak akan disentuh sepanjang proses, jadi kemungkinan besar tidak
akan terpakai.

### 3 — Majukan branch

```bash
git fetch origin
git push origin port/postgres-to-mariadb:main
git push origin port/postgres-to-mariadb:deploy
```

**Mundur:** `git push --force-with-lease origin ff76d66:main` dan `35377d1:deploy`.

### 4 — Build di Hostinger ⚠️ **langkah yang belum pernah berhasil**

Di panel:

| Kolom | Isi |
|---|---|
| Branch | `main` (atau `deploy`, sesuai yang dipakai aplikasi) |
| Build command | `npm ci && npm run build:webpack` |
| Start command | `npm run start` |

Jangan set `NODE_ENV=production` — itu membuat `npm ci` melewati `devDependencies`, dan
`typescript` serta `tailwindcss` ada di sana.

Env yang diubah:

- `DATABASE_URL` → `mysql://<DB_USER>:<PASSWORD>@127.0.0.1:3306/<DB_NAME>`
- **Hapus** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY` — tidak dibaca kode lagi, dan yang terakhir adalah kunci penuh
  ke database lama
- `NEXT_PUBLIC_APP_URL` tetap `https://ticketing.hnsitcenter.id` — ditanam saat build

Yang dibaca dari log, berurutan:

```
✔ Generated Prisma Client (v7.10.0)   ← kalau 7.8.0, branch-nya salah
▲ Next.js 16.2.4 (webpack)            ← flag terbaca
✓ Compiled successfully
postbuild: standalone lengkap         ← WAJIB. Tanpa ini halaman tampil tanpa CSS
```

**🛑 BERHENTI kalau gagal.** Mundur: kembalikan env ke Supabase, mundurkan branch (Langkah
3), deploy ulang. Produksi kembali seperti semula; database belum disentuh sama sekali.

| Gejala | Sebab |
|---|---|
| hanya `Killed` | Kehabisan memori. Bukan lagi soal bundler |
| panic Turbopack di `globals.css` | Build command belum tersimpan; masih memakai `npm run build` |
| `Cannot find module 'typescript'` | `NODE_ENV=production` diset |

### 5 — Salin data final

Baru setelah build sukses. Data yang disalin di Langkah ini adalah yang final — salinan
latihan di database Hostinger akan ditimpa.

Terminal 1:

```bash
ssh -p 65002 -N -L 3309:127.0.0.1:3306 <SSH_USER>@<SSH_HOST>
```

Terminal 2:

```bash
PGURL="<DATABASE_URL_SUPABASE>" \
DATABASE_URL="mysql://<DB_USER>:<PASSWORD>@127.0.0.1:3309/<DB_NAME>" \
npm run migrate:from-supabase
```

Ketik `ya` saat diminta. **Periksa nama database di prompt, bukan host-nya** — lewat tunnel,
Hostinger pun terlihat sebagai `127.0.0.1`.

Harus berakhir:

```
TOTAL  sumber 7139  tujuan 7139     (angkanya akan lebih besar kalau ada tiket baru)
✅ Semua tabel cocok.
✅ Setiap kolom di sumber punya pasangan di tujuan.
```

**🛑 BERHENTI kalau ada satu tabel pun tidak cocok.** Skripnya idempoten — boleh diulang.

Tutup tunnel setelah selesai.

### 6 — Smoke test (15–20 menit)

| # | Uji | Lolos kalau |
|---|---|---|
| 1 | Login dengan akun **staf asli** | Masuk dengan password lama — hash ikut pindah |
| 2 | Halaman **bergaya**, bukan teks polos | Membuktikan `postbuild` jalan |
| 3 | Daftar tiket admin | 512+ tiket muncul |
| 4 | **Ketik di kotak cari** | Ada hasil, tidak error. Menguji `useTextProtocol` |
| 5 | Buka satu tiket lama | Detail, lampiran, riwayat status tampil |
| 6 | Klik satu lampiran | Terbuka dari R2 |
| 7 | Leaderboard | Angka sama dengan sebelum cutover (Rianto 483, Mitchel 481) |
| 8 | Halaman performance | Tidak error |
| 9 | `/rma/dashboard` sebagai RMA | Terbuka — fitur baru, kosong, wajar |
| 10 | Buat satu tiket baru | Berhasil, kode berurutan setelah yang terakhir |
| 11 | Lonceng notifikasi | Update dalam ≤30 detik, bukan seketika. Ini benar sekarang |

**🛑 Gagal di #1, #3, atau #5** — ada yang salah dengan data. Mundur (di bawah).
**Gagal di #4** — `useTextProtocol` tidak aktif; periksa branch yang di-build.
**Gagal di #6** — bucket R2 berubah. Kembalikan `NEXT_PUBLIC_R2_PUBLIC_URL`.

### 7 — Buka kembali

Umumkan ke staf. Pantau satu hari pertama.

---

## Mundur

Bisa dilakukan di titik mana pun, dan **tidak perlu restore database** — Supabase tidak
pernah disentuh, hanya dibaca.

1. Kembalikan env di panel: `DATABASE_URL` ke Supabase, tiga variabel `*SUPABASE*` diisi
   kembali, build command ke semula
2. Mundurkan branch:
   ```bash
   git push --force-with-lease origin ff76d66:main
   git push --force-with-lease origin 35377d1:deploy
   ```
3. Deploy ulang

Produksi kembali persis seperti sebelum cutover. Tiket yang dibuat **selama** jendela
cutover di sistem MariaDB akan tertinggal — itulah sebabnya Langkah 1 ada.

---

## Setelah cutover berhasil

| | |
|---|---|
| **Jangan `prisma db push` lagi** | Database kini berisi data. Perubahan schema berikutnya butuh baseline migration — Bagian A `docs/rma-deploy.md` |
| **Supabase** | Jangan dihapus dulu. Simpan minimal beberapa minggu sebagai cadangan hidup |
| **Dokumentasi** | `CLAUDE.md` dan `AGENTS.md` masih menyebut Supabase Postgres dan `@prisma/adapter-pg`. Aturan #2 `AGENTS.md` akan menyesatkan sesi berikutnya |
| **BL21** | Halaman publik tiket masih mengarahkan pengunjung ke `/login`. Cacat lama, branch sendiri |
| **Rotasi** | Password MySQL dan SSH saat ini identik, dan port 3306 terbuka ke internet |
