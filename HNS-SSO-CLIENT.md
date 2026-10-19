---
name: hns-sso-client
description: Instruksi lengkap untuk menghubungkan aplikasi client ke HNS SSO (OpenID Connect / OAuth 2.1, HNS IT Center). Gunakan saat user meminta memasang, menyinkronkan, atau memperbaiki login SSO HNS di project ini.
---

# Integrasi Aplikasi Client ke HNS SSO

File ini adalah instruksi untuk **Claude**. User menaruh file ini di project aplikasi client lalu meminta, misalnya, "pasang SSO HNS". Tugasmu:

1. **Mengimplementasikan** login SSO di project ini secara lengkap: login, callback, sesi lokal, refresh, logout, dan back-channel logout.
2. **Melaporkan di chat** (dalam Bahasa Indonesia) nilai-nilai yang harus user isi di form **API Management** SSO, serta isi `.env` yang harus dilengkapi setelah aplikasi didaftarkan.

Semua fakta tentang SSO di bawah ini berasal dari implementasi server SSO HNS. Ikuti apa adanya dan jangan menebak perilaku lain.

---

## 1. Fakta server SSO

**Issuer (URL SSO):** `https://auth.hnsitcenter.id`

> Jika teks di atas masih berupa `https://auth.hnsitcenter.id`, tanyakan URL SSO ke user. Bila user tidak tahu, sarankan mengunduh ulang file ini dari menu **Panduan Integrasi** di SSO, karena versi unduhan sudah terisi otomatis. Bila jaringan memungkinkan, verifikasi dengan `GET <issuer>/.well-known/openid-configuration`: field `issuer` harus sama persis.

| Endpoint | URL | Catatan |
| --- | --- | --- |
| Discovery | `https://auth.hnsitcenter.id/.well-known/openid-configuration` | Di-cache 5 menit |
| JWKS | `https://auth.hnsitcenter.id/.well-known/jwks.json` | RS256, punya `kid`. Kunci bisa dirotasi; kunci lama tetap tersedia 7 hari |
| Authorization | `https://auth.hnsitcenter.id/oauth/authorize` | GET, browser user |
| Token | `https://auth.hnsitcenter.id/oauth/token` | POST `application/x-www-form-urlencoded` saja |
| UserInfo | `https://auth.hnsitcenter.id/oauth/userinfo` | GET/POST, `Authorization: Bearer` |
| Introspection | `https://auth.hnsitcenter.id/oauth/introspect` | Hanya confidential client, hanya untuk token milik client itu sendiri |
| Revocation | `https://auth.hnsitcenter.id/oauth/revoke` | Selalu 200 |
| End session | `https://auth.hnsitcenter.id/oauth/logout` | GET atau POST |
| Access check (non-standar) | `https://auth.hnsitcenter.id/api/clients/access-check` | POST, hanya confidential client. Untuk login satu-halaman staf + pelanggan (§3.6) |

### Aturan protokol

- **Grant:** hanya `authorization_code` dan `refresh_token`. `response_type` harus `code`. Tidak ada implicit, password grant, maupun client_credentials.
- **PKCE wajib untuk semua client**, dengan `code_challenge_method=S256`. `plain` ditolak.
  - `code_challenge` harus cocok dengan pola `[A-Za-z0-9_-]{43,128}`.
  - `code_verifier` harus cocok dengan pola `[A-Za-z0-9-._~]{43,128}`.
- **Scope:** wajib `openid`; yang lain hanya `profile` dan `email`. Scope lain menghasilkan `invalid_scope`. **Tidak ada klaim role/group.** Hak akses diatur di aplikasi client sendiri.
- **Parameter authorize:**
  - Wajib: `client_id`, `redirect_uri`, `response_type=code`, `scope`, `code_challenge`, `code_challenge_method`.
  - Disarankan: `state` (maks 1024 karakter) dan `nonce` (maks 255 karakter).
  - Opsional: `prompt=none|login`, `max_age`, `login_hint`.
  - `request` dan `request_uri` ditolak.
- **Redirect URI:**
  - Dicocokkan **persis** (exact string match, tanpa wildcard). Trailing slash, port, dan http/https berpengaruh.
  - Harus `https://`; `http://` hanya diizinkan untuk `localhost`, `127.0.0.1`, atau `[::1]`.
  - Tidak boleh ada fragment `#` atau user:pass. Maksimal 20 URI per client.
- **Callback:** selalu membawa `code` (atau `error` + `error_description`), `state` (bila dikirim), dan `iss` (RFC 9207). Wajib cek `state` dan `iss`.
- **Error sebelum redirect:** jika `client_id` atau `redirect_uri` tidak valid, SSO menampilkan halaman error sendiri dan **tidak** me-redirect balik.
- **Authorization code:** berlaku 60 detik dan sekali pakai. Jika dipakai dua kali, semua token yang terbit dari code itu ikut dicabut.
- **Autentikasi client di token endpoint:**
  - `client_secret_basic` (disarankan) atau `client_secret_post`.
  - Public client memakai `none`, yaitu cukup kirim `client_id`, dan **dilarang** mengirim `client_secret`.
  - Secret yang salah menghasilkan 401 `invalid_client`. Ada rate limit 60 request/menit per client.
