# Runbook Deploy STAGING — VPS Hostinger + Postgres container

Turunan dari `docs/rma-deploy.md` untuk satu skenario yang sudah diputuskan:

- **Database:** PostgreSQL 17 di container, di VPS yang sama. Bukan MySQL/MariaDB
  (alasan: `docs/plan-mariadb-port.md` — `extra_services String[]` gagal di
  `prisma validate`, bukan gagal saat runtime)
- **Bagian A runbook induk (baseline + migration) DILEWATI** — database baru dan
  kosong, tidak ada data yang harus dipertahankan. Cukup `prisma db push`
- **Acuan kode:** `feat/rma-warranty-claim`, sudah di-push, commit `98372e9`

Data di staging adalah data buang. Jangan hubungkan ke Supabase produksi, jangan
pakai bucket R2 produksi.

---

## ⛔ Tiga larangan

### 1. Jangan `npm run seed` terhadap server

Enam akun dengan password yang tertulis terbuka di repo, dan `upsert`-nya menulis
password juga di blok `update` — jadi ia **me-reset** admin yang sudah ada dan
mengaktifkan kembali akun yang sengaja dinonaktifkan.

### 2. Dan jangan dua pintu belakang ke file yang sama

`prisma.config.ts` mendaftarkan `seed: "tsx prisma/seed.ts"`. Artinya perintah
berikut menjalankan seed yang sama, tanpa menyebut kata "seed" di `npm`:

```
npx prisma db seed          ← JANGAN
npx prisma migrate reset    ← JANGAN (drop database, lalu seed)
```

Hanya `npx prisma db push` yang aman di sini.

### 3. Jangan `NODE_TLS_REJECT_UNAUTHORIZED=0`

Berlaku se-proses: mematikan verifikasi sertifikat untuk **semua** koneksi TLS
keluar, termasuk ke R2 dan Resend. Untuk Postgres pun tidak memberi apa-apa —
`lib/db.ts` dan `scripts/create-user.ts` sudah meneruskan
`ssl: { rejectUnauthorized: false }` langsung ke driver. Di staging ini bahkan
tidak relevan: Postgres-nya lokal, plain TCP, `DATABASE_SSL=false`.

---

## PRE-FLIGHT — siapkan SEBELUM mulai

### Yang harus ada di tangan (kumpulkan siang, bukan malam)

| # | Yang disiapkan | Kenapa, dan apa yang rusak kalau tidak ada |
|---|---|---|
| 1 | **Kredensial R2 asli** — 5 nilai: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `NEXT_PUBLIC_R2_PUBLIC_URL` | `lib/r2.ts` **menolak** `STORAGE_DRIVER=local` dan endpoint non-HTTPS saat `NODE_ENV=production`. Tanpa R2, setiap upload gagal: attachment intake, foto kerusakan saat handover, bukti penolakan RMA, proof serah terima. Smoke test #6 mati. **Pakai bucket staging terpisah** — jangan sampah uji masuk bucket produksi |
| 2 | **Password Postgres container** — `openssl rand -hex 24` | Pakai **hex**, bukan base64. Base64 bisa mengandung `+ / =` yang merusak parsing `DATABASE_URL`, dan gejalanya menyesatkan: yang muncul "password authentication failed", seolah passwordnya salah ketik |
| 3 | **`SESSION_SECRET`** — `openssl rand -base64 48` | Harus **berbeda dari lokal**. `lib/session.ts` membaca `process.env.SESSION_SECRET!` tanpa validasi apa pun — kalau kosong, build tetap sukses dan login baru gagal saat dipakai |
| 4 | **Keputusan URL final** untuk `NEXT_PUBLIC_APP_URL` | Semua `NEXT_PUBLIC_*` **ditanam saat build**, bukan dibaca saat start. Ganti domain setelah build = wajib `npm run build` ulang. Putuskan sekarang: subdomain + TLS, atau `http://IP:3000` |
| 5 | **Akses git ke repo** | Repo di `github.com/HNS-IT-Center` lewat HTTPS. Kalau privat, siapkan **deploy key read-only** (SSH). Jangan `git clone https://<TOKEN>@github.com/...` — token itu tertinggal di shell history dan di `.git/config` |
| 6 | **Ruang disk dan RAM VPS** | `next.config.ts` belum pakai `output: "standalone"`, jadi server butuh seluruh `node_modules`. Butuh ≥ 3 GB bebas. **Jangan ubah `standalone` malam ini** — perubahan itu belum diuji |
| 7 | Resend (opsional) | Boleh dikosongkan. `lib/email.ts` membuat client hanya kalau `RESEND_API_KEY` ada, dan `sendTicketStatusEmail` langsung return kalau null — jadi tanpa key aplikasi tetap jalan, email saja yang tidak terkirim. Di tier gratis hanya bisa kirim ke alamat terdaftar di akun Resend |

