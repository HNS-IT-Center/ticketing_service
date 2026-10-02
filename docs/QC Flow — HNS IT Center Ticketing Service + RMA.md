# QC Flow — HNS IT Center Ticketing Service + RMA

Oct 1, 2026 · @Developer HNS

## Ringkasan

QC dijalankan dalam 12 modul berurutan, dari login sampai laporan poin, lalu ditutup smoke test rilis. Dokumen ini disusun dari kode repo `ticketing_service` per commit `e8a71e2` (30 Sep 2026). Modul klaim garansi merangkum dan memperbarui `docs/rma-test-checklist.md`, karena jalur tidak-layak sudah pindah dari teknisi ke meja RMA.

**Ruang lingkup.** Semua portal (Admin, Teknisi, Sales, RMA), halaman tracking publik, chat, upload, poin/leaderboard, jadwal, profil. Tidak termasuk mutasi stok gudang, approval kepala toko/gudang, dan pengiriman WhatsApp sungguhan (yang diuji hanya tombol dan template linknya).

**Lingkungan uji.** Lokal (Next.js dev + PostgreSQL container `hns-ticketing-pg` + MinIO) untuk QC fitur, lalu staging VPS untuk smoke test rilis. Dilarang menguji terhadap database produksi.

| Role | Email | Password | Dipakai untuk |
| --- | --- | --- | --- |
| Administrator | `admin@techserve.id` | `admin123` | master data, override status, performance |
| Teknisi (Team Leader) | `budi@techserve.id` | `tech123` | set `is_team_leader` di Modul B |
| Teknisi | `siti@techserve.id`, `agus@techserve.id` | `tech123` | pengerjaan, rebutan tiket |
| Sales / CS | `sales@techserve.id` | `sales123` | intake, PC build, revisi |
| RMA | `rma@techserve.id` | `rma123` | portal `/rma` |

**Prasyarat.**

1. `docker start hns-ticketing-pg hns-minio`, `.env.local` berisi `R2_ENDPOINT`, `R2_BUCKET_NAME`, `NEXT_PUBLIC_R2_PUBLIC_URL` (lihat `docs/minio-local-storage.md`).
2. Database direset lalu di-seed sebelum putaran QC pertama, supaya angka poin bisa dibandingkan dari nol.
3. Minimal dua store aktif (mis. `NGW` dan satu lagi) untuk menguji isolasi per store dan Team vs Team.
4. Siapkan file uji: 2 gambar JPG/PNG kecil, 1 PDF, 1 file non-gambar (mis. `.txt`), 1 gambar besar di atas batas upload.
5. Gunakan 2–3 jendela browser (normal, incognito, browser lain) agar beberapa role login bersamaan.
6. Terminal dev server tetap terlihat; error server muncul di sana, bukan di browser.

**Cara mengisi.** Kolom Hasil diisi PASS / FAIL / BLOCKED. Setiap FAIL wajib punya screenshot dan nomor bug (format di bagian akhir). Catat kode tiket yang dipakai, karena modul berikutnya memakai tiket dari modul sebelumnya.

## Modul A — Autentikasi, SSO, dan akses per role

Setiap role harus mendarat di dashboard-nya sendiri dan terpental dari portal role lain. Dua kasus SSO (A-12, A-13) kemungkinan besar FAIL berdasarkan kode saat ini; jalankan lebih dulu agar keputusan bisnisnya cepat diambil.

> **Status putaran 2026-10-01.** A-07 s/d A-10 sudah diverifikasi lewat probe HTTP: sesi
> ditandatangani langsung dengan `SESSION_SECRET` lalu setiap rute portal diminta dengan
> `redirect: manual`. Itu menguji `proxy.ts` dengan jujur, tapi **tidak** menguji login —
> A-01 s/d A-06 tetap harus dijalani di browser.