- **Respons token:** `access_token`, `token_type=Bearer`, `expires_in`, `scope`, `id_token` (bila scope berisi `openid`), `refresh_token`, `refresh_token_expires_in`.
- **Refresh token:**
  - Opaque, **dirotasi setiap dipakai**. Selalu simpan `refresh_token` baru (dan `id_token` baru).
  - **Memakai refresh token lama lagi berarti seluruh rantai token dicabut** dan user harus login ulang. Jadi refresh harus dilakukan satu proses saja per sesi (gunakan lock).
  - Umurnya tidak pernah melebihi sesi SSO. `invalid_grant` berarti sesi SSO sudah berakhir: hapus sesi lokal lalu arahkan ke login.
  - Setiap refresh yang sukses memperpanjang idle timeout sesi SSO.
  - Parameter `scope` saat refresh hanya boleh mempersempit scope awal.
- **Sesi SSO:** default absolut 12 jam dan idle 2 jam. Sesi berakhir saat:
  - user logout dari SSO atau dari aplikasi mana pun;
  - admin mencabut sesi, menonaktifkan user, atau mereset password;
  - user mengganti password;
  - user login ulang di browser yang sama (sesi lama diganti dan `sid` berubah).
- **CORS:** endpoint token, userinfo, dan revoke hanya mengizinkan origin dari redirect URI milik **public** client. Confidential client harus memanggil dari server.
- **Revocation:** mencabut refresh token berarti seluruh rantainya ikut dicabut. Mencabut access token hanya berpengaruh pada userinfo dan introspection; validasi JWT lokal tetap menganggap token itu valid sampai `exp`.
- **Whitelist akses (dikelola di SSO):** setiap aplikasi punya kebijakan "hanya pengguna yang diberi akses" (default) atau "semua pengguna aktif".
  - User yang tidak di-whitelist **tidak pernah sampai ke callback**: SSO menampilkan halaman "Akses ditolak". Untuk `prompt=none`, SSO me-redirect `error=access_denied`.
  - Bila akses dicabut, refresh token aplikasi itu ditolak (`invalid_grant`), userinfo dan introspection mengembalikan tidak aktif, dan SSO mengirim back-channel logout ke aplikasi tersebut.
  - Konsekuensinya: **setiap user yang berhasil melewati callback sudah disetujui SSO** untuk aplikasi ini. Aplikasi tidak perlu whitelist sendiri; cukup mengatur **role/hak akses di dalam aplikasi**.
- **Akun hanya dibuat di SSO.** Tidak ada API bagi aplikasi client untuk membuat atau mengubah akun SSO. Akun dibuat admin SSO (manual atau impor CSV).

### Isi token

**id_token** (header `alg: RS256`, `typ: JWT`, `kid`):

| Klaim | Isi |
| --- | --- |
| `iss` | Issuer (sama persis) |
| `sub` | UUID user, **stabil**. Pakai sebagai kunci relasi user |
| `aud`, `azp` | Client ID |
| `exp`, `iat`, `jti` | `exp` = min(TTL access token, 3600 detik) |
| `auth_time` | Waktu user login di SSO |
| `nonce` | Sama dengan nonce request |
| `sid` | ID sesi SSO. Berubah setiap user login ulang. Simpan untuk back-channel logout |
| `amr` | Array metode login: `pwd`, `otp`, `mfa`, `hwk` + `user` (passkey), `fed` (Google) |
| `at_hash` | Hash access token |
| `name`, `preferred_username`, `updated_at` | Bila scope `profile` |
| `email`, `email_verified` (selalu `true`) | Bila scope `email` |

**access_token**: JWT dengan header `typ: at+jwt`. Klaimnya `iss`, `sub`, `aud` = client_id, `exp`, `iat`, `jti`, `scope`, `client_id`, `sid`, `auth_time`, `amr`. TTL diatur per client (default 600 detik).

**logout_token** (back-channel): JWT dengan header `typ: logout+jwt`, RS256.
- Klaim: `iss`, `aud` = client_id, `iat`, `exp` (+120 detik), `jti`, `sub`, `sid`, `events: {"http://schemas.openid.net/event/backchannel-logout": {}}`. Tidak ada `nonce`.
- Dikirim sebagai `POST application/x-www-form-urlencoded` dengan body `logout_token=<jwt>`.
- Timeout 5 detik, **tanpa retry**.

**Toleransi jam:** maksimal 30 detik. Verifikasi tanda tangan selalu lewat JWKS (jangan hardcode kunci) dan kunci algoritma ke `RS256`. Bila menemukan `kid` yang tidak dikenal, ambil ulang JWKS.

### Logout (RP-initiated)

`https://auth.hnsitcenter.id/oauth/logout?id_token_hint=<id_token>&post_logout_redirect_uri=<terdaftar>&state=<opsional>`

- `id_token_hint` yang sudah kedaluwarsa tetap diterima.
- `post_logout_redirect_uri` harus terdaftar untuk client tersebut. Client dikenali dari `id_token_hint` atau `client_id`.
- Jika `sid` di hint sama dengan sesi SSO yang aktif, logout terjadi langsung lalu SSO me-redirect ke `post_logout_redirect_uri?state=...`. Jika tidak, user diminta konfirmasi di halaman SSO.

---

## 2. Alur kerja kamu

### Langkah 0: Pelajari project (tanpa bertanya)

