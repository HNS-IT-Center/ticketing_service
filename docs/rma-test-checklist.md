# QC Test Plan — Alur Tiket Klaim (Warranty Claim) & RMA

| Item | Keterangan |
|---|---|
| Fitur | Alur tiket klaim garansi sampai keputusan RMA |
| Branch | `feat/rma-warranty-claim` |
| Lingkungan uji | Lokal — Next.js dev server + PostgreSQL container `hns-ticketing-pg` (127.0.0.1:5433) |
| Basis data | Database lokal kosong + seed. **Dilarang menguji terhadap Supabase produksi.** |
| Tanggal uji | ............................... |
| Penguji | ............................... |
| Build / commit | ............................... |

---

## ⚠️ STATUS IMPLEMENTASI — BACA SEBELUM MULAI

**Tidak ada lagi test case yang dilewati.** Fase 6 sudah dikerjakan: halaman publik mengenal
`rma_process` dan membedakan ketiga hasil akhir klaim, dan aturan KPI anti-double-count sudah
berlaku di seluruh jalur poin.

Satu perubahan angka yang perlu diketahui penguji sebelum membandingkan dengan catatan lama:

- Tiket yang sudah diambil customer tidak lagi hilang dari perhitungan bulanannya. Leaderboard
  dan winner bulanan sekarang dihitung dari `TicketStatusLog`, bukan dari status tiket saat
  ini, jadi tiket yang sudah `completed` tetap terhitung di bulan ia selesai.

**Besaran poin per tiket TIDAK diubah di branch ini.** Angka yang tampil di badge, leaderboard
dan laporan performance tetap seperti sebelumnya. Penyatuan tabel poin — yang memang akan
menggeser angka cleaning dan service `Other_Device` — ada di branch terpisah
`fix/points-table-unification` dan belum masuk.

### Batasan yang sudah diketahui — JANGAN dilaporkan sebagai bug

Tiga hal di bawah ini sudah diperiksa dan sengaja dibiarkan. Kalau penguji menemukannya,
catat di bagian 10 (Catatan penguji) sebagai konfirmasi, bukan sebagai laporan bug.

| # | Batasan | Kenapa dibiarkan |
|---|---|---|
| L-01 | **Laporan rata-rata durasi di Admin → Performance melewatkan klaim yang sedang di `rma_process`.** Kolom "rata-rata waktu pengerjaan" per kategori dihitung dari tiket yang status-nya sudah `done` ke atas, jadi tiket klaim yang masih di tangan RMA belum ikut terhitung — padahal poinnya sudah masuk sejak handover. Akibatnya jumlah tiket di tabel durasi bisa lebih kecil daripada jumlah tiket di kolom poin | Laporan itu mengukur **lama kerja teknisi**, bukan kredit poin. Untuk klaim, waktu kerja memang belum final selama unit masih di vendor. Menyamakannya dengan aturan poin akan mencampur dua hal berbeda — keputusan terpisah, bukan bagian dari Fase 6 |
| L-02 | **Tiket yang dikembalikan ke `on_progress` lalu di-`done` lagi dihitung dua kali.** Admin/Sales bisa mengubah status tiket ke status mana pun tanpa batasan urutan, termasuk dari `done` kembali ke `on_progress`. Setiap `done` menulis satu baris log, jadi poin dan `tickets_handled` bertambah untuk kedua kalinya | Bug lama, ada jauh sebelum fitur klaim, dan memperbaikinya berarti memasang guard transisi umum di `adminUpdateTicketStatusAction` yang mengubah perilaku semua tipe tiket yang sedang dipakai di produksi. Sudah disiapkan sebagai issue terpisah (`docs/issue-transition-guard.md`). **Pengecualian:** tiket `rma_process` SUDAH dikunci di branch ini — itu bukan batasan, melainkan test case C-09a–C-09c |
| L-03 | **Angka `TechnicianPerformance` lama tidak dikoreksi.** Teknisi yang tiketnya pernah ditutup admin lewat `completed` sebelum perbaikan ini masih membawa poin dan `tickets_handled` yang terlanjur terhitung ganda | Disepakati dengan pemilik: data historis tidak disentuh. Yang diperbaiki hanya perhitungan ke depan |

