# Titik Mulai QC — kondisi sistem per 2026-10-01

Ditulis sebelum QC dijalankan, supaya penguji tahu apa yang sudah terbukti, apa yang belum,
dan mana temuan yang **bukan** bug.

---

## Kondisi sistem

| | |
|---|---|
| Produksi | `ticketing.hnsitcenter.id`, **MariaDB 11.8.9** di Hostinger |
| Kode | `main` = `deploy` = `ca44816` |
| Data | 16 user · 512 tiket · 2.485 log status · 1.390 lampiran — identik dengan Supabase |
| Test | **557 lulus**, `tsc` bersih |
| Supabase | masih utuh, hanya dibaca sepanjang cutover. **Jangan dihapus dulu** |
| Cadangan | `Documents/Project/pre-cutover-2026-10-01-1032.dump` |

---

## ⚠️ Yang BUKAN bug — jangan dilaporkan

Perilaku di bawah ini berubah **dengan sengaja**. Melaporkannya sebagai bug akan membuang
waktu, dan lebih buruk: "memperbaikinya" akan merusak sesuatu.

| Yang terlihat | Kenapa begitu |
|---|---|
| **Lonceng notifikasi telat sampai 30 detik** | Supabase Realtime membaca WAL PostgreSQL. Databasenya MariaDB, jadi tidak ada yang bisa dibaca. Polling 30 detik adalah penggantinya. `AGENTS.md` aturan #9 |
| **Angka poin berbeda antar halaman** | Halaman RMA memakai `lib/points.ts` (tabel yang benar-benar dikreditkan); halaman teknisi dan sales memakai salinannya sendiri. Cleaning 3/5 di satu tempat, 2/4 di tempat lain. Itu **BL3**, belum dikerjakan |
| **Tombol Manage kosong (—) di daftar RMA** | Tiket tanpa `RmaCase` tidak punya halaman di portal RMA. Menawarkan tautan hanya akan 404 |
| **Daftar RMA tidak menampilkan semua klaim** | Klaim yang dituntaskan teknisi tanpa pernah lewat RMA sengaja disembunyikan |
| **URL halaman publik berisi token panjang, bukan kode tiket** | Kode berurutan tanpa celah, jadi URL berbasis kode bisa ditelusuri satu per satu. Kode tiket tetap **tercetak di halamannya** |
| **`/{tanggal}/{kode-tiket}` menjawab 404** | Benar. Sekarang hanya token yang membuka halaman |
| **Email tidak terkirim** | Tier gratis Resend hanya mengirim ke alamat terdaftar di akun Resend |

---

## Yang BELUM pernah diuji manusia

Seluruh verifikasi cutover memakai sesi yang ditandatangani dari skrip, bukan login
sungguhan. Empat hal ini **belum terbukti sama sekali** dan layak jadi urutan pertama QC:

1. **Login dengan password asli staf.** Hash bcrypt ikut termigrasi, tapi tidak ada yang
   pernah benar-benar mengetik password. Kalau ini gagal, semua yang lain tidak relevan
2. **Unggah foto.** Satu-satunya yang menguji R2. Belum pernah dijalankan sejak cutover —
   tidak di intake, tidak di handover, tidak di penolakan klaim
3. **Membuat tiket baru.** Kodenya harus lanjut dari NGW-000372, dan ada riwayat bug tabrakan
   kode di fungsi itu (`fix/ticket-code-collision`)
4. **Alur klaim penuh:** intake → ambil teknisi → handover ke RMA → verifikasi → vendor → tutup

### Prasyarat

**Akun RMA belum ada.** `rmahnsitcenter@gmail.com` terhapus bersama data percobaan saat
cutover. Harus dibuat ulang lewat SSH tunnel sebelum bagian RMA bisa diuji sama sekali:

```bash
# terminal 1
ssh -p 65002 -N -L 3309:127.0.0.1:3306 <SSH_USER>@<SSH_HOST>

# terminal 2
DATABASE_URL="mysql://<DB_USER>:<PASSWORD>@127.0.0.1:3309/<DB_NAME>" npm run create-user
```

---

## ⛔ `QC Flow — HNS IT Center Ticketing Service + RMA.md` — empat asumsi yang sudah basi

Dokumen itu disusun dari commit `e8a71e2` (30 Sep). `main` sekarang `ca44816`, dan empat
prasyaratnya tidak lagi berlaku. Dua di antaranya menghentikan QC di langkah nol.