Identifikasi hal-hal berikut:
- bahasa dan framework beserta versinya, cara routing, dan apakah ada backend;
- mekanisme login dan sesi yang ada (session store server-side atau cookie saja);
- model/tabel user dan cara migrasi database;
- middleware CSRF, dan port serta base URL saat development;
- konvensi environment variable dan struktur folder;
- apakah ada `CLAUDE.md` atau `AGENTS.md` (ikuti aturannya). Untuk Next.js, baca juga `node_modules/next/dist/docs/` bila ada.

Pakai library dan pola yang sudah ada di project. Jangan menambah framework baru tanpa alasan.

### Langkah 1: Tanyakan hanya yang tidak bisa disimpulkan

Kumpulkan dalam **satu** pesan, dan berikan default supaya user cukup menjawab "ya":

1. URL SSO, bila placeholder issuer di atas belum terisi.
2. URL production aplikasi ini, misalnya `https://inventaris.hns.co.id`. Default: pakai placeholder dan tandai di laporan.
3. Login lokal (username/password milik aplikasi): default **dinonaktifkan untuk staf**, SSO menjadi satu-satunya login. Tawarkan opsi mempertahankan login lokal hanya untuk akun darurat (break-glass admin).
4. Pencocokan user lama: default **penautan massal** memakai CSV ekspor dari SSO (lihat §3), ditambah penautan berdasarkan **email** saat login SSO pertama untuk yang terlewat. Setelah tertaut, login hanya memakai `sub`.
5. User SSO yang belum punya akun lokal: default **dibuat otomatis (auto-provision) dengan role default/paling rendah**, karena SSO sudah memastikan user ada di whitelist aplikasi ini. Bila aplikasi butuh persetujuan role, buat akun berstatus "menunggu role" dan tampilkan pesan ke user.
6. Bila aplikasi juga punya **pengguna publik** (pelanggan e-commerce, member, pendaftar): default tetap **satu halaman login identifier-first** (§3.6). Email yang punya akses SSO masuk sebagai staf lewat SSO; selain itu login sebagai pelanggan dengan akun lokal.

### Langkah 2: Tentukan jenis client

- **Confidential**: aplikasi punya backend (Laravel, Next.js, Express, Django, Go, Spring, .NET, dll.). Ini hampir selalu pilihan yang benar.
- **Public**: hanya untuk SPA/mobile murni tanpa backend. Tanpa secret, simpan token di memori. Jika memungkinkan, sarankan pola Backend-for-Frontend.

### Langkah 3: Implementasi

Wajib dibuat (sesuaikan path dengan konvensi project):

| Komponen | Contoh path | Isi |
| --- | --- | --- |
| Konfigurasi | `.env`, `.env.example`, config | `SSO_ISSUER`, `SSO_CLIENT_ID`, `SSO_CLIENT_SECRET`, `SSO_REDIRECT_URI`, `SSO_POST_LOGOUT_REDIRECT_URI`. Secret hanya di env server |
| Mulai login | `GET /auth/sso/login` | Buat `state`, `nonce`, dan `code_verifier` acak, simpan sementara (sesi server atau cookie HttpOnly+Secure+SameSite=Lax, maks 10 menit), lalu redirect ke authorize. Simpan juga tujuan setelah login (`return_to`, hanya path relatif). URL ini sekaligus menjadi **Initiate Login URL** untuk Portal SSO |
| Callback | `GET /auth/sso/callback` | Tangani `error`. Cocokkan `state` (timing-safe) dan `iss`. Tukar code dengan PKCE verifier. Verifikasi id_token (tanda tangan JWKS, `iss`, `aud`, `azp`, `exp`, `nonce`). Hapus data flow sementara |
| Relasi user | migrasi | Kolom `sso_sub` (unique, nullable). Cocokkan berdasarkan `sub`; pencocokan email hanya untuk penautan pertama. Perbarui nama/email dari klaim |
| Sesi lokal | memakai mekanisme yang ada | **Regenerasi session ID**. Simpan `user_id`, `sso_sid`, `id_token`, `refresh_token`, `access_token`, `expires_at` **di server** (atau cookie terenkripsi). Jangan pernah di localStorage |
| Refresh | middleware/helper | Bila access token tinggal < 60 detik dan aplikasi membutuhkannya, lakukan refresh dengan lock dan simpan token baru. Jika `invalid_grant`, hapus sesi lokal dan arahkan ke login. Disarankan dicek di setiap request terautentikasi agar sesi aplikasi ikut mati saat sesi SSO berakhir |
| Logout | `POST /auth/sso/logout` (dengan CSRF aplikasi) | Hapus sesi lokal dulu, lalu redirect ke end session dengan `id_token_hint` dan `post_logout_redirect_uri` |
| Back-channel logout | `POST /auth/sso/backchannel-logout` | Verifikasi `logout_token` (JWKS, `iss`, `aud`, `typ: logout+jwt`, umur ≤ 2 menit, ada `events` back-channel, tidak ada `nonce`). Hapus **semua** sesi lokal dengan `sso_sid` yang sama, lalu balas 200 (400 jika tidak valid). **Kecualikan dari middleware CSRF dan auth**, karena keamanannya dijamin tanda tangan JWT |
| UI | halaman login / layout | Aplikasi khusus staf: tombol "Masuk dengan SSO HNS". Aplikasi dengan pengguna publik: satu form identifier-first (§3.6), tanpa tombol terpisah. Tombol logout memanggil route logout. Matikan atau sembunyikan registrasi dan lupa-password lokal **untuk staf**; milik pelanggan tetap ada |
| Halaman error callback | | Tampilkan pesan ramah untuk `error=access_denied` ("Anda belum diberi akses, minta ke admin HNS IT Center") dan error lain. Sediakan tombol coba lagi dan logout SSO |
| Ekspor user lokal | perintah/skrip CLI (mis. `php artisan sso:export-users`, `npm run sso:export-users`) | Membuat CSV untuk diimpor ke SSO, dengan format di §3.1 |
| Penautan massal | perintah/skrip CLI (mis. `sso:link-users <file.csv>`) | Membaca CSV ekspor dari SSO, mengisi `sso_sub`, dengan mode `--dry-run`. Lihat §3.2 |
| Manajemen user di aplikasi | halaman admin aplikasi | Hapus field password dan "buat password" untuk staf. Admin aplikasi hanya mengatur **role**. Tambah user = minta admin SSO membuat akun dan memberi akses, lalu (opsional) siapkan role lebih dulu berdasarkan email |

