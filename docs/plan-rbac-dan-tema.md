# Rencana: Role & Izin yang bisa dibuat sendiri, dan tema gelap

Disetujui dari mockup v2 (https://claude.ai/artifact/KuVUY4FECPD23256awtqRt), 18 Nov 2026.
Dua pekerjaan terpisah, masing-masing di branch sendiri, supaya kalau satu bermasalah yang
lain tidak ikut tertahan.

---

## A. Tema gelap

Tidak ada perubahan database. Bisa naik tanpa SQL di VPS.

### Yang dikerjakan

1. **Saklar tema** di menu nama (kanan atas): *Terang · Gelap · Ikuti perangkat*. Pilihan
   disimpan di browser masing-masing (`next-themes`, sudah terpasang), jadi tiap orang bisa
   memilih sendiri dan tidak ada kedipan putih saat halaman dibuka.
2. **Palet gelap HNS**, menggantikan dua blok `.dark` bawaan shadcn yang sekarang abu-abu
   polos. Warnanya mengikuti mockup: latar biru-hitam, kartu sedikit lebih terang, biru HNS
   dinaikkan kecerahannya supaya terbaca. Satu tempat di `globals.css` mengisi tiga keluarga
   token sekaligus: shadcn (`--background`, `--card`, `--primary` …), sidebar, dan `--tone-*`
   untuk badge status.
3. **Warna yang ditulis mati di kode** (±80 tempat `bg-white`, `text-black`, `bg-slate-*`,
   hex di inline style) diganti token. Daftar per file dibuat dulu, dikerjakan per portal.
4. **Tetap terang di mana pun temanya:** faktur dan struk, export PDF performance, gambar
   share pemenang, dan halaman status untuk customer (`/{tanggal}/{token}`). Yang dicetak atau
   dikirim ke customer tidak boleh ikut tema layar staf.
5. **Grafik** (Dashboard Toko, leaderboard, analisa klaim) membaca warna dari token, dicek
   kontrasnya di kedua tema.

### Cara memastikan

- Screenshot setiap halaman menu di empat portal, lebar 1440 dan 390, terang dan gelap.
- Cek kontras teks utama dan teks redup minimal 4.5:1 di kedua tema.
- Halaman cetak dibuka dalam tema gelap dan harus tetap putih.

---

## B. Role & Izin yang bisa dibuat sendiri

Butuh migrasi. **SQL dijalankan di VPS sebelum push**, seperti biasa.

### Konsep

- **Role** = nama + keterangan + **tipe dasar** + **lokasi data** + **daftar izin per halaman**.
- **Tipe dasar** (Admin, Teknisi, Sales, RMA, Kepala Toko, Admin Stok, Finance) menentukan
  *perilaku*: teknisi memegang tiket dan punya poin, kepala toko terikat tokonya, dan
  seterusnya. Kolom `User.role` yang sekarang tetap ada dan **selalu sama dengan tipe dasar
  role akun itu**, jadi semua perilaku yang sudah jalan tidak berubah.
- **Izin** sekarang dihitung dari bawaan kode + pengecualian. Diganti: setiap role menyimpan
  daftar izinnya sendiri secara utuh. Bawaan kode tinggal jadi templat saat role dibuat dan
  tombol "Pakai bawaan".
- **Owner** tetap di luar semua ini: selalu boleh semua, tidak punya role yang bisa diubah.

### Database

| Tabel | Isi |
|---|---|
| `AccessRole` (baru) | id, nama (unik), keterangan, tipe dasar, lokasi (`all` / `assigned`), dibuat oleh, waktu |
| `AccessRoleGrant` (baru) | role + kode izin, satu baris per izin yang dicentang |
| `User.access_role_id` (baru) | role akun itu. Kosong hanya untuk Owner, Customer, dan akun SSO yang belum diberi role |
| `UserStoreAssignment` (baru) | toko yang dipegang akun, untuk role berlokasi *toko yang dipegang* yang bukan Teknisi atau Kepala Toko (keduanya sudah punya tabel sendiri) |
| `StoreSupervisorAssignment` | ditambah `ended_at`, supaya mengganti kepala toko menyimpan riwayat, bukan menghapus |
| `AccessRule` | dibaca sekali saat migrasi, lalu tidak dipakai lagi. Dihapus di rilis berikutnya |

### Pindah dari sistem sekarang, tanpa ada akses yang berubah

Migrasi membuat role awal dari keadaan sekarang, termasuk pengaturan yang sudah diubah Owner:

- Admin, Teknisi, Sales, RMA, Kepala Toko, Admin Stok, Finance: satu role masing-masing.
- **Koordinator Toko** dan **Head Teknisi** sekarang adalah tanda tambahan di akun teknisi,
  bukan role. Teknisi bertanda itu dipindah ke role "Koordinator Toko", "Head Teknisi", atau
  "Koordinator & Head Teknisi" (bertipe dasar Teknisi), yang izinnya gabungan seperti
  sekarang. Tandanya tetap disimpan, karena dipakai untuk perilaku seperti menyetujui
  permintaan tiket di tokonya.

**Pengaman utama:** sebuah test membandingkan, untuk setiap akun di salinan data production,
izin sebelum dan sesudah migrasi. Harus sama persis. Kalau ada satu akun yang berbeda, migrasi
tidak naik.

### Izin baru (tadinya selalu khusus Admin)

Ringkasan Bisnis, Tiket Perlu Dicek, Kelola pengguna, Kelola toko, Hapus tiket permanen,
Hapus/kembalikan poin tiket, Ubah target teknisi. Role Admin hasil migrasi mendapat semuanya,
jadi tidak ada admin yang kehilangan akses.

Halaman awal role bertipe Admin yang tidak punya Ringkasan Bisnis: halaman pertama di
menunya.

### Lokasi data

- *Semua toko*: seperti sekarang.
- *Hanya toko yang dipegang*: semua daftar, export, dan detail tiket dibatasi ke toko akun itu.
  Halaman yang sudah bisa dibatasi per toko langsung ikut: Semua Tiket, Tiket Klaim, case
  RMA, Rakitan PC, Part Keluar, halaman Keuangan, dan halaman Toko.
- Halaman yang **belum** bisa dibatasi per toko (Dashboard RMA, Analisa Klaim, Performance,
  Leaderboard, Target, Laporan Part, Log, Ringkasan Bisnis) tampil abu-abu "Belum tersedia
  untuk lokasi toko yang dipegang". Tidak bisa dicentang sampai halamannya dibatasi, supaya
  tidak ada data toko lain yang bocor.

### Pengaman

- Role & Izin: hanya Owner.
- Role bertipe dasar Admin, dan role Owner, hanya bisa diberikan oleh Owner. Akun yang
  memegangnya hanya bisa diubah atau dinonaktifkan oleh Owner.
- Tidak ada yang bisa mengubah role akunnya sendiri.
- Tipe dasar dikunci setelah role dipakai akun. Role hanya bisa dihapus kalau tidak dipakai.
- Membuat, mengubah, dan menghapus role, serta mengganti kepala toko, tercatat di Log Aktivitas.

### Tahap

| # | Isi | Terlihat oleh pengguna |
|---|---|---|
| B1 | Tabel, migrasi, test pembanding izin. Izin dibaca dari role | Tidak ada perubahan |
| B2 | Halaman Role & Izin baru: daftar, tambah, ubah, hapus, pratinjau menu. Pilihan role di form akun | Ya |
| B3 | Tujuh izin baru menggantikan kunci "khusus Admin" | Ya |
| B4 | Lokasi data + toko yang dipegang per akun | Ya |
| B5 | Tab Kepala toko + riwayat, dipindah dari Data Master → Stores | Ya |

B1 sampai B3 bisa naik bersama. B4 dan B5 masing-masing bisa naik sendiri setelahnya.