**Cara menguji L-01 secara sadar (opsional).** Serahkan satu tiket klaim ke RMA, lalu buka
Admin → Performance untuk bulan berjalan. Poin teknisi sudah naik 2, tetapi tiket itu belum
muncul di rincian durasi per kategori. Itu perilaku yang diharapkan.

---

Dua ekspektasi yang perlu dikoreksi sebelum diuji:

| Test case | Tertulis di draft | Perilaku sebenarnya |
|---|---|---|
| **E-04** | RMA buka `/admin/dashboard` → "diarahkan ke halaman unauthorized" | Diarahkan ke **`/rma/dashboard`** (dashboard role-nya sendiri). `/unauthorized` hanya untuk role yang ditolak sepenuhnya, mis. Customer |
| **A-01** | "tombol submit aktif" | Sejak `9df1897` jenis kasus **tidak lagi terpilih otomatis**. Tester wajib mengklik chip "Warranty Claim" di bawah label "Jenis Kasus *". Form menolak lanjut bila belum dipilih — itu benar, bukan bug |

---

## 1. Tujuan

Memastikan tiket bertipe `warranty_claim` hanya bisa keluar dari status `on_progress` melalui dua jalur sah (diserahkan ke RMA, atau dinyatakan tidak layak dengan alasan), bahwa proses RMA mengikuti urutan status yang ditentukan, dan bahwa tipe tiket lain tidak terpengaruh sama sekali.

## 2. Ruang lingkup

**Termasuk:** pembuatan tiket klaim, pemeriksaan teknisi, serah terima ke RMA, verifikasi RMA, pengajuan ke vendor, keputusan vendor, penutupan case, pengembalian unit ke customer, hak akses per role.

**Tidak termasuk:** mutasi stok gudang, approval kepala toko/gudang, integrasi WhatsApp, portal customer (nonaktif).

## 3. Akun uji

| Role | Email | Password | Catatan |
|---|---|---|---|
| Administrator | `admin@techserve.id` | `admin123` | dari seed |
| Teknisi | `budi@techserve.id` | `tech123` | dari seed (juga `siti@`, `agus@`) |
| RMA | `rma@techserve.id` | `rma123` | dari seed |
| Sales / CS | `sales@techserve.id` | `sales123` | dari seed |

Gunakan dua jendela browser (normal + incognito) agar bisa login sebagai dua role sekaligus.

## 4. Prasyarat

1. `docker start hns-ticketing-pg` — container berjalan.
2. `npm run dev` berjalan tanpa error.
3. Terminal dev server terlihat selama pengujian (pesan error server muncul di sini, bukan di browser).
4. Tersedia satu file gambar/PDF kecil sebagai nota pembelian.
5. **`STORAGE_DRIVER=local` ada di `.env.local`.** Tanpa ini setiap upload gagal dengan error TLS, karena kredensial R2 tidak tersedia di lokal.
6. Minimal ada satu Store Location. Bila belum: login admin → Stores → Create. Teknisi penguji harus di-assign ke store itu agar tiket muncul di dashboard-nya.

## 5. Ringkasan status

**Status tiket:** `waiting` → `on_progress` → (`rma_process` | `done`) → `ready_for_pickup` / `handed_to_courier` → `completed`

**Status RMA:** `pending_verification` → `verified` → `submitted_to_vendor` → `in_vendor_process` → `vendor_decided` → `unit_received` → `closed`, dengan `on_hold` dan `cancelled` sebagai cabang.

---

## 6. Test case

Kolom **Hasil** diisi PASS / FAIL. Kolom **Bukti** diisi nama file screenshot.

### A. Pembuatan tiket klaim

| ID | Skenario | Langkah | Hasil yang diharapkan | Hasil | Bukti |
|---|---|---|---|---|---|
| A-01 | Tipe klaim sudah aktif | Login teknisi → buat tiket → pilih perangkat Laptop → klik chip "Warranty Claim" | Chip tersedia di bawah label "Jenis Kasus *", tidak ada "Coming Soon", field klaim muncul setelah dipilih | | |
| A-02 | SN wajib | Isi semua field kecuali SN → submit | Ditolak, error menunjuk field SN, tiket tidak terbuat | | |
| A-03 | Tanggal beli wajib | Isi semua field kecuali tanggal pembelian → submit | Ditolak, error menunjuk tanggal pembelian | | |
| A-04 | Pembuatan berhasil | Isi lengkap + upload nota → submit | Tiket terbuat, tipe klaim, nota tersimpan sebagai attachment | | |
| A-05 | Nota opsional saat intake | Isi lengkap tanpa upload nota → submit | Tiket tetap terbuat (nota baru wajib saat handover) | | |
| A-06 | Tipe lain tidak berubah | Buat tiket tipe Service seperti biasa | Tidak ada field klaim, alur normal | | |
| A-07 | Form Sales/CS | Login Sales → buat tiket klaim | Form klaim sama tersedia, validasi sama berlaku | | |
| A-08 | Jenis kasus wajib dipilih | Pilih perangkat → langsung Next tanpa memilih chip | Ditolak, "Please select a case" | | |