**Back-channel butuh sesi yang bisa dicari berdasarkan `sso_sid`.**
- Jika sesi project tersimpan di server (DB, Redis, file), simpan pemetaan `sso_sid → session_id` lalu hapus sesinya.
- Jika sesi hanya berupa cookie (stateless), buat tabel `sso_sessions` (`sid`, `user_id`, `revoked_at`) dan cek di setiap request apakah `sid` di cookie sudah dicabut.

Opsional:
- API yang menerima Bearer token: validasi JWT lokal (`typ: at+jwt`, `aud` = client ID sendiri, `iss`, `exp`), lalu introspection untuk aksi sensitif.
- `prompt=login` untuk aksi sangat sensitif.

### Langkah 4: Verifikasi

- Jalankan build, lint, typecheck, dan test project.
- Uji minimal bahwa:
  - route login mengembalikan redirect ke `/oauth/authorize` dengan semua parameter wajib;
  - callback menolak `state` yang salah;
  - endpoint back-channel menolak token palsu dengan 400 dan tidak terkena CSRF;
  - logout menghapus sesi lokal.
- Jangan mengklaim alur end-to-end berhasil bila belum diuji dengan SSO sungguhan. Katakan apa yang sudah dan belum diuji.

### Langkah 5: Laporan di chat (wajib, Bahasa Indonesia)

Tutup pekerjaan dengan laporan memakai format di bawah. Nilai harus konkret dan siap disalin; tulis "(kosongkan)" untuk field yang tidak dipakai.

````markdown
## Daftarkan aplikasi di HNS SSO

Buka **SSO → API Management → + Daftarkan aplikasi**, lalu isi:

| Field di SSO | Isi |
| --- | --- |
| Nama aplikasi | … |
| Jenis client | Confidential / Public |
| Deskripsi | … (1 kalimat untuk Portal) |
| URL Logo (HTTPS, opsional) | … |
| Homepage URL | https://… |
| Initiate Login URL | https://…/auth/sso/login |
| Siapa yang boleh login? | Hanya pengguna yang diberi akses (whitelist) |
| Redirect URI (satu per baris) | https://…/auth/sso/callback |
| Post-logout Redirect URI | https://…/ |
| Back-channel Logout URI | https://…/auth/sso/backchannel-logout |
| Scope | openid ✓, profile ✓, email ✓ |
| Masa berlaku access token (detik) | 600 |
| Masa berlaku refresh token (detik) | 43200 |
| Aktif | ✓ |
| Tampilkan di Portal | ✓ |

Setelah disimpan, SSO menampilkan **Client ID** dan **Client Secret**. Secret hanya muncul sekali.

## Isi .env aplikasi ini

```env
SSO_ISSUER=…
SSO_CLIENT_ID=<dari SSO>
SSO_CLIENT_SECRET=<dari SSO>
SSO_REDIRECT_URI=…
SSO_POST_LOGOUT_REDIRECT_URI=…
```

## Migrasi akun yang sudah ada
1. Jalankan `<perintah ekspor>`: menghasilkan `<path>.csv` berisi N staf (password bcrypt: ya/tidak).
2. Di SSO: **Pengguna → Impor CSV**, pilih file itu, centang aplikasi ini, Pratinjau, lalu Impor. Setelah itu hapus file CSV-nya.
3. Di SSO: **API Management → aplikasi ini → Ekspor CSV (sub ↔ email)**.
4. Jalankan `<perintah link> <file> --dry-run`, periksa laporannya, lalu jalankan dengan `--apply`.
5. Akun baru setelahnya: buat di SSO dan centang aplikasi ini. Akun lokal dibuat otomatis saat login pertama.

## Yang sudah dibuat
- … (daftar file/route)

## Cara mencoba
1. …

## Catatan
- … (asumsi, hal yang belum diuji, keputusan yang perlu dikonfirmasi)
````

