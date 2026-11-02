# Migrasi ke VPS (Dokploy) — posisi terakhir dan sisa langkah

Ditunda 2026-10-26 untuk mendahulukan task fitur. Panduan lengkapnya: dokumen pemilik
"Migrasi Ticketing Service dari hPanel ke VPS dengan Dokploy" (Tahap 1–8). File ini mencatat
**di mana kita berhenti**, supaya sesi berikutnya tidak mulai dari nol.

## Model yang disepakati

- **hPanel tetap production** sampai cutover. Branch `main` = yang dijalankan hPanel.
- **VPS = staging dulu** di `staging-ticketing.hnsitcenter.id`, dari branch **`deploy`**.
- Domain utama baru dipindah setelah staging lolos uji.

## Sudah selesai

| Item | Keterangan |
|---|---|
| Dockerfile, `.dockerignore`, `GET /api/health` | commit `15c9b38`. Build di VPS **berhasil**, container `(healthy)` |
| Branch `deploy` di GitHub | = `15c9b38` (kode `main` + 4 file Docker) |
| GitHub App Dokploy | punya akses ke semua repo HNS-IT-Center |
| Database `ticketing-db` | Dokploy, user `ticketing`, db `ticketing`, Internal Host `ticketing-teknisi-ticketingdb-dvy2im`, tanpa port publik |
| Data | salinan production 2026-10-24: 672 tiket / 18 user / 3084 status log / 41 RMA, 7 migration (= branch `deploy`) |
| Aplikasi | service `ticketing-teknisi-ticketing-teknisi-bsqonr`, `1/1 (healthy)`, `DATABASE_URL` sudah diisi |

## Sisa langkah, berurutan

1. **DNS** (hPanel → Domains → `hnsitcenter.id` → DNS): A record `staging-ticketing` → `201.18.219.113`, TTL 300.
2. **Dokploy → aplikasi → Domains**: `staging-ticketing.hnsitcenter.id`, port `3000`, HTTPS, Let's Encrypt.
   `NEXT_PUBLIC_APP_URL=https://staging-ticketing.hnsitcenter.id` di Environment **dan** Build-time Arguments → Deploy.
3. **Cek**: `https://staging-ticketing.hnsitcenter.id/api/health?db=1` → `{"status":"ok","db":"ok"}`.
4. **Bucket R2 khusus staging** — wajib sebelum menguji upload atau hapus (lihat "Jangan dilanggar").
   Bucket `hns-ticketing-staging`, public r2.dev aktif, token Object Read & Write khusus bucket itu.
   Env: `R2_BUCKET_NAME`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `NEXT_PUBLIC_R2_PUBLIC_URL`
   (juga di Build-time Arguments), dan `SESSION_SECRET` baru → Deploy.
5. **Uji staging**: login password asli, daftar + cari tiket, foto lama tampil, upload foto, buat tiket +
   ubah status, jam WIB, leaderboard, dashboard RMA.
6. **Fitur baru ke staging**: merge `feat/rma-hold-reason` → `deploy` sudah disiapkan **lokal** (`fd300de`,
   belum di-push). Sebelum push: (a) pastikan hPanel **tidak** memantau branch `deploy`; (b) jalankan 10
   migration ke database VPS — External Port sementara + tunnel + `npx prisma migrate deploy`, lalu port
   ditutup lagi.
7. **Cutover** (Tahap 6 panduan): matikan app hPanel, dump + import ulang (`RESET` dulu), kembalikan bucket R2
   dan `SESSION_SECRET` production, isi `RESEND_API_KEY`, ganti password database, domain utama → VPS,
   matikan auto-deploy hPanel.

## Jangan dilanggar

- **Database Dokploy: User jangan `root`.** Image MariaDB membuat `root` dua kali → `ERROR 1396`, container
  mati saat setup.
- **Port `33306` di VPS milik database data-accurate**, bukan ticketing. Import selalu lewat `docker exec`.
- **Staging jangan memakai bucket R2 production.** Menghapus tiket atau part di aplikasi ikut menghapus
  fotonya dari R2, dan staging berisi salinan data production — hapus di staging = foto asli hilang.
- **Server dipakai bersama** (`auth-hns`, `sentral-hns`, `data-accurate`): jangan restart, ubah, atau hapus
  service mereka.
- **Docker Desktop di laptop tidak kuat build image ini** (mati di `npm ci`). Build hanya di Dokploy.
- **Password database `ticketing` sudah sempat tertulis di chat** — ganti sebelum cutover. Di MariaDB,
  mengubah kolom di Dokploy saja tidak cukup; ganti juga dengan `ALTER USER` lewat `docker exec`.

## Perintah yang sudah terbukti jalan

```bash
# di VPS: cari container database ticketing (pastikan namanya mengandung "ticketingdb")
C=$(docker ps --format '{{.Names}}' | grep ticketingdb); echo "$C"

# import / query tanpa password di history
read -s -p "Password user ticketing: " MYSQL_PWD; echo; export MYSQL_PWD
docker exec -i -e MYSQL_PWD "$C" mariadb -u ticketing ticketing < ~/ticketing_dump.sql
docker exec -e MYSQL_PWD "$C" mariadb -u ticketing ticketing -e "SELECT COUNT(*) FROM Ticket"
unset MYSQL_PWD

# dump dari Hostinger (di dalam ssh -p 65002 u859138789@72.61.212.174)
mysqldump -h 127.0.0.1 -u u859138789_developerhns4 -p --single-transaction --no-tablespaces \
  --default-character-set=utf8mb4 u859138789_ticketing > ticketing_dump.sql
```