### B. Pemeriksaan teknisi

| ID | Skenario | Langkah | Hasil yang diharapkan | Hasil | Bukti |
|---|---|---|---|---|---|
| B-01 | Ambil tiket | Teknisi ambil tiket klaim | Status jadi `on_progress` | | |
| B-02 | Tombol khusus klaim | Lihat panel status tiket klaim `on_progress` | Ada "Serahkan ke RMA" dan "Tidak layak klaim". "Mark Done" **tidak ada** | | |
| B-03 | Tombol Pause tetap | Lihat panel yang sama | Pause masih berfungsi seperti biasa | | |
| B-04 | Tipe lain tidak berubah | Buka tiket Service `on_progress` | "Mark Done" tetap ada seperti sebelumnya | | |
| B-05 | Tiket Paused | Pause tiket klaim, lihat panel | Hanya "Resume Work". Tombol RMA kembali setelah Resume (perilaku lama, berlaku semua tipe) | | |

### C. Serah terima ke RMA

| ID | Skenario | Langkah | Hasil yang diharapkan | Hasil | Bukti |
|---|---|---|---|---|---|
| C-01 | Service Form muncul | Klik "Serahkan ke RMA" | Modal berisi kepemilikan unit, asal stok / nota, SN terverifikasi, kondisi fisik, deskripsi kerusakan, hasil tes | | |
| C-02 | SN belum diverifikasi | Jangan centang "SN terverifikasi" → submit | Ditolak dengan pesan jelas, case tidak terbuat | | |
| C-03 | Unit customer tanpa nota | Kepemilikan Customer, tidak pilih nota → submit | Ditolak, case tidak terbuat | | |
| C-04 | Nota dari attachment | Kepemilikan Customer → pilih nota dari intake | Bisa dipilih tanpa upload ulang | | |
| C-05 | Stok toko tanpa asal stok | Kepemilikan Stok Toko, asal stok kosong → submit | Ditolak, case tidak terbuat | | |
| C-06 | Handover berhasil | Isi lengkap → submit | Case terbuat dengan kode `RMA-...`, status tiket jadi `rma_process` | | |
| C-07 | Format kode RMA | Lihat kode yang terbentuk | `RMA-{KODETOKO}-{YYMM}-{0001}`, urut per toko per bulan | | |
| C-08 | Kartu RMA di detail tiket | Buka detail tiket sebagai teknisi | Kartu status RMA tampil: kode, status, timeline | | |
| C-09 | Tiket terkunci dari portal teknisi | Coba ubah status tiket `rma_process` dari panel teknisi | Tidak bisa; bila ada kontrol tersisa, server menolak dengan pesan "Tiket ini sedang diproses RMA…" | | |
| C-09a | **Tiket terkunci dari portal admin** | Login admin → buka tiket yang sedang `rma_process` → coba ubah statusnya (coba beberapa target: `done`, `cancelled`, `completed`, `on_progress`) | **Semua ditolak** dengan pesan "Tiket ini sedang diproses RMA…". Status tiket tetap `rma_process`, tidak ada baris baru di Status History, dan customer tidak menerima notifikasi | | |
| C-09b | Sales juga terkunci | Ulangi C-09a sebagai Sales | Ditolak dengan pesan yang sama | | |
| C-09c | Jalur pembatalan yang sah tetap jalan | Login RMA → buka case-nya → batalkan case (`cancelled`) | Case tertutup dan **server sendiri** yang mengembalikan tiket ke `done`. Setelah itu admin dan teknisi bisa mengubah status seperti biasa | | |
| C-10 | Handover ganda | Buka ulang tiket yang sudah diserahkan | Tombol "Serahkan ke RMA" tidak tersedia lagi | | |
| C-11 | Nota tiket lain ditolak | (opsional, perlu devtools) Ganti URL nota ke lampiran tiket lain → submit | Ditolak, nota bukan lampiran tiket ini | | |