### Yang HARUS diterima sebagai konsekuensi, bukan bug

**Lonceng notifikasi tidak update otomatis di staging.** `NotificationBell` dan
`RequestsBell` mendengarkan Supabase Realtime, yang mendengarkan perubahan di
database **Supabase** — bukan di container Postgres ini. Realtime mati total di
setup ini, apa pun isi kuncinya.

Karena itu `NEXT_PUBLIC_SUPABASE_URL` / `ANON_KEY` diisi **placeholder** — dan
tetap **harus** diisi. `lib/supabase.ts` memanggil `createClient()` di module
scope, jadi nilai kosong melempar error saat import di browser dan **setiap
halaman dashboard ikut mati**, bukan cuma loncengnya. Isi dengan URL yang
bentuknya valid.

Hitungan unread tetap benar setelah halaman di-reload.

### Cek di laptop (sebelum menyentuh VPS)

```powershell
git fetch origin
git rev-parse HEAD origin/feat/rma-warranty-claim   # dua hash HARUS sama
git status --short                                   # HARUS kosong
npx tsc --noEmit                                     # tanpa output
docker start hns-ticketing-pg                        # npm test butuh ini
npm test                                             # 477 lulus
npm run build                                        # Compiled successfully
```

> `npx tsc --noEmit` sudah dijalankan terhadap `98372e9` — bersih.

**🛑 BERHENTI** kalau salah satu gagal. Yang gagal di laptop pasti gagal di VPS,
dan di VPS jauh lebih mahal untuk didiagnosis.

---

# LANGKAH 1 — Periksa VPS bisa dipakai

```bash
node -v                # >= 20.9 (syarat Next.js 16). 22 LTS lebih aman
docker --version
df -h /                # butuh >= 3 GB bebas
free -m                # perhatikan kolom total
echo "NODE_ENV=[$NODE_ENV]"   # HARUS kosong — lihat Langkah 5
```

Angka 3 GB itu terukur, bukan perkiraan: `node_modules` di repo ini **945 MB**
(dengan devDependencies, yang wajib ikut — Langkah 5), ditambah output `.next`,
image Postgres, dan cache npm.

**🛑 BERHENTI kalau RAM < 2 GB dan belum ada swap.** `next build` akan
di-OOM-kill di tengah jalan, dan pesannya hanya `Killed` — tidak menjelaskan apa
pun. Tambahkan swap dulu:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -m                # Swap sekarang terisi
```

---

# LANGKAH 2 — Postgres container

`<ISI>` = password dari pre-flight #2.

```bash
docker run -d --name hns-pg \
  -p 127.0.0.1:5432:5432 \
  -e POSTGRES_PASSWORD='<ISI_PASSWORD_PG>' \
  -e POSTGRES_DB=ticketing \
  -v hns-pg-data:/var/lib/postgresql/data \
  --restart unless-stopped \
  postgres:17
