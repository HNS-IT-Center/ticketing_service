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

Fase 1–5 sudah selesai. **Fase 6 belum dikerjakan.** Test case berikut menguji fitur
yang belum ada, jadi **LEWATI** — kegagalannya bukan bug:

| Test case | Kenapa dilewati |
|---|---|
| **D-05** | Label hasil klaim di halaman publik belum dibuat |
| **G-01, G-02, G-03** | Seluruh penyesuaian halaman publik belum dibuat. Halaman tracking belum mengenal status `rma_process` sama sekali, sehingga timeline akan tampak kosong untuk tiket yang sedang di RMA |
| **H-05** | Aturan KPI anti-double-count belum diterapkan di `lib/leaderboard.ts` dan `lib/performance.ts`. Poin klaim masih dihitung dengan cara lama |

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

**Tidak termasuk:** mutasi stok gudang, approval kepala toko/gudang, integrasi WhatsApp, portal customer (nonaktif), halaman publik (Fase 6).

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
| C-09 | Tiket terkunci | Coba ubah status tiket `rma_process` dari panel teknisi | Tidak bisa; bila ada kontrol tersisa, server menolak | | |
| C-10 | Handover ganda | Buka ulang tiket yang sudah diserahkan | Tombol "Serahkan ke RMA" tidak tersedia lagi | | |
| C-11 | Nota tiket lain ditolak | (opsional, perlu devtools) Ganti URL nota ke lampiran tiket lain → submit | Ditolak, nota bukan lampiran tiket ini | | |

### D. Jalur tidak layak klaim

| ID | Skenario | Langkah | Hasil yang diharapkan | Hasil | Bukti |
|---|---|---|---|---|---|
| D-01 | Alasan wajib | "Tidak layak klaim" → alasan kosong → submit | Ditolak, status tidak berubah | | |
| D-02 | Penandaan berhasil | Isi alasan → submit | Status jadi `done`, tiket ditandai tidak layak klaim beserta alasannya | | |
| D-03 | Unit bisa dikembalikan | `done` → `ready_for_pickup` atau `handed_to_courier` → `completed` | Alur pengembalian normal seperti tiket biasa | | |
| D-04 | Tidak masuk antrean RMA | Login RMA → dashboard | Tiket ini tidak muncul | | |
| D-05 | ~~Tampilan publik jujur~~ | **LEWATI — Fase 6** | — | SKIP | — |

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

### G. Halaman publik — **SELURUHNYA LEWATI, FASE 6**

| ID | Skenario | Hasil | Bukti |
|---|---|---|---|
| G-01 | ~~Tracking saat di RMA~~ | SKIP | — |
| G-02 | ~~Data internal tidak bocor~~ | SKIP | — |
| G-03 | ~~Tiga hasil akhir berbeda~~ | SKIP | — |

### H. Regresi tipe tiket lain

| ID | Skenario | Langkah | Hasil yang diharapkan | Hasil | Bukti |
|---|---|---|---|---|---|
| H-01 | Tiket service | Buat → ambil → done → ready_for_pickup → completed | Seluruh alur normal | | |
| H-02 | Tiket cleaning | Idem | Normal | | |
| H-03 | Tiket PC build | Idem | Normal | | |
| H-04 | Cancel tiket | Batalkan tiket non-klaim dengan alasan | Normal | | |
| H-05 | ~~Leaderboard~~ | **LEWATI — Fase 6** | — | SKIP | — |
| H-06 | Detail tiket lama | Buka tiket non-klaim di portal admin, teknisi, sales | Tidak error meski tiket tidak punya case RMA | | |
| H-07 | Login role lain | Login admin, teknisi, sales bergantian | Semua mendarat di dashboard masing-masing, tidak ada redirect loop | | |

---

## 7. Kriteria lulus

- Seluruh test case bagian A sampai F berstatus PASS (kecuali yang ditandai SKIP).
- Tidak ada bug severity **Critical** atau **High** yang masih terbuka.
- Bagian H (regresi) seluruhnya PASS — syarat mutlak, karena tipe tiket lain sedang dipakai di produksi.
- Tidak ada error di terminal dev server selama pengujian.

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