### D. Jalur tidak layak klaim

| ID | Skenario | Langkah | Hasil yang diharapkan | Hasil | Bukti |
|---|---|---|---|---|---|
| D-01 | Alasan wajib | "Tidak layak klaim" → alasan kosong → submit | Ditolak, status tidak berubah | | |
| D-02 | Penandaan berhasil | Isi alasan → submit | Status jadi `done`, tiket ditandai tidak layak klaim beserta alasannya | | |
| D-03 | Unit bisa dikembalikan | `done` → `ready_for_pickup` atau `handed_to_courier` → `completed` | Alur pengembalian normal seperti tiket biasa | | |
| D-04 | Tidak masuk antrean RMA | Login RMA → dashboard | Tiket ini tidak muncul | | |
| D-06 | **Admin juga wajib memberi alasan** | Login admin → buka tiket klaim `on_progress` → tombolnya berbunyi "Tidak Layak Klaim", bukan "Mark Done" → klik → kosongkan alasan → submit | Tombol submit nonaktif selama alasan kosong. Kalau dipaksa lewat server, ditolak dengan pesan "Untuk tiket klaim, isi alasan…". Status tetap `on_progress`, tidak ada baris Status History baru | | |
| D-07 | Penandaan oleh admin berhasil | Isi alasan → submit | Status jadi `done`, tiket ditandai tidak layak beserta alasannya, dan alasan itu tercatat di Status History | | |
| D-08 | Sales juga terikat | Ulangi D-06 sebagai Sales | Ditolak dengan pesan yang sama | | |
| D-09 | Hasilnya identik dengan jalur teknisi | Bandingkan tiket dari D-07 dengan tiket dari D-02 (ditandai teknisi) | Keduanya `claim_eligible = false` dengan alasan tersimpan, dan halaman publiknya menampilkan banner kuning yang sama | | |
| D-10 | Tipe lain tidak terpengaruh | Sebagai admin, tutup tiket Service `on_progress` jadi `done` | Tetap bisa tanpa alasan, seperti sebelumnya | | |
| D-05 | Tampilan publik jujur | Buka halaman publik tiket ini (`/{tanggal}/{kode}`) | Banner kuning "Klaim tidak memenuhi syarat garansi" beserta alasan teknisi. Tidak tertulis "Selesai Dikerjakan" saja | | |

### E. Akses & navigasi portal RMA

| ID | Skenario | Langkah | Hasil yang diharapkan | Hasil | Bukti |
|---|---|---|---|---|---|
| E-01 | Login RMA | Login `rma@techserve.id` | Berhasil, diarahkan ke `/rma/dashboard` | | |
| E-02 | Tidak ada redirect loop | Perhatikan proses login | Tidak ada ERR_TOO_MANY_REDIRECTS | | |
| E-03 | Buka `/login` saat sudah login | Ketik `/login` di address bar | Diarahkan ke `/rma/dashboard`, tidak memantul | | |
| E-04 | Akses lintas portal ditolak | Sebagai RMA buka `/admin/dashboard` | Diarahkan kembali ke **`/rma/dashboard`** | | |
| E-05 | Unauthorized punya jalan keluar | Buka `/unauthorized` | Tampil untuk role apa pun, ada tombol Sign Out yang berfungsi | | |
| E-06 | Teknisi ditolak portal RMA | Login teknisi → `/rma/dashboard` | Ditolak, diarahkan ke `/technician/dashboard` | | |
| E-07 | Admin bisa masuk | Login admin → nav "RMA" | Portal RMA terbuka | | |
| E-08 | Menu profil disembunyikan | Dropdown profil sebagai RMA | Profile dan My Tickets tidak muncul. `/rma/profile` diketik langsung → 404 biasa | | |
| E-09 | Notifikasi handover | Setelah C-06, cek lonceng akun RMA | Ada notifikasi case baru; diklik membuka case yang benar | | |
| E-10 | Buat user RMA baru | Admin → buat user role RMA → login | Akun terbuat dan bisa masuk portal RMA | | |
| E-11 | RMA bisa buat tiket | Login RMA → nav "Create Ticket" | Form terbuka dan berfungsi | | |