```

Verifikasi — **dua-duanya, jangan hanya yang pertama**:

```bash
docker exec hns-pg pg_isready -U postgres     # "accepting connections"
ss -ltnp | grep 5432                          # HARUS 127.0.0.1:5432
```

**🛑 BERHENTI kalau baris kedua menunjukkan `0.0.0.0:5432` atau `*:5432`.** Itu
berarti Postgres terbuka ke internet. Docker menulis aturan iptables sendiri dan
**menembus UFW** — jadi "firewall saya sudah aktif" tidak menolong. Bagian
`127.0.0.1:` di `-p` adalah satu-satunya yang menahannya.

```bash
docker rm -f hns-pg     # lalu ulangi perintah di atas, dengan prefix 127.0.0.1:
```

Volume `hns-pg-data` tidak ikut terhapus, jadi mengulang aman.

---

# LANGKAH 3 — Ambil kode

```bash
cd /opt                                # atau ~/apps, sesuai kebiasaanmu
git clone https://github.com/HNS-IT-Center/ticketing_service.git
cd ticketing_service
git checkout feat/rma-warranty-claim
git rev-parse --short HEAD             # HARUS 98372e9
```

**🛑 BERHENTI kalau hash bukan `98372e9`.** Ada tiga branch lain di remote
sekarang, dan salah satunya berbahaya kalau ikut ter-deploy:
`fix/points-table-unification` **mengubah angka poin yang terlihat teknisi**
(cleaning 2/4 → 3/5, service `Other_Device` 5 → 3) dan tidak boleh naik tanpa
pengumuman — `docs/points-change-announcement.md`.

---

# LANGKAH 4 — File env

**Satu file: `.env.local`.** Bukan pilihan gaya — itu satu-satunya nama yang
dibaca oleh ketiga-tiganya:

| Pembaca | Cara |
|---|---|
| Next.js (`build` dan `start`) | memuat `.env.local` di semua environment kecuali test |
| Prisma CLI (`db push`) | `prisma.config.ts` baris 1–2: `config({ path: ".env.local" })` |
| `npm run create-user` | `scripts/create-user.ts`: `config({ path: ".env.local" })` |

Taruh env di `.env.production` saja, dan `prisma db push` akan gagal dengan
"DATABASE_URL not found" padahal aplikasinya jalan.

Heredoc di bawah pakai `<<'EOF'` berkutip tunggal — isinya masuk apa adanya, `$`
tidak diekspansi:

```bash
cat > .env.local <<'EOF'
# ── Database: container di VPS ini, plain TCP ───────────────────────────────
DATABASE_URL="postgresql://postgres:<ISI_PASSWORD_PG>@127.0.0.1:5432/ticketing"
DATABASE_SSL=false

# ── Session ────────────────────────────────────────────────────────────────
SESSION_SECRET="<ISI: openssl rand -base64 48>"

# ── URL publik. Ditanam saat build — ubah = wajib build ulang ───────────────
NEXT_PUBLIC_APP_URL="<ISI: https://staging.domainmu.com  ATAU  http://IP:3000>"

# ── Storage: R2 asli. WAJIB. Jangan set STORAGE_DRIVER ─────────────────────
R2_ENDPOINT=""
R2_ACCOUNT_ID="<ISI>"
R2_ACCESS_KEY_ID="<ISI>"
R2_SECRET_ACCESS_KEY="<ISI>"
R2_BUCKET_NAME="<ISI: bucket staging, bukan produksi>"
NEXT_PUBLIC_R2_PUBLIC_URL="<ISI: https://...>"

# ── Supabase: placeholder. Realtime mati di staging, ini disengaja ──────────
# Kosong = createClient() melempar error saat import = semua dashboard mati.
NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder-anon-key"
SUPABASE_SERVICE_ROLE_KEY="placeholder-service-role-key"

# ── Email: opsional, boleh dibiarkan kosong ────────────────────────────────
# RESEND_API_KEY=""
# NEXT_PUBLIC_FROM_EMAIL=""
EOF

chmod 600 .env.local
```

Periksa `DATABASE_URL` tidak rusak oleh karakter password:

```bash
grep DATABASE_URL .env.local
```

**🛑 BERHENTI kalau password memuat `@ : / ? # %`.** URL-nya akan terpotong di
tempat yang salah. Ganti passwordnya ke hex, di container **dan** di file ini:

```bash
docker exec -it hns-pg psql -U postgres -c "ALTER USER postgres PASSWORD '<HEX_BARU>';"
```

---

# LANGKAH 5 — Dependency dan schema

```bash
echo "NODE_ENV=[$NODE_ENV]"   # HARUS kosong SEBELUM npm ci
npm ci                        # bukan npm install, dan bukan --omit=dev
npx prisma db push
```

### ⛔ Jangan `export NODE_ENV=production` dan jangan `npm ci --omit=dev`

`npm ci` **melewati devDependencies kalau `NODE_ENV=production`**, dan tiga hal
yang dibutuhkan malam ini ada di sana:

| Paket | Yang mati tanpanya |
|---|---|
| `typescript`, `@tailwindcss/postcss`, `tailwindcss` | `npm run build` (Langkah 6) |
| `tsx` | `npm run create-user` (Langkah 7) — scriptnya `tsx scripts/create-user.ts` |

`npm run start` memang butuh `NODE_ENV=production`, tapi **`next start`
menyetelnya sendiri**. Tidak perlu, dan tidak boleh, kamu export duluan.

Kalau ternyata sudah ke-export: `unset NODE_ENV`, lalu `npm ci` ulang.

`npm ci` harus berakhir tanpa error, dan `npx prisma db push` dengan
`Your database is now in sync with your Prisma schema.`

**🛑 BERHENTI kalau gagal — dan jangan coba flag lain.** `migrate dev`,
`migrate reset`, dan `db seed` semuanya menyentuh seed script. Baca pesan
errornya:

| Pesan | Artinya |
|---|---|
| `Can't reach database server at 127.0.0.1:5432` | Container mati atau port tidak ter-bind. `docker ps`, lalu Langkah 2 |
| `password authentication failed` | Password di `.env.local` tidak sama dengan yang di container, atau rusak karena karakter URL |
| `DATABASE_URL not found` | File bukan bernama `.env.local`, atau kamu tidak berada di root repo |

Verifikasi schema sudah lengkap — perintah ini **hanya membaca**:

```bash
docker exec hns-pg psql -U postgres -d ticketing -c \
  'SELECT unnest(enum_range(NULL::"RmaStatus"))::text;'          # 10 nilai, memuat ineligible

docker exec hns-pg psql -U postgres -d ticketing -c \
  'SELECT unnest(enum_range(NULL::"TicketStatus"))::text;'       # memuat rma_process

docker exec hns-pg psql -U postgres -d ticketing -c \
  'SELECT count(*) FROM "RmaCase";'                              # 0
```

**🛑 BERHENTI kalau `RmaStatus` tidak ada, atau nilainya kurang dari 10.**
`db push` tidak selesai. Kalau dibiarkan, `/rma/dashboard` akan 500 dan smoke
test #2 hanya jadi bukti tertundanya, bukan penemuannya.

---

# LANGKAH 6 — Build

```bash
npm run build
```

Harus `✓ Compiled successfully`.

**🛑 BERHENTI**, dan artinya:

| Gejala | Sebab |
|---|---|
| hanya `Killed`, tanpa error | OOM. Balik ke Langkah 1, tambahkan swap |
| `supabaseUrl is required` | `NEXT_PUBLIC_SUPABASE_URL` kosong. Isi placeholder, build ulang |
| `R2_ENDPOINT must use https in production` | `R2_ENDPOINT` diisi `http://`. Kosongkan untuk Cloudflare R2 |
| error TypeScript apa pun | Seharusnya mustahil pada `98372e9` — `tsc` bersih. Berarti `git checkout` mengambil commit lain. Cek `git rev-parse --short HEAD` |

Setelah build sukses, semua nilai `NEXT_PUBLIC_*` **sudah terkunci di dalam
`.next/`**. Mengubahnya nanti tanpa build ulang tidak berpengaruh — dan ini
menyesatkan, karena tidak memunculkan error apa pun.

---

# LANGKAH 7 — Akun pertama

Tiga kali, satu per role. Interaktif:

```bash
npm run create-user        # role: Administrator
npm run create-user        # role: Technician
npm run create-user        # role: RMA
```

Skrip ini menolak menimpa email yang sudah ada dan tidak pernah mencetak
password. Yang akan diminta, supaya tidak kaget di tengah prompt:

- **Role** — ketik persis: `Administrator`, `Technician`, `RMA`
- **Nomor WhatsApp** — wajib `+62XXXXXXXXX`, 8–13 digit setelah `+62`
- **Password** — minimal **12 karakter**, harus ada huruf kecil, huruf besar, dan
  angka. `admin123` / `tech123` / `rma123` **ditolak**: skrip memuat daftar
  password yang pernah dipublikasikan di repo ini
- Konfirmasi terakhir — ketik `ya`; apa pun selain itu membatalkan

Catat email dan password di password manager **sekarang**. Tidak ada cara
membacanya lagi.

---

# LANGKAH 8 — Jalankan lewat PM2

```bash
sudo npm i -g pm2
pm2 start npm --name hns-ticketing -- start
pm2 logs hns-ticketing --lines 50        # tunggu "Ready in ..."
```

Setelah log bersih:

```bash
pm2 save
pm2 startup                              # jalankan perintah yang ia cetak
curl -I http://127.0.0.1:3000/login      # 200
```

**🛑 BERHENTI kalau `pm2 logs` menunjukkan restart berulang.** Biasanya env
runtime: `SESSION_SECRET` atau `DATABASE_URL`. `pm2 delete hns-ticketing`,
perbaiki `.env.local`, mulai lagi. (`SESSION_SECRET` dibaca saat runtime, jadi
untuk yang ini **tidak** perlu build ulang — beda dari `NEXT_PUBLIC_*`.)

---

# LANGKAH 9 — Nginx (kalau `NEXT_PUBLIC_APP_URL` pakai domain)

Lewati kalau staging diakses via `http://IP:3000` — tapi kalau begitu, buka port
3000 di firewall dan terima bahwa traffic-nya tanpa TLS.