Aturan pengisian laporan:
- **Development vs production.** Back-channel logout dari SSO production tidak bisa menjangkau `localhost`. Bila user perlu mencoba secara lokal, sarankan mendaftarkan **client terpisah** untuk development, misalnya "Nama Aplikasi (Dev)", dengan redirect `http://localhost:<port>/auth/sso/callback` dan Back-channel Logout URI dikosongkan. Tampilkan tabel untuk keduanya bila relevan.
- **Public client:** tidak ada `SSO_CLIENT_SECRET`, dan origin SPA harus sama dengan origin redirect URI (kebutuhan CORS).
- **Access token TTL:** gunakan 300–900 detik kecuali ada alasan khusus (rentang yang diizinkan 60–3600). Refresh token TTL minimal 300 detik.
- **Logo** wajib HTTPS. Bila aplikasi punya logo publik, isi dengan URL-nya.
- Ingatkan user bahwa akun pengguna dibuat oleh admin SSO di menu **Pengguna**, siapa yang boleh masuk diatur lewat whitelist SSO, dan role tetap diatur di aplikasi ini.
- **Urutan go-live yang aman:** daftarkan aplikasi → impor user + whitelist → tautkan massal → baru aktifkan SSO / matikan login lokal staf. Bila auto-provision aktif sebelum penautan massal, user yang email-nya berbeda akan mendapat akun lokal baru yang kosong.

---

## 3. Siklus hidup akun

**Prinsip:**
- Identitas (siapa orangnya, password, 2FA) **hanya di SSO**.
- Whitelist (boleh masuk aplikasi ini atau tidak) **di SSO**.
- Role/hak akses dan **semua data bisnis** tetap di aplikasi ini.
- Tabel user lokal **tidak dihapus dan primary key-nya tidak diubah**, sehingga semua relasi data (pesanan, dokumen, log, dll.) tetap utuh. Jembatannya hanya kolom `sso_sub`.

### 3.1 Migrasi awal: user lama → SSO

1. **Ekspor user lokal** dengan skrip yang kamu buat. Formatnya CSV UTF-8 dengan header berikut:

   ```
   email,username,name,status,password_hash
   ```

   - `email` wajib dan dipakai SSO sebagai kunci penggabungan. Orang yang sama di beberapa aplikasi menjadi satu akun SSO bila emailnya sama.
   - `username`: opsional, harus cocok dengan pola `[a-z0-9._-]{3,64}`. Kosongkan bila username lokal tidak memenuhi pola; SSO akan membuatnya dari email.
   - `status`: `active` atau `disabled`.
   - `password_hash`: **hanya hash bcrypt** (`$2y$`, `$2a$`, `$2b$`). Dengan ini user bisa login ke SSO memakai password lamanya. Hash lain (MD5, SHA1, argon2, plaintext) **jangan diekspor**; kosongkan kolomnya, dan user tersebut login via Google atau di-reset admin.
   - **Hanya ekspor staf/akun internal.** Jangan sertakan pelanggan atau pengguna publik (lihat §3.6), akun sistem/bot, maupun akun uji.
   - File ini berisi hash password. Simpan di luar repository, hapus setelah diimpor, dan **jangan pernah tampilkan isinya di chat**.
2. **User mengimpor** di SSO melalui menu **Pengguna → Impor CSV**, dengan mencentang aplikasi ini di "Beri akses ke aplikasi". Pratinjau menandai duplikat, error, dan kemungkinan orang yang sama dengan email berbeda. Impor dulu aplikasi utama, karena data dari file pertama yang dipakai.
3. **User mengekspor pemetaan** di SSO melalui **API Management → aplikasi ini → Ekspor CSV (sub ↔ email)**. Formatnya:

   ```
   sub,username,email,name,status
   ```

   Nilai yang diawali `'` adalah pelindung formula Excel; buang awalan itu.
4. **Jalankan skrip penautan massal** (§3.2), lalu aktifkan login SSO.
5. **Satu password untuk staf, hanya di SSO.** Hash yang diekspor di langkah 1 hanya dipakai sekali agar staf bisa login ke SSO dengan password yang sudah mereka kenal. Setelah go-live:
   - kosongkan atau set ke nilai tak terpakai kolom password lokal **akun staf** yang sudah tertaut (sediakan opsi `--clear-staff-passwords` di skrip penautan, atau migrasi terpisah);
   - login password lokal untuk staf ditolak;
   - ganti/lupa password staf hanya dilakukan di SSO (halaman Akun & Keamanan, atau reset oleh admin SSO).

   Password **pelanggan** (aplikasi dengan pengguna publik, §3.6) tidak disentuh dan tetap dikelola aplikasi.

### 3.2 Skrip penautan massal (`sso:link-users`)

- Input: CSV ekspor SSO. Untuk tiap baris, cocokkan user lokal berdasarkan email (case-insensitive, di-trim). Opsi `--by-username` mencocokkan berdasarkan username bila email lokal berbeda.
- Hanya mengisi `sso_sub` (dan opsional menyamakan nama/email). **Jangan pernah** mengubah primary key, menghapus user, atau menggabungkan dua user lokal secara otomatis.
- Laporkan dan lewati kasus-kasus berikut:
  - user lokal sudah punya `sso_sub` yang berbeda (konflik);
  - satu email cocok ke beberapa user lokal;
  - `sub` sudah dipakai user lokal lain.
- Wajib ada `--dry-run` (default) dan `--apply`. Keluarannya ringkasan: tertaut, sudah tertaut, tidak ditemukan, konflik.
- User lokal yang tidak ada di CSV SSO berarti belum dibuat atau belum diberi akses di SSO. Tampilkan daftarnya supaya admin memutuskan: impor ke SSO, atau biarkan (akun lama hanya untuk riwayat data).
- Bila ada dua akun lokal untuk orang yang sama, penggabungan dilakukan **manual** oleh admin aplikasi: pindahkan relasi data ke satu akun, lalu nonaktifkan yang lain. Jangan diotomatisasi.