### F. Proses RMA sampai tutup

| ID | Skenario | Langkah | Hasil yang diharapkan | Hasil | Bukti |
|---|---|---|---|---|---|
| F-01 | Dashboard | Buka dashboard RMA | Kartu ringkasan tampil; `pending_verification` dan `on_hold` di urutan atas antrean | | |
| F-02 | Tombol sesuai status | Buka case `pending_verification` | Hanya tombol sah yang muncul (verifikasi, on hold, batal) | | |
| F-03 | On hold butuh alasan | Pilih on hold tanpa alasan | Ditolak | | |
| F-04 | On hold dan kembali | On hold dengan alasan → kembali ke verifikasi | Status berpindah, kedua langkah tercatat di timeline | | |
| F-05 | Verifikasi | Pilih verified | Status jadi `verified` | | |
| F-06 | Vendor wajib diisi | Ajukan ke vendor tanpa nama vendor / nomor RMA | Ditolak | | |
| F-07 | Pengajuan vendor | Isi nama vendor, nomor RMA vendor, resi | Status `submitted_to_vendor`, data tersimpan | | |
| F-08 | Proses vendor | Lanjut ke `in_vendor_process` | Status berpindah; "hari di vendor" mulai terhitung di dashboard | | |
| F-09 | Replace wajib SN pengganti | Keputusan `replaced` tanpa SN pengganti | Ditolak | | |
| F-10 | Keputusan vendor | `replaced` + SN pengganti | Status `vendor_decided`, keputusan tersimpan | | |
| F-11 | Unit diterima | Lanjut ke `unit_received` | Status berpindah | | |
| F-12 | Tutup case | Lanjut ke `closed` | Case tertutup, status tiket kembali ke `done` | | |
| F-13 | Timeline lengkap | Lihat timeline case | Seluruh perpindahan tercatat dengan pelaku dan waktu | | |
| F-14 | Lanjutan pengembalian | Login teknisi → tiket tadi → `ready_for_pickup` → `completed` | Alur handover normal | | |
| F-15 | Keputusan ditolak vendor | Ulangi dengan keputusan `rejected` | Case tetap bisa ditutup dan unit dikembalikan | | |
| F-16 | Case tertutup terkunci | Buka case `closed` | Panel aksi menyatakan case sudah ditutup, tidak ada tombol | | |
| F-17 | Timeline dashboard | Lihat "Aktivitas Terbaru" di dashboard RMA | Perpindahan terakhir dari semua case tampil, tiap baris menuju case yang benar | | |
| F-18 | Preview nota | Detail case → "Lihat Nota Pembelian" | Terbuka di modal, bukan tab baru; ada opsi Unduh dan Buka di Tab Baru | | |

### G. Halaman publik

Halaman publik dibuka tanpa login di `/{tanggal}/{kode-tiket}` — tombol Share di detail tiket
menyalin URL-nya. Uji di jendela incognito supaya benar-benar tanpa session.

| ID | Skenario | Langkah | Hasil yang diharapkan | Hasil | Bukti |
|---|---|---|---|---|---|
| G-01 | Tracking saat di RMA | Buka halaman publik tiket ber-status `rma_process` | Timeline TIDAK kosong; langkah terakhir berbunyi "Proses Klaim Garansi", bukan "rma process". Banner biru sesuai tahap case: `pending_verification`/`on_hold`/`verified` → "Klaim sedang diverifikasi"; `submitted_to_vendor`/`in_vendor_process` → "Klaim sedang diproses vendor"; `vendor_decided`/`unit_received` → "Keputusan vendor sudah keluar" | | |
| G-02 | Data internal tidak bocor | Di halaman yang sama, tekan Ctrl+U (view source) lalu cari nomor RMA vendor, alasan on hold, catatan keputusan, asal stok, dan isi catatan timeline case | Tidak satu pun muncul — termasuk di HTML mentah, bukan hanya di tampilan | | |
| G-03 | Tiga hasil akhir berbeda | Buka halaman publik dari tiga tiket: (a) tidak layak klaim, (b) case ditutup dengan keputusan `rejected`, (c) case ditutup dengan `repaired`/`replaced`/`refund` | Tiga banner berbeda: "Klaim tidak memenuhi syarat garansi" (kuning) / "Klaim ditolak vendor" (kuning) / "Unit diperbaiki oleh vendor" — "Unit diganti oleh vendor" — "Dana dikembalikan" (hijau). Ketiganya sama-sama ber-status `completed`, jadi banner-lah satu-satunya pembeda | | |
| G-04 | Keputusan belum diumumkan | Buka halaman publik case ber-status `vendor_decided` dengan keputusan `rejected` | Hanya "Keputusan vendor sudah keluar". Isi keputusan belum dibocorkan selama unit masih di vendor | | |
| G-05 | Case dibatalkan | Batalkan sebuah case (`cancelled`), buka halaman publiknya | "Proses klaim dihentikan" (abu-abu), bukan "Klaim ditolak vendor". Alasan pembatalan tidak tampil | | |
| G-06 | Tiket non-klaim | Buka halaman publik tiket Service yang sudah `completed` | Tidak ada banner klaim sama sekali. Label timeline berbahasa Indonesia ("Selesai Dikerjakan", "Siap Diambil"), bukan enum mentah | | |