| ID | Skenario | Langkah | Hasil yang diharapkan | Hasil |
| --- | --- | --- | --- | --- |
| A-01 | Login valid tiap role | Login dengan 5 akun uji bergantian | Admin → `/admin/dashboard`, Teknisi → `/technician/dashboard`, Sales → `/sales/dashboard`, RMA → `/rma/dashboard` | ⬜ browser. Hash keenam akun sudah diverifikasi cocok |
| A-02 | Password salah | Email benar, password salah | Pesan error generik, tidak membocorkan apakah email terdaftar | ⬜ browser. Harus muncul `Invalid email or password` — pesan yang sama untuk email tidak ada **dan** password salah (`auth.ts:60` & `:66`) |
| A-03 | Field kosong / email tidak valid | Submit kosong, lalu `abc` di field email | Error validasi per field, tidak ada request login yang lolos | ⬜ browser |
| A-04 | Akun nonaktif | Nonaktifkan user di Modul B → coba login | Ditolak dengan pesan akun nonaktif | ⬜ BLOCKED sampai Modul B. Catatan: cek `is_active` terjadi **setelah** cek password (`auth.ts:69`), jadi password salah pada akun nonaktif tetap memberi pesan generik — benar, tidak membocorkan status akun |
| A-05 | Remember me | Login dengan centang → tutup browser → buka lagi | Masih login (cookie 7 hari). Tanpa centang: sesi hilang saat browser ditutup | ⬜ browser. `maxAge` 7 hari hanya dipasang bila dicentang (`lib/session.ts:52`) |
| A-06 | Logout | Klik logout → tekan Back | Kembali ke `/login`, halaman portal tidak bisa diakses dari cache | ⬜ browser |
| A-07 | Sudah login buka `/login` | Saat login, ketik `/login` | Diarahkan ke dashboard role sendiri | ✅ **PASS** — kelima role dipantulkan ke tujuannya sendiri; Customer → `/unauthorized` |
| A-08 | Akses lintas portal | Teknisi buka `/admin/users`, `/rma/dashboard`, `/sales/tickets` | Diarahkan ke `/technician/dashboard`, data portal lain tidak tampil sesaat pun | ✅ **PASS** — ketiganya 307 → `/technician/dashboard`, tidak ada 200 yang bocor |
| A-09 | RMA ke portal admin | RMA buka `/admin/dashboard` | Diarahkan ke `/rma/dashboard` (bukan `/unauthorized`) | ✅ **PASS** — 307 → `/rma/dashboard` |
| A-10 | Tanpa sesi | Incognito buka `/admin/tickets` dan panggil `/api/notifications` | Halaman → `/login`; API → 401 JSON, bukan HTML | ✅ **PASS** — halaman 307 → `/login`; API 401 `application/json`. Catatan: body-nya `[]`, bukan objek error — klien yang hanya membaca body bisa salah menyimpulkan "tidak ada notifikasi". Bukan kegagalan A-10 |
| A-11 | SSO staf baru | Masuk lewat SSO dengan departemen `Technician` / `Sales` / role global `ADMIN` | User lokal terbuat dengan role yang sesuai lalu masuk ke dashboard-nya | ⛔ **BLOCKED** — `NEXT_PUBLIC_SSO_URL` dan `JWT_SECRET` tidak ada di `.env.local` |
| A-12 | **SSO untuk user RMA** | User lokal ber-role RMA masuk lewat SSO | Perlu keputusan. Kode sekarang tidak punya pemetaan RMA: user dianggap non-staf, **dinonaktifkan**, dan diarahkan ke `/unauthorized` | ⛔ **BLOCKED** — idem A-11 |
| A-13 | **SSO vs nonaktif oleh admin** | Admin menonaktifkan teknisi → teknisi masuk lewat SSO | Perlu keputusan. Nonaktif dari admin mengacak email, sehingga SSO tidak menemukan user lama dan **membuat akun baru** dengan email asli. Teknisi yang dinonaktifkan tetap bisa masuk | ⛔ **BLOCKED** — idem A-11. Bukti pendukung ada di database: `cmqp00qfm000004ldstfn4zd8__deleted__@deactivated.local` |
| A-14 | SSO non-staf | Masuk SSO dengan departemen lain | `/unauthorized`, tidak ada user lokal terbuat | ⛔ **BLOCKED** — idem A-11 |
| A-15 | Token SSO rusak / kedaluwarsa | Ubah cookie `sso_token` lalu buka `/api/auth/sso-sync` | Ditolak, diarahkan ke `/login`, tidak ada sesi terbuat | ⬜ sebagian bisa: tanpa `sso_token` route langsung redirect `/login` (`route.ts:26`). Token rusak butuh `JWT_SECRET` → BLOCKED |
| A-16 | Login customer | Akun ber-role Customer mencoba login | ~~`/unauthorized`~~ **tetap di `/login`** dengan pesan `Customer login is disabled. Please use your ticket link.` | ⛔ **BLOCKED** — tidak ada akun ber-role Customer di database lokal. ⚠️ **Ekspektasi dokumen salah**: `loginAction` menghapus sesi lalu mengembalikan pesan ke form login; tidak ada redirect ke `/unauthorized` (`auth.ts:88-91`, `lib/routes.ts:43-48`). Redirect `/unauthorized` hanya terjadi bila sesi Customer membuka rute portal — itu sudah PASS di A-07 |

## Modul B — Master data admin: store dan user

Store dan user harus siap sebelum tiket dibuat, karena kode tiket memakai kode store dan dashboard teknisi difilter per store.

| ID | Skenario | Langkah | Hasil yang diharapkan | Hasil |
| --- | --- | --- | --- | --- |
| B-01 | Buat store | Admin → Stores → Create, kode `NGW` | Store tampil di daftar dan bisa dipilih saat membuat tiket | ⬜ perlu browser |
| B-02 | Format kode store | Kode `ngw`, `N`, `NAGOYA1` | Ditolak: 2–6 huruf besar/angka | ⬜ perlu browser |
| B-03 | Duplikat store | Nama atau kode yang sudah ada | Ditolak "already exists" | ✅ **PASS (lapis database)** — insert kode store duplikat ditolak `P2002 StoreLocation_code_key`. Pesan UI-nya tetap perlu browser |
| B-04 | Hapus store bertiket | Hapus store yang punya tiket | Ditolak, diminta menonaktifkan saja | ⬜ perlu browser |
| B-05 | Nonaktifkan store | Set store tidak aktif | Tidak muncul lagi di pilihan store form tiket; tiket lamanya tetap terbuka normal | ⬜ perlu browser |
| B-06 | Assign teknisi ke store | Tambah Siti ke `NGW` lalu ke store kedua | Tiket kedua store muncul di dashboard Siti | ⬜ perlu browser — ini juga prasyarat D-01/D-03, lihat §2 run sheet |
| B-07 | Lepas teknisi dari store | Hapus Siti dari store kedua | Tiket store kedua hilang dari antrean Siti; tiket yang sudah ia kerjakan tetap bisa dibuka | ⬜ perlu browser |
| B-08 | Buat user tiap role | Buat Teknisi, Sales, RMA, Admin | User bisa login; Teknisi otomatis punya baris performance (poin 0) | ⬜ perlu browser |
| B-09 | Email duplikat | Buat user dengan email yang ada | Ditolak "Email already in use" | ⬜ `email String @unique` ada di schema (baris 180) tapi **belum teruji** — percobaan insert saya gagal karena `phone_number` wajib, bukan karena constraint |
| B-10 | Validasi input user | Password 3 karakter, email `abc`, nama kosong | Ditolak di client **dan** server (uji juga lewat request langsung) | ⬜ perlu browser |
| B-11 | Edit email ke email user lain | Ubah email user A menjadi email user B | Pesan error rapi, bukan error 500 | ⬜ perlu browser |
| B-12 | Team Leader maks 1 per store | Jadikan Budi TL, lalu Siti (store sama) TL | Siti ditolak "Max 1 Team Leader per store" | ✅ **invarian terjaga pada data nyata** — NGW 1 TL (`raffi@hns.id`), NGH 1 TL (`dennis@hns.id`). Penolakan saat menambah TL kedua perlu browser |
| B-13 | TL lewat jalur assign store | Siti TL di store lain → assign Siti ke store Budi | Tetap tidak boleh ada 2 TL di satu store | ⬜ perlu browser |
| B-14 | Shift dan hari kerja | Ubah shift (morning/noon) dan hari kerja | Tersimpan dan terlihat di Jadwal (Modul K) | ⬜ perlu browser |
| B-15 | Pre-check nonaktif user | Nonaktifkan teknisi yang punya tiket `waiting`/`on_progress` | Modal menampilkan daftar tiket aktif dan opsi reassign | ⬜ perlu browser |
| B-16 | Nonaktif + reassign | Pilih teknisi pengganti → konfirmasi | Tiket aktif pindah ke pengganti; user nonaktif tidak bisa login | ⬜ perlu browser |
| B-17 | Nonaktifkan diri sendiri | Admin menonaktifkan akunnya sendiri | Ditolak | ⬜ perlu browser |
| B-18 | Ubah role user | Teknisi diubah jadi Sales | Setelah login ulang masuk portal Sales; tiket lamanya tetap konsisten | ⬜ perlu browser |