### 3.3 Penautan saat login (cadangan otomatis)

Urutan di callback:
1. Cari user lokal dengan `sso_sub = sub`.
2. Jika tidak ada, cari berdasarkan email (hanya user yang `sso_sub`-nya masih kosong) lalu tautkan.
3. Jika tetap tidak ada, buat akun lokal baru (auto-provision) dengan role default.

Setiap login, perbarui nama dan email lokal dari klaim. Email boleh berubah di SSO karena relasi memakai `sub`.

### 3.4 Akun baru setelah go-live

1. Admin SSO membuat akun (**Pengguna → Tambah pengguna**) dan mencentang aplikasi yang boleh dibuka. Atau impor CSV.
2. User login ke aplikasi melalui Portal atau tombol "Masuk dengan SSO HNS". Akun lokal dibuat otomatis dengan role default.
3. Admin aplikasi menaikkan role di aplikasi bila perlu. Opsional: admin aplikasi menyiapkan role lebih dulu dengan membuat baris user lokal berisi email + role tanpa password, yang akan tertaut otomatis saat login pertama (§3.3).

**Tidak ada** pembuatan akun staf langsung di aplikasi client, dan tidak ada registrasi mandiri untuk staf.

### 3.5 Akun ada di aplikasi tetapi belum di SSO

Akun ini tidak bisa login sampai dibuat di SSO. Tunjukkan ke user daftarnya (dari laporan `sso:link-users`) dan dua pilihan:
- impor ke SSO dengan CSV §3.1 berisi baris-baris itu saja, sambil mencentang aplikasi ini;
- biarkan sebagai akun riwayat yang tidak aktif.

### 3.6 Aplikasi dengan pengguna publik (e-commerce, portal member, pendaftaran umum)

SSO HNS adalah **SSO internal (workforce)**: tanpa registrasi mandiri, akun dibuat admin, dan berisi staf HNS. **Jangan memasukkan pelanggan atau pengguna publik ke SSO.** Aplikasi seperti ini tetap punya **satu halaman login saja**. Penentunya hanya satu: apakah email itu punya akses SSO ke aplikasi ini atau tidak.

**Alur identifier-first (satu halaman login):**
1. Langkah 1: user mengisi **email** saja, lalu klik "Lanjut".
2. Server aplikasi memanggil SSO, **dari server, jangan dari browser**:

   ```
   POST https://auth.hnsitcenter.id/api/clients/access-check
   Authorization: Basic base64(client_id:client_secret)
   Content-Type: application/x-www-form-urlencoded

   email=<email yang diketik>
   → 200 {"sso": true}   atau   {"sso": false}
   ```

   - `sso: true` berarti user aktif di SSO dan ada di whitelist aplikasi ini. Redirect ke `/auth/sso/login?login_hint=<email>&return_to=...`. Form login SSO akan terisi email itu, dan setelah login user masuk sebagai **staf**.
   - `sso: false` berarti user adalah pelanggan. Tampilkan langkah 2 (password) dengan login lokal aplikasi, termasuk tautan daftar dan lupa password pelanggan.
3. Membuka aplikasi dari Portal SSO (Initiate Login URL) langsung menuju jalur SSO tanpa langkah 1.

**Aturan:**
- Endpoint access-check hanya untuk confidential client dan hanya menjawab whitelist aplikasi pemanggil. Batasnya 600 request/menit per client, dan 401 bila secret salah.
- **Gagal aman.** Jika SSO tidak bisa dihubungi atau error, perlakukan sebagai `sso: false` (tampilkan form pelanggan) dan tambahkan pesan "Staf HNS: coba lagi beberapa saat". Jangan pernah memberi akses staf tanpa melalui SSO.
- Jangan cache jawaban lebih dari 60 detik, supaya pencabutan whitelist cepat berlaku.
- Pasang rate limit per IP di langkah 1, karena jawaban berbeda per email bisa dipakai untuk menebak email staf. Gunakan pesan netral.
- **Pemisahan staf dan pelanggan:**
  - Role staf **hanya** boleh diperoleh lewat jalur SSO. Login password lokal **tidak boleh** berhasil untuk akun bertipe staf, walaupun akun itu punya kolom password lama.
  - Penautan `sso_sub` dan auto-provision dari SSO hanya untuk akun bertipe staf. Jika email SSO sama dengan akun **pelanggan** yang sudah ada, **jangan tautkan dan jangan ubah tipenya**. Buat record staf terpisah atau laporkan konflik ke admin.
  - Sesi staf dan sesi pelanggan dibedakan (guard/role terpisah), dan area admin wajib memeriksa role staf di server.
- Back-channel logout dan pengecekan refresh hanya berlaku untuk sesi staf. Sesi pelanggan tidak berhubungan dengan SSO.
- Ekspor CSV (§3.1) hanya berisi staf, tidak pernah pelanggan.

### 3.7 Penonaktifan, penghapusan, perubahan data

- **Dinonaktifkan atau dihapus di SSO:** user tidak bisa login, sesi SSO dicabut, aplikasi menerima back-channel logout, dan refresh berikutnya gagal. Akun lokal **jangan dihapus otomatis** (data riwayat). Tandai saja tidak aktif bila diperlukan.
- **Akses ke aplikasi ini dicabut di SSO:** sama seperti di atas, tetapi hanya untuk aplikasi ini.
- **Nama/email berubah:** diperbarui dari klaim pada login berikutnya.