```nginx
server {
    listen 80;
    server_name <ISI: staging.domainmu.com>;

    # WAJIB. next.config.ts menyetel bodySizeLimit server action 20mb,
    # sedangkan default Nginx 1mb — foto handover akan kena 413, dan
    # gejalanya muncul di browser, bukan di log aplikasi.
    client_max_body_size 25m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade            $http_upgrade;
        proxy_set_header Connection         'upgrade';
        proxy_set_header Host               $host;

        # Aplikasi menyusun URL share dan link email dari header ini
        # (app/[date]/[ticketCode]/page.tsx, app/actions/tickets.ts).
        # Tanpa X-Forwarded-Proto, link publik keluar sebagai http://
        proxy_set_header X-Forwarded-Proto  $scheme;
        proxy_set_header X-Real-IP          $remote_addr;
        proxy_cache_bypass                  $http_upgrade;
    }
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d <ISI: staging.domainmu.com>
```

---

# LANGKAH 10 — Smoke test, berurutan

Kalau satu gagal, berhenti dan lihat `pm2 logs hns-ticketing`.

| # | Uji | Lolos kalau |
|---|---|---|
| 1 | Login Administrator | Dashboard terbuka, **tidak ada redirect loop** |
| 2 | Login RMA → `/rma/dashboard` | Terbuka. **Ini yang paling cepat mengungkap schema kurang** — halaman itu membaca `RmaCase`, `RmaEvent`, dan semua enum baru |
| 3 | Buat tiket Service biasa | Berhasil, kode tiket berurutan |
| 4 | Buat tiket Warranty Claim | SN dan tanggal beli wajib, tombol **Create Ticket aktif** (pernah tiga kali mati persis di titik ini) |
| 5 | Ambil tiket klaim itu sebagai teknisi | "Serahkan ke RMA" muncul, **"Mark Done" tidak** |
| 6 | Handover: unggah 1 foto + pilih rekomendasi | Berhasil. **Ini yang menguji R2 sekaligus** |
| 7 | Login RMA | Case muncul, foto bisa dibuka di modal |
| 8 | Buka halaman publik tiket | Status dan banner benar, **tidak ada data internal** (`vendor_rma_number`, `hold_reason`, `decision_notes`, `stock_origin`, `RmaEvent.note`) |
| 9 | Reboot VPS, tunggu, buka lagi | Aplikasi hidup sendiri (PM2) dan database masih berisi (volume) |

Satu uji dari runbook induk **tidak bisa dijalankan di sini**: "buka satu tiket
lama dan pastikan tidak error walau tidak punya `rma_case`". Staging ini kosong,
jadi uji itu baru bermakna saat deploy ke database yang sudah berisi.

**🛑 Kalau #6 gagal dengan error upload:** itu R2, dan jangan "diperbaiki" dengan
`STORAGE_DRIVER=local`. `lib/r2.ts` menolaknya saat `NODE_ENV=production`, dan
kalaupun lolos ia akan menulis ke filesystem VPS — filenya hilang di deploy
berikutnya. Periksa kredensial dan nama bucket.

**🛑 Kalau #6 gagal dengan 413:** itu Nginx, Langkah 9, `client_max_body_size`.

---

# Kalau harus mundur

Staging, database buang, jadi tidak ada backup yang perlu direstore:

```bash
pm2 delete hns-ticketing
docker rm -f hns-pg
docker volume rm hns-pg-data      # menghapus SEMUA data staging
```

Lalu ulangi dari Langkah 2. Ini yang membuat staging murah — jangan pindahkan
kebiasaan ini ke produksi, di mana Langkah 0 runbook induk (backup) wajib.

---

# Yang TIDAK ditangani runbook ini

| | |
|---|---|
| **RLS** | Belum aktif di tabel mana pun, termasuk `RmaCase` dan `RmaEvent`. BL12. Di staging risikonya kecil — Postgres hanya listen di `127.0.0.1` dan anon key-nya placeholder |
| **Migration history** | Sengaja tidak dibuat. Staging ini di-`db push`, jadi tidak punya baseline. Untuk produksi, Bagian A `docs/rma-deploy.md` tetap wajib |
| **`output: "standalone"`** | Belum diset, dan jangan diubah malam ini. Uji di lokal dulu |
| **Merge ke `main`** | Runbook ini men-deploy branch fitur |
| **Data demo** | `NGW-000004…NGW-000009` hanya ada di database lokal. Jangan dibawa |