## Modul C — Pembuatan tiket semua tipe dan semua role

Setiap tiket baru harus berstatus `waiting`, punya kode store yang unik, token publik, dan satu baris Status History. Buat minimal satu tiket per tipe di sini; tiket-tiket ini dipakai lagi di Modul D–I.

| ID | Skenario | Langkah | Hasil yang diharapkan | Hasil |
| --- | --- | --- | --- | --- |
| C-01 | Tiket Service | Teknisi buat tiket Service, Laptop, isi data customer lengkap | Kode `NGW-xxxx`, status `waiting`, link publik tersedia | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| C-02 | Tiket Cleaning tiap paket | Buat 5 tiket: Basic, Deep Clean, Repaste, Full Repaste, Full Repaste CPU+GPU | Paket tersimpan sesuai pilihan (dipakai untuk uji poin di Modul J) | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| C-03 | Tiket Upgrade | Pilih 1+ item upgrade | Item upgrade tersimpan di detail tiket | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| C-04 | Tiket PC Build | Isi daftar komponen | Komponen tersimpan; tiket muncul di Sales bila Sales di-assign | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| C-05 | Tiket Klaim Garansi | Klik chip "Warranty Claim", isi SN + tanggal beli + nota | Tiket bertipe klaim, nota tersimpan sebagai attachment | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| C-06 | Klaim tanpa SN / tanggal beli | Kosongkan salah satu | Ditolak dengan pesan berbahasa Indonesia; uji juga lewat request langsung (validasi server) | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| C-07 | Jenis kasus wajib dipilih | Pilih perangkat lalu Next tanpa memilih chip | Ditolak "Please select a case" | ⬜ perlu browser |
| C-08 | Field wajib customer | Kosongkan nama / nomor WhatsApp | Ditolak, tidak ada tiket terbuat | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| C-09 | Format nomor WhatsApp | `0812…`, `+62812…`, `62812…`, huruf | Disimpan dalam satu format konsisten sehingga tombol WA (Modul I) membuka nomor yang benar | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| C-10 | Lampiran saat intake | Upload 2 gambar + 1 PDF | Semua tampil di detail tiket dan bisa dibuka | ⬜ perlu form, **tapi jalur uploadnya sudah PASS** — lihat Sesi 0-2 di run sheet |
| C-11 | Opsi intake | Centang overnight, overnight check, syarat & ketentuan, isi kelengkapan & kondisi | Semua tersimpan dan tampil di detail | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| C-12 | Tipe customer | Buat tiket untuk User, Internet Cafe, Company, Dealer | Tersimpan dan bisa difilter di daftar admin | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| C-13 | Tiket tanpa store | Buat tiket tanpa memilih store (bila form mengizinkan) | Perlu keputusan: kode jatuh ke format `TKT-…`; sebaiknya store wajib | ✅ terkonfirmasi di kode (`tickets.ts:89` → `TKT-${nanoid()}`) dan **0 tiket** berformat `TKT-` di data. Tetap "perlu keputusan", bukan bug |
| C-14 | Kode unik saat bersamaan | Dua user submit tiket store sama di detik yang sama | Dua kode berbeda, tidak ada error | ⚠️ **TEMUAN** — 6 panggilan `nextStoreTicketCode("NGW")` paralel mengembalikan kode **identik** (`NGW-000373`). Alokasi tidak diserialkan; keunikan hanya dijaga unique index + retry di `createTicketAction`. Pola sama dengan BL19 |
| C-15 | Buat tiket sebagai Sales | Sales buat tiket Service dan Klaim | Form dan validasi sama dengan teknisi | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| C-16 | Buat tiket sebagai Admin | Admin buat tiket dan langsung pilih teknisi | Tiket langsung ter-assign ke teknisi tsb | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| C-17 | Buat tiket sebagai RMA | RMA buat tiket dari `/rma/tickets/create` | Tiket terbuat; RMA diarahkan kembali ke daftar tiket portal RMA | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| C-18 | Teknisi assign teknisi lain | Teknisi isi `technician_id` milik orang lain (lewat form atau request) | Perlu keputusan: diizinkan atau ditolak. Saat ini server tidak membatasi | ⬜ perlu form. Terkonfirmasi di kode: server tidak membatasi |
| C-19 | Redirect setelah buat | Buat tiket dari tiap portal | Kembali ke daftar tiket portal masing-masing, tiket baru di posisi teratas | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |

## Modul D — Pengambilan dan assignment tiket

Tiket `waiting` hanya boleh dipegang satu teknisi, lewat request yang disetujui Admin/Sales/Team Leader atau lewat assign langsung admin. Uji rebutan dengan dua teknisi login bersamaan.

| ID | Skenario | Langkah | Hasil yang diharapkan | Hasil |
| --- | --- | --- | --- | --- |
| D-01 | Antrean per store | Siti (store `NGW`) buka dashboard | Hanya tiket `waiting` store yang ia pegang yang tampil | ⛔ BLOCKED — `siti` belum terpasang di store mana pun (prasyarat Modul B) |
| D-02 | Request tiket | Siti klik ambil tiket | Request berstatus pending, tombol berubah jadi "batalkan" | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| D-03 | Rebutan | Siti dan Agus klik ambil tiket yang sama hampir bersamaan | Hanya satu request tercatat; yang kedua menerima "already requested" | ⚠️ **TEMUAN** — database **mengizinkan 2 request pending** pada satu tiket (dibuktikan: `@@unique([ticket_id, technician_id])` tidak menghalangi dua teknisi berbeda). Aturan "1 per tiket" hanya dijaga `findFirst` lalu `upsert` **tanpa transaksi** → dua klik bersamaan bisa lolos keduanya |
| D-04 | Request ganda | Siti klik ambil dua kali | Ditolak "You have already requested" | ✅ dijaga dua lapis — cek aplikasi (`technician.ts:61`) + `@@unique([ticket_id, technician_id])` |
| D-05 | Batalkan request | Siti batalkan sebelum disetujui | Request hilang; tiket bisa diminta teknisi lain | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| D-06 | Batalkan setelah diproses | Admin setujui → Siti coba batalkan | Ditolak "already handled" | ✅ **PASS** — accept kedua pada request yang sama → `409 Request already handled` |
| D-07 | Approve oleh Admin / Sales | Admin setujui request | Tiket ter-assign ke Siti, Siti dapat notifikasi "approved" | ✅ **PASS** — tiket ter-assign ke siti, request teknisi lain otomatis jadi `rejected`, notifikasi `assigned` terkirim: `✅ Your request for ticket #NGW-000076 was approved!` |
| D-08 | Approve oleh Team Leader | Budi (TL) setujui request di store-nya | Berhasil seperti D-07 | ⛔ BLOCKED — belum ada TL di antara akun uji (`budi` TL=false → 403). Perlu Modul B |
| D-09 | **TL lintas store** | Budi setujui request tiket store lain | Perlu keputusan: sebaiknya ditolak. Saat ini API tidak memeriksa store | ⚠️ **TEMUAN terkonfirmasi** — `GET` memfilter per store (`route.ts:44-62`), **`POST` tidak memeriksa store sama sekali**. Koordinator dapat menyetujui request tiket store mana pun bila tahu `requestId`-nya. Lonceng hanya menyembunyikan, tidak menghalangi |
| D-10 | Teknisi biasa approve | Agus (bukan TL) panggil API approve | 403 Forbidden | ✅ **PASS** — `agus` (Teknisi bukan TL) → **403** pada GET maupun POST. Tanpa sesi → 401 |
| D-11 | Tolak request | Admin tolak | Siti dapat notifikasi "declined"; tiket kembali bisa diminta | ⬜ jalur reject belum diuji (hanya accept) |
| D-12 | Approve tiket yang sudah ter-assign | Assign lewat admin, lalu approve request lama | 409 "Ticket already assigned" | ⚠️ 409 terbukti, **tapi lewat jalur lain**: accept pertama men-`rejected` request kedua, jadi yang muncul `Request already handled`, bukan `Ticket already assigned`. Jalur asli D-12 (admin assign langsung → approve request yang masih pending) belum diuji |
| D-13 | Assign langsung oleh Admin | Admin pilih teknisi di panel assign | Teknisi dapat notifikasi "assigned" | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| D-14 | Ganti teknisi setelah mulai | Teknisi sudah Start Work → admin ganti teknisi | Ditolak "cannot be changed once work has started" | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| D-15 | Akses tiket orang lain | Agus buka URL detail tiket milik Siti dan coba ubah status | Ditolak "You are not assigned to this ticket" | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |

## Modul E — Pengerjaan teknisi, time tracking, bukti kerja

Waktu kerja final harus sama dengan jumlah interval aktif saja; jeda tidak boleh ikut terhitung. Catat jam mulai, jeda, dan lanjut secara manual (stopwatch) supaya bisa dibandingkan dengan angka sistem.