---

## 4. Resep per stack

Selalu cek versi library yang terpasang dan sesuaikan API-nya. Kode di bawah adalah pola, bukan untuk ditempel buta.

> **Reverse proxy (Dokploy/Traefik/Nginx):** jangan pernah membentuk URL redirect atau `redirect_uri` dari `request.url`, header `Host`, atau `$_SERVER['HTTP_HOST']`. Di belakang proxy nilainya alamat internal (mis. `http://localhost:3000`), sehingga redirect salah alamat atau token ditolak (`invalid_grant`). Selalu pakai `SSO_REDIRECT_URI`, `SSO_POST_LOGOUT_REDIRECT_URI`, dan base URL aplikasi dari environment. Di Laravel, set `APP_URL` dan trusted proxies.

### Node.js / Next.js / Express: `openid-client` (v6) + `jose`

```ts
import * as oidc from "openid-client";

// Discovery sekali, lalu cache. client_secret_basic adalah default bila secret diberikan.
const config = await oidc.discovery(new URL(process.env.SSO_ISSUER!), process.env.SSO_CLIENT_ID!, process.env.SSO_CLIENT_SECRET!);

// Login
const codeVerifier = oidc.randomPKCECodeVerifier();
const state = oidc.randomState();
const nonce = oidc.randomNonce();
// simpan { codeVerifier, state, nonce, returnTo } ke cookie HttpOnly/Secure/SameSite=Lax (path /auth/sso, 600 detik)
const url = oidc.buildAuthorizationUrl(config, {
  redirect_uri: process.env.SSO_REDIRECT_URI!,
  scope: "openid profile email",
  code_challenge: await oidc.calculatePKCECodeChallenge(codeVerifier),
  code_challenge_method: "S256",
  state,
  nonce,
});

// Callback: memvalidasi state, iss, PKCE, dan id_token (JWKS, aud, exp, nonce)
// URL callback dibentuk dari SSO_REDIRECT_URI + query string request, BUKAN dari request.url
// (di belakang reverse proxy request.url = alamat internal, mis. http://localhost:3000 → invalid_grant).
const callbackUrl = new URL(process.env.SSO_REDIRECT_URI!);
callbackUrl.search = new URL(request.url).search;
const tokens = await oidc.authorizationCodeGrant(config, callbackUrl, {
  pkceCodeVerifier: flow.codeVerifier,
  expectedState: flow.state,
  expectedNonce: flow.nonce,
  idTokenExpected: true,
});
const claims = tokens.claims()!; // claims.sub, claims.sid, claims.email, ...

// Refresh (dengan lock); simpan tokens.refresh_token yang BARU
const refreshed = await oidc.refreshTokenGrant(config, session.refreshToken);

// Logout
const endUrl = oidc.buildEndSessionUrl(config, {
  id_token_hint: session.idToken,
  post_logout_redirect_uri: process.env.SSO_POST_LOGOUT_REDIRECT_URI!,
});
```

Back-channel dengan `jose`:

```ts
import { createRemoteJWKSet, jwtVerify } from "jose";
const JWKS = createRemoteJWKSet(new URL(`${process.env.SSO_ISSUER}/.well-known/jwks.json`));

const { payload } = await jwtVerify(logoutToken, JWKS, {
  issuer: process.env.SSO_ISSUER,
  audience: process.env.SSO_CLIENT_ID,
  typ: "logout+jwt",
  algorithms: ["RS256"],
  maxTokenAge: "2 minutes",
});
const ok = !payload.nonce && !!(payload.events as Record<string, unknown>)?.["http://schemas.openid.net/event/backchannel-logout"];
// lalu hapus sesi lokal dengan sso_sid === payload.sid
```

Catatan khusus Next.js App Router:
- Gunakan Route Handler untuk login, callback, logout, dan back-channel.
- `cookies()` bersifat async.
- Middleware/proxy hanya untuk pengecekan optimistis; verifikasi sesi tetap dilakukan di server (Data Access Layer).
- Untuk Express, simpan sesi di `express-session` dengan store server-side, panggil `req.session.regenerate()` setelah callback, dan daftarkan route back-channel sebelum middleware CSRF.

### Laravel (PHP)

- `composer require firebase/php-jwt`, lalu buat `SsoController` (redirect, callback, logout, backchannel) dan migrasi kolom `sso_sub` (unique, nullable) pada `users`.
- Ambil endpoint dari discovery dengan `Http::get(...)` dan `Cache::remember`. Ambil kunci dengan `JWK::parseKeySet(<jwks json>)`, lalu verifikasi dengan `JWT::decode($jwt, $keys)` dan `JWT::$leeway = 30`. Cek `iss`, `aud`, dan `nonce` secara manual dengan `hash_equals`.
- PKCE: `$verifier = Str::random(64)`; `$challenge = rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=')`.
- Tukar token: `Http::asForm()->withBasicAuth(id, secret)->post($tokenEndpoint, [...])`.
- Setelah `Auth::login($user)`, panggil `$request->session()->regenerate()`. Simpan `sso_sid`, `id_token`, dan `refresh_token` di session.
- Route back-channel:
  - Pasang `->withoutMiddleware(VerifyCsrfToken::class)`. Di Laravel 11+, kecualikan lewat `$middleware->validateCsrfTokens(except: [...])` di `bootstrap/app.php`.
  - Gunakan session driver `database` atau `redis` dan tabel pemetaan `sso_sid → session id` supaya sesi bisa dihapus.