### H. Regresi tipe tiket lain

| ID | Skenario | Langkah | Hasil yang diharapkan | Hasil | Bukti |
|---|---|---|---|---|---|
| H-01 | Tiket service | Buat → ambil → done → ready_for_pickup → completed | Seluruh alur normal | | |
| H-02 | Tiket cleaning | Idem | Normal | | |
| H-03 | Tiket PC build | Idem | Normal | | |
| H-04 | Cancel tiket | Batalkan tiket non-klaim dengan alasan | Normal | | |
| H-05 | Leaderboard tidak menghitung klaim dua kali | Catat poin teknisi di leaderboard → serahkan satu tiket klaim ke RMA → catat lagi → proses case sampai `closed` → catat lagi | Poin naik 2 saat handover. Saat case ditutup (tiket balik ke `done`) poin **tidak** naik lagi | | |
| H-05b | Klaim tidak layak tidak menambah apa pun | Tutup satu tiket klaim lewat "Tidak layak klaim" → buka profil teknisi | `success_count` dan `failed_count` sama-sama tidak berubah; poin tidak bertambah | | |
| H-05c | Admin menutup tiket tidak menambah kredit kedua | Sebagai admin, ubah tiket non-klaim dari `ready_for_pickup` ke `completed` → buka profil teknisi | `tickets_handled` dan poin **tidak** bertambah (dulu bertambah untuk kedua kalinya) | | |
| H-06 | Detail tiket lama | Buka tiket non-klaim di portal admin, teknisi, sales | Tidak error meski tiket tidak punya case RMA | | |
| H-07 | Login role lain | Login admin, teknisi, sales bergantian | Semua mendarat di dashboard masing-masing, tidak ada redirect loop | | |

---

## 7. Kriteria lulus

- Seluruh test case bagian A sampai G berstatus PASS. Tidak ada lagi yang ditandai SKIP.
- Tidak ada bug severity **Critical** atau **High** yang masih terbuka.
- Bagian H (regresi) seluruhnya PASS — syarat mutlak, karena tipe tiket lain sedang dipakai di produksi.
- Tidak ada error di terminal dev server selama pengujian.
- **L-01, L-02 dan L-03 tidak memblokir kelulusan.** Ketiganya batasan yang sudah diketahui
  dan disetujui — lihat "Batasan yang sudah diketahui" di bagian atas dokumen.

## 8. Klasifikasi severity

| Severity | Definisi | Contoh |
|---|---|---|
| Critical | Data rusak/hilang, atau alur produksi yang ada berhenti | Tiket service tidak bisa diselesaikan |
| High | Fitur utama tidak jalan, atau kontrol akses bisa ditembus | Teknisi bisa membuka portal RMA |
| Medium | Fitur jalan tapi ada perilaku salah dengan workaround | Timeline tidak menampilkan satu event |
| Low | Kosmetik, teks, penyelarasan | Label salah ketik |

## 9. Format laporan bug

```
ID          : BUG-01
Test case   : C-03
Severity    : High
Ringkasan   : Handover berhasil meski unit customer tanpa nota
Langkah     :
  1. ...
  2. ...
Diharapkan  : Ditolak, case tidak terbuat
Hasil aktual: Case terbuat dengan purchase_invoice_url kosong
Error terminal (jika ada):
  ...
Lampiran    : screenshot-bug-01.png
```

## 10. Catatan penguji

...............................................................................

...............................................................................
