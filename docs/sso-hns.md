# HNS SSO — integrasi dan go-live

Aplikasi ini adalah **confidential client** HNS SSO (`https://auth.hnsitcenter.id`,
OpenID Connect, PKCE S256, `client_secret_basic`). Spesifikasi lengkap ada di
`HNS-SSO-CLIENT.md`.

## Prinsip

- **Selama `SSO_*` belum diisi, tidak ada yang berubah**: login password berjalan seperti
  biasa dan tombol SSO tidak tampil. Kode ini aman di-deploy sebelum aplikasi didaftarkan.
- Identitas (password, 2FA) dan **siapa yang boleh masuk** (whitelist) diatur di SSO.
  **Role** tetap diatur di aplikasi ini.
- Akun lokal tidak pernah dihapus atau digabung otomatis. Jembatannya hanya `User.sso_sub`.

## Rute

| Rute | Fungsi |
| --- | --- |
| `GET /auth/sso/login` | Mulai login (juga *Initiate Login URL* untuk Portal SSO). `?return_to=` hanya path relatif |
| `GET /auth/sso/callback` | Cek state + iss, tukar code (PKCE), verifikasi id_token, tautkan akun, buat sesi |
| `POST /auth/sso/backchannel-logout` | Verifikasi `logout_token`, cabut semua sesi dengan `sid` itu. Di luar guard proxy; kredensialnya tanda tangan JWT |
| `GET /auth/sso/error` | Pesan ramah per kode error (`access_denied`, dll.) |
| `GET /auth/session-ended` | Hapus cookie sesi yang sudah tidak berlaku, lalu ke `/login?ended=1` |
| Logout | `logoutAction` (server action): hapus sesi lokal, cabut `SsoSession`, lalu end session SSO dengan `id_token_hint` |

## Sesi

Cookie `session` tetap JWT bertanda tangan, sekarang berisi id `SsoSession` untuk login SSO.
Token SSO disimpan di tabel `SsoSession` (server), tidak pernah di browser. Setiap request
(`lib/session.ts`) memeriksa: akun aktif, role sama dengan saat cookie dibuat, `SsoSession`
belum dicabut, dan untuk sesi password, `LOCAL_LOGIN` masih mengizinkan. Access token
di-refresh saat sisa < 60 detik, satu request saja (lock), refresh token baru selalu disimpan,
`invalid_grant` = sesi berakhir.

## Akun

1. Login SSO pertama: cari `sso_sub` → kalau tidak ada, cari email yang belum tertaut → kalau
   tidak ada, buat akun baru dengan role **`Pending`** (tanpa akses, diarahkan ke
   `/unauthorized` dengan pesan "menunggu penetapan role").
2. Admin menetapkan role di **Users** (filter "Menunggu role"). User login ulang.
3. Admin bisa menyiapkan role lebih dulu: buat user dengan email + role, **password dikosongkan**.

Akun customer tidak pernah ditautkan ke SSO. Akun yang dinonaktifkan di aplikasi tetap ditolak.

## Go-live (urutan aman)

1. **Migration ke production dulu** (`prisma migrate deploy` lewat tunnel):
   `20261019020000_sso_client` — kolom `User.sso_sub`, role `Pending`, tabel `SsoSession`.
   ⛔ Push kode sebelum migration = halaman yang membaca user error 500.
2. Daftarkan aplikasi di **SSO → API Management**, isi `SSO_*` di environment hPanel.
   Login password tetap jalan (`LOCAL_LOGIN=all`).
3. `npm run sso:export-users -- --exclude-domain <domain-akun-contoh>` → CSV di luar repo.
   Impor di **SSO → Pengguna → Impor CSV**, centang aplikasi ini. **Hapus file CSV-nya.**
4. **SSO → API Management → aplikasi ini → Ekspor CSV (sub ↔ email)**, lalu
   `npm run sso:link-users -- <file>` (dry run) → periksa → ulangi dengan `--apply`.
5. Uji login SSO beberapa staf.
6. Go-live: `LOCAL_LOGIN=break-glass` + `BREAK_GLASS_EMAILS=<1–2 email admin darurat>`.
   Opsional: `npm run sso:link-users -- <file> --apply --clear-staff-passwords`.

## Development

Back-channel dari SSO production tidak bisa menjangkau `localhost`. Daftarkan client
terpisah "HNS Ticketing Service (Dev)" dengan redirect `http://localhost:3000/auth/sso/callback`
dan Back-channel Logout URI dikosongkan.