| ID | Skenario | Langkah | Hasil yang diharapkan | Hasil |
| --- | --- | --- | --- | --- |
| E-01 | Start Work | Siti klik Start Work pada tiket `waiting` miliknya | Status `on_progress`, timer jalan, time log `START` tercatat | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| E-02 | Pause dengan alasan | Klik Pause, isi "menunggu sparepart" | Timer berhenti, log `PAUSE` beserta alasan | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| E-03 | Pause tanpa alasan | Klik Pause, kosongkan alasan; ulangi lewat request langsung | Ditolak di dialog **dan** di server. Catatan: server saat ini menerima alasan kosong | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| E-04 | Resume | Klik Resume dengan alasan | Timer lanjut dari angka terakhir, log `RESUME` | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| E-05 | Hitung waktu kerja | Kerja 10 menit → pause 5 menit → kerja 10 menit → Done | Waktu kerja ±20 menit, bukan 25 | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| E-06 | Refresh dan tab lain | Refresh saat timer jalan, buka tiket di tab kedua | Timer tetap benar di kedua tab, tidak reset | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| E-07 | Done tiket non-klaim | Tandai Done pada tiket Service | Status `done`, log `DONE`, notifikasi "completed" berisi poin, poin teknisi bertambah | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| E-08 | Done tiket klaim | Coba Done pada tiket klaim `on_progress` | Ditolak: klaim hanya bisa diserahkan ke RMA (Modul H) | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| E-09 | Lompat status | Tiket `waiting` langsung di-Done lewat request | Ditolak "Cannot move to done from waiting" | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| E-10 | Catatan teknisi | Ubah catatan teknisi lalu refresh | Tersimpan; tidak terlihat di halaman publik bila memang catatan internal | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| E-11 | Extra service | Centang dan lepas extra service | Tersimpan; poin tidak bertambah (lihat Modul J) | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| E-12 | Upload progres | Upload foto progres di tengah pengerjaan | Tersimpan sebagai attachment, urutan waktu benar | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| E-13 | Reject dengan alasan | Teknisi tolak tiket, alasan kosong lalu diisi | Kosong ditolak; diisi → `rejected`, `failed_count` +1 | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| E-14 | **Cancel/Reject dari status akhir** | Pada tiket `completed`, kirim status `cancelled` lewat request | Perlu keputusan: sebaiknya ditolak. Saat ini server mengizinkan `cancelled`/`rejected` dari status mana pun | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| E-15 | Tiket di RMA terkunci | Tiket klaim `rma_process` → teknisi coba ubah status | Ditolak "sedang diproses RMA" | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |

## Modul F — Serah terima: pickup, kurir, completed, cancel/reject

Setelah `done`, unit hanya boleh keluar lewat dua rantai: ambil sendiri (`ready_for_pickup` → `waiting_pickup` → `completed`) atau kurir khusus PC Build (`handed_to_courier` → `delivered` → `completed`). Setiap serah terima fisik wajib berbukti foto, dan tidak ada status serah terima yang menambah poin.

| ID | Skenario | Langkah | Hasil yang diharapkan | Hasil |
| --- | --- | --- | --- | --- |
| F-01 | Pilih metode ambil sendiri | Pada tiket `done`, set pickup = self pickup | Tersimpan; tombol yang muncul sesuai rantai ambil sendiri | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| F-02 | Kurir untuk non-PC Build | Set pickup = courier pada tiket Service | Ditolak "Courier delivery is only available for PC Build tickets" | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| F-03 | Ready for pickup | Teknisi pindahkan `done` → `ready_for_pickup` | Status berubah, tercatat di Status History, poin tidak bertambah | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| F-04 | Customer diberi tahu | Sales klik "waiting pickup" | Status `waiting_pickup`; tombol WA template "siap diambil" tersedia | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| F-05 | Completed tanpa bukti | `ready_for_pickup` → `completed` tanpa foto | Ditolak "Proof attachment is required" | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| F-06 | Completed dengan bukti | Upload foto serah terima → completed | Status `completed`, foto tersimpan dengan prefix bukti ambil | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| F-07 | Kurir: serah ke kurir | PC Build `done` → `handed_to_courier` dengan foto resi | Berhasil; tanpa foto ditolak | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| F-08 | Kurir: terkirim | Upload bukti terima → `delivered` | Tiket otomatis menjadi `completed` dengan catatan "Auto-completed after delivery confirmation" | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| F-09 | Bukti kurir oleh Sales lain | Sales yang tidak di-assign upload bukti kurir | Ditolak "not assigned" | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| F-10 | Urutan dilompati | `done` → `delivered` atau `waiting` → `completed` lewat request | Ditolak "Cannot move to …" | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| F-11 | Cancel tiket aktif | Teknisi cancel tiket `on_progress` dengan foto bukti | Status `cancelled`, `failed_count` +1, tidak dapat poin | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| F-12 | Admin override status | Admin ubah status tiket sembarang | Berhasil (admin bebas); periksa Status History mencatat siapa yang mengubah | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| F-13 | Admin override pada `rma_process` | Admin ubah status tiket klaim yang sedang di RMA lewat panel tiket | Ditolak; tiket klaim hanya bergerak lewat case RMA | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| F-14 | Kembali dari `done` ke `on_progress` | Admin/Sales mundurkan status lalu Done lagi | Batasan diketahui L-02: poin terhitung dua kali. Catat sebagai konfirmasi, bukan bug baru | ✅ **BL7 belum pernah terjadi** — 0 tiket di 521 tiket punya lebih dari satu log berbayar. Risikonya nyata, dampaknya belum |

## Modul G — PC Build dan Sales

Sales hanya boleh menyentuh tiket yang di-assign kepadanya, dan revisi build baru boleh diunggah setelah teknisi menyelesaikan build pertama. Gunakan tiket PC Build dari C-04.