- Logout: `Auth::logout()`, `session()->invalidate()`, `session()->regenerateToken()`, lalu redirect ke end session.

### Stack lain

Gunakan library OpenID Connect Relying Party yang matang dan bersertifikat:
- Python: Authlib (Django/Flask/FastAPI)
- Go: `github.com/coreos/go-oidc/v3` + `golang.org/x/oauth2`
- Java: Spring Security `oauth2-client`
- .NET: `Microsoft.AspNetCore.Authentication.OpenIdConnect`
- PHP non-Laravel: `jumbojett/openid-connect-php`

Konfigurasi wajibnya: authority/issuer = SSO, `response_type=code`, PKCE S256 aktif, autentikasi `client_secret_basic`, scope `openid profile email`, token disimpan di server, dan tambahkan endpoint back-channel bila library tidak menyediakannya.

### SPA (public client)

Gunakan `oidc-client-ts` (`authority`, `client_id`, `redirect_uri`, `response_type: "code"`, `scope`). Simpan token di memori atau `sessionStorage` (bukan `localStorage`), tanpa secret. API backend memvalidasi access token dengan `aud` = client ID SPA tersebut.

---

## 5. Checklist keamanan (semua harus terpenuhi)

- [ ] Client secret hanya di environment server. Tidak pernah di repository, log, frontend, atau laporan chat.
- [ ] `state`, `nonce`, dan `code_verifier` acak per percobaan login, sekali pakai, lalu dihapus setelah callback.
- [ ] `state` dibandingkan secara timing-safe. `iss` di callback sama dengan issuer.
- [ ] id_token diverifikasi: RS256 via JWKS, `iss`, `aud`, `azp`, `exp`, dan `nonce`.
- [ ] User dicocokkan dengan `sub`, bukan email (email hanya untuk penautan pertama).
- [ ] Session ID lokal diregenerasi setelah login. Cookie `HttpOnly`, `Secure` (production), `SameSite=Lax`.
- [ ] Token disimpan di server, bukan localStorage.
- [ ] Refresh token baru selalu disimpan, refresh memakai lock, dan `invalid_grant` berarti logout lokal.
- [ ] `return_to` divalidasi sebagai path relatif (cegah open redirect).
- [ ] Endpoint back-channel memverifikasi JWT, dikecualikan dari CSRF, dan menghapus sesi berdasarkan `sid`.
- [ ] Logout lokal lalu end session SSO dengan `id_token_hint`. Route logout berupa POST yang dilindungi CSRF aplikasi.
- [ ] Production memakai HTTPS. Redirect URI di kode sama persis dengan yang didaftarkan.
- [ ] Hak akses (role/permission) tetap ditentukan aplikasi ini; siapa yang boleh masuk ditentukan whitelist SSO.
- [ ] Primary key dan relasi data user lokal tidak diubah; penautan hanya lewat `sso_sub`, dan penggabungan akun tidak diotomatisasi.
- [ ] Pengguna publik/pelanggan tidak bisa memperoleh akses staf lewat SSO, dan tidak ikut diekspor ke SSO.
- [ ] File CSV ekspor (berisi hash password) tidak di-commit, tidak ditampilkan di chat, dan dihapus setelah impor.

## 6. Kesalahan umum

| Gejala | Penyebab |
| --- | --- |
| Halaman SSO "redirect_uri tidak terdaftar" | URI di `.env` beda dengan yang didaftarkan: http/https, port, atau trailing slash |
| `invalid_client` | Secret salah atau terpotong (formatnya `hns_cs_...`), secret sudah dirotasi, client nonaktif, atau public client mengirim secret |
| `invalid_request` di callback | PKCE tidak dikirim atau method bukan S256 |
| `invalid_grant` saat tukar code | Code > 60 detik, dipakai dua kali (callback ter-refresh, double request), `redirect_uri` beda, atau verifier salah |
| `invalid_grant` saat refresh | Refresh token lama dipakai (race antar request atau tab), atau sesi SSO sudah berakhir |
| User ter-logout dari aplikasi ini setelah login ulang di aplikasi lain | Normal: login ulang di SSO mengganti sesi (`sid` baru) dan sesi lama menerima back-channel logout |
| Setelah login, browser diarahkan ke `localhost:3000` / `invalid_grant` padahal URI sudah benar | URL dibentuk dari `request.url` di belakang reverse proxy. Pakai URL dari environment (lihat catatan Reverse proxy di §4) |
| Back-channel tidak pernah datang saat development | SSO tidak bisa menjangkau `localhost`. Gunakan client dev tanpa back-channel |
| `kid` tidak ditemukan | Cache JWKS usang setelah rotasi kunci. Ambil ulang JWKS |
| `login_required` | `prompt=none` dipakai saat user belum login di SSO. Arahkan ke login biasa |
| Halaman SSO "Akses ditolak" / `access_denied` | User belum di-whitelist untuk aplikasi ini. Admin SSO memberi akses di halaman pengguna atau halaman aplikasi |
| User lama tidak tertaut ke akun lokalnya (data "hilang") | Email di SSO berbeda dengan email lokal. Tautkan dengan `sso:link-users --by-username` atau perbaiki email, lalu hapus akun lokal duplikat hasil auto-provision setelah memindahkan datanya |