### 1. ⛔ Lima dari enam akun uji tidak ada

Database lokal berisi **salinan produksi** (18 user, 521 tiket), bukan data seed:

| Akun | Status |
|---|---|
| `admin@techserve.id` | ✅ ada (Administrator, aktif) |
| `budi@` · `siti@` · `agus@` · `sales@` · `rma@techserve.id` | ❌ **tidak ada** |

Prasyarat #2 dokumen itu ("database direset lalu di-seed") memang akan membuatnya. Tapi:

### 2. ⛔ `npm run seed` belum pernah dijalankan terhadap MariaDB

Adapternya sudah diport, eksekusinya belum pernah diuji. Kalau gagal, QC berakhir dengan
database kosong. **Uji seed sebelum mereset apa pun.**

### 3. Database lokal bukan PostgreSQL lagi

Dokumen menyebut container `hns-ticketing-pg` dan PostgreSQL. Yang benar:

```
hns-ticketing-mariadb   port 3310   MariaDB 11.8.9
DATABASE_URL="mysql://root:devpass@127.0.0.1:3310/ticketing"
```

`hns-ticketing-pg` masih ada tapi isinya database lama; menguji ke sana tidak menguji apa pun
yang sekarang berjalan.

### 4. Tidak ada "staging VPS"

Rencana menyebut smoke test rilis di staging VPS. Yang ada: produksi di **hPanel Node.js Web
Apps**, dan tidak ada lingkungan kedua. Smoke test rilis berarti menguji produksi langsung,
atau membuat aplikasi kedua lebih dulu.

### Modul I perlu disesuaikan

Modul I menguji halaman publik. Perilakunya berubah di `ca44816`: dibuka lewat
`public_share_token`, dan URL berbasis kode tiket sekarang **404**. Rencana yang ditulis
terhadap `e8a71e2` akan melaporkan itu sebagai bug.

---

## Checklist yang perlu ditulis ulang sebelum dipakai

`docs/rma-test-checklist.md` ditulis sebelum alur kelayakan klaim berpindah ke desk RMA.
Ini **BL2**, dan belum dikerjakan:

| Bagian | Masalah |
|---|---|
| **D** | Seluruhnya tentang jalur teknisi memutuskan kelayakan, yang sudah dihapus |
| **C-01, C-06** | Berubah karena alur verifikasi sekarang berbeda |
| **F-02, F-16** | Idem |

Dan tiga perubahan baru yang **belum ada di checklist mana pun**:

- Unit stok toko wajib **nomor pemindahan stok** sebelum bisa diverifikasi, dan juga pada
  jalur `on_hold → in_vendor_process`
- **Nomor Klaim Pemasok** hanya wajib untuk stok toko; unit customer punya **Nomor Tiket
  User** opsional dan **foto tanda terima** opsional
- Halaman publik dibuka lewat token, dan kode tiket harus 404

---

## Cacat yang sudah diketahui — jangan dilaporkan ulang

Ada di `## 📋 BACKLOG` di `CLAUDE.md`, tapi yang paling mungkin tersandung saat QC:

| | |
|---|---|
| **BL3** | Empat tabel poin yang bertengkar |
| **BL6** | `delivery.ts:50` menelan nilai balik aksi dan melaporkan sukses apa pun hasilnya |
| **BL7** | Tidak ada penjaga transisi tiket — `done → on_progress → done` mengkredit dua kali |
| **BL8** | Redirect Sales menunjuk `/customer/...` yang tidak ada |
| **BL18** | `extra_services` tidak menghasilkan poin di mana pun |
| **BL19** | Alokasi kode RMA berbasis retry, bukan penguncian |

---

## Yang masih terbuka di sisi infrastruktur

- **Rotasi password.** MySQL dan SSH memakai password yang sama, port 3306 terbuka ke
  internet, dan beberapa kunci sempat lewat percakapan — service-role Supabase, Resend, R2
- **`admin@techserve.id` / `admin123`** masih berlaku sebagai Administrator aktif, dan
  password itu tertulis di repo publik. Diputuskan dibiarkan 2026-09-30 — risiko yang
  diterima sadar, bukan yang terlewat
- **Repo publik.** Seluruh logika autentikasi dan guard peran bisa dibaca siapa saja
- **Belum ada baseline migration.** Database berisi data sekarang, jadi `prisma db push`
  untuk perubahan schema berikutnya tidak lagi aman — Bagian A `docs/rma-deploy.md`