| ID | Skenario | Langkah | Hasil yang diharapkan | Hasil |
| --- | --- | --- | --- | --- |
| G-01 | Daftar tiket Sales | Sales buka `/sales/tickets` | Tiket yang di-assign ke Sales tampil; tiket Sales lain tidak bisa diubah | ⛔ BLOCKED tanpa browser — seluruh Modul G lewat server action/upload form |
| G-02 | Upload build pertama | Teknisi upload foto build pertama saat Done | `first_build_url` terisi, foto tampil di detail; upload ulang mengganti yang terbaru, yang lama tetap di riwayat lampiran | ⛔ BLOCKED tanpa browser — seluruh Modul G lewat server action/upload form |
| G-03 | Revisi sebelum build selesai | Sales upload revisi saat tiket masih `waiting`/`on_progress` | Ditolak "Cannot upload revision before the technician marks the build as done" | ⛔ BLOCKED tanpa browser — seluruh Modul G lewat server action/upload form |
| G-04 | Upload revisi | Setelah `done`, Sales upload revisi build | `revision_build_url` terisi; Status History mencatat aktivitas tanpa mengubah status | ⛔ BLOCKED tanpa browser — seluruh Modul G lewat server action/upload form |
| G-05 | Revisi oleh Sales lain | Sales yang tidak di-assign upload revisi | Ditolak "not assigned" | ⛔ BLOCKED tanpa browser — seluruh Modul G lewat server action/upload form |
| G-06 | Aksi PC Build pada tipe lain | Panggil upload build untuk tiket Service | Ditolak "only for PC build tickets" | ⛔ BLOCKED tanpa browser — seluruh Modul G lewat server action/upload form |
| G-07 | Upload tanpa file | Submit tanpa memilih file | Ditolak "No file was uploaded" | ⛔ BLOCKED tanpa browser — seluruh Modul G lewat server action/upload form |
| G-08 | Handover PC Build | Ikuti panel handover PC Build sampai kurir/ambil sendiri | Rantai sesuai Modul F; foto build terakhir yang tampil adalah revisi bila ada | ⛔ BLOCKED tanpa browser — seluruh Modul G lewat server action/upload form |
| G-09 | Dashboard Sales | Bandingkan angka di `/sales/dashboard` dengan daftar tiket | Jumlah per status cocok dengan daftar | ⛔ BLOCKED tanpa browser — seluruh Modul G lewat server action/upload form |

## Modul H — Klaim garansi dan RMA

Tiket klaim kini hanya punya satu pintu keluar dari teknisi: serah ke RMA dengan foto kerusakan wajib. Kelayakan diputuskan meja RMA lewat status `ineligible`. Akibatnya seluruh bagian D ("Jalur tidak layak klaim") di `docs/rma-test-checklist.md` tidak berlaku lagi dan digantikan H-20 sampai H-26 di bawah; bagian A, B, C, E, F, G, H checklist lama tetap dijalankan sebagai detail.

**Serah terima teknisi → RMA**

| ID | Skenario | Langkah | Hasil yang diharapkan | Hasil |
| --- | --- | --- | --- | --- |
| H-01 | Hanya klaim `on_progress` | Coba serahkan tiket Service, dan tiket klaim `waiting` | Ditolak dengan pesan tipe / status | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| H-02 | Field wajib form serah | Kosongkan bergantian: kepemilikan unit, SN terverifikasi, kondisi fisik, deskripsi kerusakan, hasil tes | Masing-masing ditolak dengan pesan field-nya | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| H-03 | Foto kerusakan wajib | Submit tanpa foto | Ditolak "Minimal satu foto…" | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| H-04 | Batas dan tipe foto | Upload 6 foto, lalu 1 file `.txt` | Ditolak maks 5 foto; file non-gambar ditolak | ⬜ perlu form. Terkonfirmasi di kode: penyaringan gambar ada di aksi (`rma.ts:168,507,524`), **bukan** di `/api/upload-temp` — endpoint itu menerima tipe apa pun |
| H-05 | Rekomendasi teknisi | Pilih "tidak layak" tanpa catatan | Ditolak, catatan wajib bila rekomendasi tidak layak | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| H-06 | Unit milik customer | Kepemilikan = customer, tanpa nota | Ditolak, nota wajib; nota yang dipilih harus lampiran tiket ini | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| H-07 | Unit stok toko | Kepemilikan = stok toko, tanpa asal stok | Ditolak "Stock origin is required" | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| H-08 | Serah berhasil | Isi lengkap → submit | Case `RMA-NGW-YYMM-0001` terbuat, tiket `rma_process`, poin teknisi +2 | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| H-09 | Serah dua kali | Ulangi serah pada tiket yang sama (dua tab) | Ditolak "already has an RMA case" | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| H-10 | Nomor RMA berurutan | Buat 2 case di store sama, lalu 1 di store lain | Nomor berurutan per store per bulan, tanpa duplikat | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |

**Proses di meja RMA**

| ID | Skenario | Langkah | Hasil yang diharapkan | Hasil |
| --- | --- | --- | --- | --- |
| H-11 | Dashboard RMA | RMA buka `/rma/dashboard` | Case baru tampil di antrean; kartu "perlu perhatian" menghitung dengan benar | ⬜ perlu browser |
| H-12 | Hanya RMA/Admin | Teknisi atau Sales panggil transisi case | Ditolak "Hanya tim RMA dan Administrator…" | ✅ **PASS** — Technician & Sales ditolak `Hanya tim RMA dan Administrator yang dapat mengubah status klaim.`; RMA & Administrator diterima |
| H-13 | Verifikasi unit customer | `pending_verification` → `verified` | Berhasil tanpa nomor pemindahan stok | ✅ **PASS** — unit customer `pending_verification → verified` diterima tanpa nomor pemindahan stok |
| H-14 | Verifikasi unit stok toko | Sama, unit stok toko, tanpa nomor pemindahan stok | Ditolak; diisi → berhasil | ✅ **PASS** — stok toko tanpa nomor → `Nomor pemindahan stok wajib diisi.`; dengan nomor → diterima |
| H-15 | Tahan dan lanjut | → `on_hold` tanpa alasan, lalu dengan alasan; lalu "Verifikasi Ulang" dan "Lanjut Proses Vendor" | Tanpa alasan ditolak. `on_hold` → `in_vendor_process` untuk stok toko tetap meminta nomor pemindahan stok | ✅ **PASS** — `on_hold` menuntut `hold_reason`; `on_hold → in_vendor_process` stok toko tetap menuntut nomor pemindahan stok |
| H-16 | Ajukan ke vendor | `verified` → `submitted_to_vendor` tanpa nama vendor; untuk stok toko tanpa nomor klaim pemasok | Ditolak per field; foto tanda terima hanya bisa dilampirkan di langkah ini | ✅ **PASS** — `Nama vendor wajib diisi.` selalu; `Nomor klaim pemasok wajib diisi.` **hanya** untuk stok toko |
| H-17 | Keputusan vendor | `in_vendor_process` → `vendor_decided`: repaired, replaced (tanpa / dengan SN pengganti), refund, rejected | `replaced` tanpa SN pengganti ditolak; lainnya berhasil | ✅ **PASS** — `replaced` tanpa SN → `Serial number pengganti wajib diisi.`; `repaired` diterima |
| H-18 | Unit kembali dan tutup | → `unit_received` → `closed` | Tiket kembali `done`, poin teknisi **tidak** bertambah lagi | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| H-19 | Transisi ilegal | Lompat `pending_verification` → `closed` lewat request; ubah case yang sudah `closed` | Ditolak "tidak diizinkan" / "tidak dapat diubah lagi" | ✅ **PASS** — `pending_verification → closed` → `tidak diizinkan`; keluar dari `closed` → `Case sudah "closed" dan tidak dapat diubah lagi.` |
| H-27 | Nomor stok tidak diminta ulang | Unit stok toko yang sudah diverifikasi dengan nomor pemindahan → `submitted_to_vendor` → `in_vendor_process` | Perlu dicek: aturan juga berlaku untuk tujuan `in_vendor_process`, pastikan nomor yang tersimpan terbawa dan tidak diminta mengetik ulang | ✅ **PASS — bukan lagi "perlu dicek"**. Nomor pemindahan stok dituntut pada tujuan `verified` **dan** `in_vendor_process` bila stok toko. Sengaja, alasannya di `state-machine.ts:294` |
| H-28 | Edit bersamaan | Dua jendela RMA mengubah case yang sama | Yang kedua menerima "Status sudah diubah user lain" | ⬜ perlu browser |

**Tidak layak klaim oleh RMA (menggantikan bagian D checklist lama)**

| ID | Skenario | Langkah | Hasil yang diharapkan | Hasil |
| --- | --- | --- | --- | --- |
| H-20 | Teknisi tidak bisa menutup klaim | Teknisi coba Done pada klaim `on_progress` | Ditolak, diarahkan untuk serah ke RMA | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| H-21 | Alasan wajib | RMA pilih "Tidak Layak Klaim" dari `pending_verification` tanpa alasan | Ditolak | ✅ **PASS** — `ineligible` tanpa alasan → `Alasan tidak layak klaim wajib diisi.` |
| H-22 | Foto bukti wajib | Isi alasan tanpa foto | Ditolak "Minimal satu foto bukti…" | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| H-23 | Tiga titik asal | Uji `ineligible` dari `pending_verification`, `on_hold`, `verified` | Ketiganya berhasil; dari `submitted_to_vendor` tidak tersedia | ✅ **PASS** — ketiga titik asal sah; dari `submitted_to_vendor` → `tidak diizinkan` |
| H-24 | Efek ke tiket | Setelah `ineligible` | Tiket `done`, `claim_eligible = false` + alasan tersimpan, poin teknisi tetap +2 dari serah terima (tidak bertambah, tidak dikurangi, bukan `failed_count`) | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| H-25 | Pengembalian unit | Lanjutkan tiket lewat rantai Modul F | Berjalan seperti tiket biasa | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| H-26 | Cancel vs ineligible | Satu case dibatalkan (`cancelled`), satu `ineligible` | Hanya `ineligible` yang menandai tidak layak dan memunculkan banner kuning publik | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |

Urutan ID H-27 dan H-28 sengaja diletakkan di tabel proses karena terkait langsung.

## Modul I — Halaman publik, chat, dan WhatsApp

Halaman `/{tanggal}/{kodeTiket}` harus menampilkan progres yang jujur tanpa membocorkan data internal. Prioritaskan I-01 dan I-02: dari kode, halaman dicari **hanya berdasarkan kode tiket** yang berurutan, segmen tanggal tidak divalidasi, dan token chat ikut terkirim ke browser siapa pun yang membuka halaman.

| ID | Skenario | Langkah | Hasil yang diharapkan | Hasil |
| --- | --- | --- | --- | --- |
| I-01 | **Enumerasi tiket** | Buka link publik tiket sendiri, ganti angka kode (`NGW-1234` → `NGW-1235`) dan tanggal sembarang | Seharusnya 404. Bila tiket orang lain terbuka (SN, perangkat, riwayat), catat sebagai bug High | ✅ **PASS — enumerasi tertutup.** 12 kode tiket berurutan terbaru dicoba → **0 terbuka** (semua 404). Diperbaiki di `ca44816`. ⚠️ Ekspektasi dokumen sudah basi, lihat §4 run sheet |
| I-02 | **Chat lewat kode tebakan** | Dari tiket hasil I-01 yang chat-nya aktif, kirim pesan publik | Seharusnya ditolak. Bila berhasil, orang luar bisa menulis ke tiket customer lain | ⬜ perlu server action. Terkonfirmasi di kode: `sendPublicMessageAction(ticketId, shareToken, …)` menuntut **keduanya** |
| I-03 | Kode tidak ada | Buka kode acak yang tidak ada | Halaman 404 rapi | ✅ **PASS** — token dirusak 1 karakter → 404 (6/6 tiket); token acak 48 karakter → 404 |
| I-04 | Timeline status | Bandingkan riwayat publik dengan Status History admin | Urutan dan waktu sama; tidak ada alasan internal (jeda, penolakan) yang tampil | ⬜ perlu browser |
| I-05 | Lampiran publik | Tiket dengan gambar, video, dan PDF | Hanya gambar/video yang tampil; PDF (mis. nota) tidak | ✅ **PASS** — 3 tiket berlampiran PDF diperiksa, **0 dari 7 URL PDF** dirender di halaman publik |
| I-06 | Verdict klaim | Buka halaman publik di tiap tahap: `rma_process`, `closed` (repaired/replaced/refund), vendor rejected, `cancelled`, `ineligible` | Satu kalimat status sesuai tahap; `ineligible` menampilkan banner kuning + alasan | ✅ **PASS** — 11 status menghasilkan label Indonesia yang benar, tidak ada enum mentah (`rma_process` → `Proses Klaim Garansi`) |
| I-07 | Field RMA internal | Isi semua field internal case (nomor RMA vendor, alasan tahan, catatan keputusan, asal stok, nomor pemindahan stok, catatan event) lalu buka halaman publik dan view-source | Tidak ada satu pun yang muncul, termasuk di HTML/payload | ✅ **PASS — 0 kebocoran.** 6 halaman klaim diperiksa terhadap **nilai sungguhan** dari database (bukan nama field): `vendor_rma_number`, `stock_origin`, `recommendation_note`, `fault_description`, 15 `RmaEvent.note`, dll. 2 dugaan awal ternyata **positif palsu** — yang cocok adalah `device_sn` (`123456`/`123123`), field yang memang sengaja ditampilkan. ⚠️ Catatan: `hold_reason` & `decision_notes` **kosong di seluruh data**, jadi keduanya belum benar-benar teruji |
| I-08 | Toggle chat publik | Admin matikan chat → customer kirim pesan | Form chat hilang; request langsung ditolak "Chat is disabled" | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| I-09 | Chat dua arah | Customer kirim pesan publik, teknisi membalas dari portal | Pesan muncul di kedua sisi, penanda dibaca bekerja, notifikasi "message" masuk | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| I-10 | Input berbahaya di chat | Kirim `<script>alert(1)</script>` dan `<img src=x onerror=alert(1)>` | Ditampilkan sebagai teks, tidak dieksekusi | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| I-11 | Tombol bagikan | Klik share di halaman publik | Link yang tersalin sama dengan link yang dibuka | ⬜ perlu browser |
| I-12 | Tombol WhatsApp | Klik tiap template WA dari detail tiket admin/teknisi | Membuka `wa.me` ke nomor customer yang benar, teks template berisi kode tiket dan link publik yang valid | ⬜ perlu browser |
| I-13 | Mobile | Buka halaman publik di ponsel (360 px) | Terbaca tanpa scroll horizontal | ⬜ perlu browser |

## Modul J — Poin, KPI, leaderboard, performance

Poin yang dikreditkan mengikuti `lib/points.ts`, dan diberikan hanya pada saat yang ditentukan `lib/kpi.ts`. Badge "⭐ N pts", leaderboard, dan tiket yang ditutup admin masih memakai tabel berbeda sampai branch `fix/points-table-unification` masuk; selisihnya **jangan dilaporkan sebagai bug baru**, cukup dicatat.

| Tipe tiket | Poin yang dikreditkan | Kapan |
| --- | --- | --- |
| Service | 5 (3 bila `Other_Device`) | saat `done` |
| PC Build | 4 | saat `done` |
| Cleaning | 3 (5 untuk Full Repaste / Full Repaste CPU+GPU) | saat `done` |
| Upgrade | 2 | saat `done` |
| Klaim garansi | 2 | saat serah ke RMA; `done` setelah case ditutup = 0 |
| Semua tipe | 0, tambah `failed_count` | saat `cancelled` / `rejected` |

| ID | Skenario | Langkah | Hasil yang diharapkan | Hasil |
| --- | --- | --- | --- | --- |
| J-01 | Poin per tipe | Selesaikan tiket dari Modul C oleh teknisi | Total poin teknisi = jumlah sesuai tabel di atas | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| J-02 | Serah terima tanpa poin | Bawa tiket sampai `completed` | Poin tidak berubah setelah `done` | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| J-03 | Klaim tidak dobel | Klaim diserahkan lalu case `closed` / `ineligible` | Total +2 sekali saja | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| J-04 | Gagal | Tiket di-cancel dan di-reject | `failed_count` +1 masing-masing, poin tetap | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| J-05 | Tiket ditutup admin | Admin ubah tiket Service ke `done` | Catat angka yang masuk (diketahui berbeda: 4, bukan 5) | ⬜ perlu submit form (server action — tidak bisa dipanggil dari skrip) |
| J-06 | Leaderboard teknisi | Buka leaderboard admin dan teknisi, filter bulan ini | Urutan berdasarkan poin dan success rate; angka kedua halaman sama | ⬜ perlu browser. ⚠️ Terkuantifikasi: **37 kombinasi** tipe×perangkat×paket memberi angka berbeda antara `lib/points.ts` (dikreditkan) dan `lib/leaderboard.ts` (ditampilkan). BL3 |
| J-07 | Team vs Team | Teknisi di dua store menyelesaikan tiket | Agregat per store sama dengan jumlah poin teknisinya | ⬜ perlu browser |
| J-08 | Tiket bulan lalu tetap terhitung | Tiket selesai bulan lalu lalu `completed` bulan ini | Tetap terhitung di bulan ia `done` (dihitung dari Status History) | ⬜ perlu browser |
| J-09 | Admin → Performance | Buka bulan berjalan, ekspor PDF, bagikan | Angka cocok dengan J-01; PDF terbuka; "Warranty Claim" dan "Warranty Claim Ineligible" terpisah | ⬜ perlu browser |
| J-10 | Durasi rata-rata | Ada klaim di `rma_process` | Batasan diketahui L-01: klaim itu belum masuk tabel durasi | ⬜ perlu browser |
| J-11 | Snapshot leaderboard | Admin ambil snapshot bulan | Snapshot tersimpan; pemenang bulanan mendapat title (dicek di Modul K) | ⬜ perlu browser |
| J-12 | Laporan klaim | Hitung manual: diterima, tidak layak, diajukan, berhasil, ditolak vendor, dibatalkan | Angka laporan sama dengan definisi di `FLOW.md` §5; klaim ditolak tidak terhitung sukses | ⬜ perlu browser |
