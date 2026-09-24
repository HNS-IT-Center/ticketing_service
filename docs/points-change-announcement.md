# Perubahan Perhitungan Poin — Ringkasan untuk Teknisi

> Dokumen ini untuk diumumkan ke tim teknisi dan Store Coordinator.
> Versi teknisnya ada di `FLOW.md` § 4.

## Ringkasnya

Selama ini ada **empat tabel poin berbeda** di sistem, dan yang tampil di layar bukan yang
dicatat ke nilai kalian. Contoh paling jelas: satu tiket **Cleaning** tampil **2 poin** di
dashboard, tapi tercatat **5 poin** kalau teknisi yang menutupnya, dan **4 poin** kalau admin
yang menutup — untuk tiket yang sama persis.

Mulai sekarang **cuma ada satu tabel**. Yang tampil di badge, di leaderboard, dan di laporan
performance adalah angka yang benar-benar dicatat.

Tabel yang dipakai adalah tabel yang selama ini sudah mencatat poin kalian (sejak 27 Juli
2026). Jadi buat sebagian besar kasus, **poin yang kalian terima tidak berubah** — yang
berubah adalah angka yang ditampilkan, supaya akhirnya jujur.

---

## Perubahan per kasus

| Jenis tiket | Tampil di layar (dulu) | Dicatat kalau **teknisi** yang tutup (dulu) | Dicatat kalau **admin/CS** yang tutup (dulu) | **Sekarang (semua)** |
|---|---|---|---|---|
| Service — PC / Laptop biasa | 5 | 5 | 4 | **5** |
| Service — perangkat "Other Device" | 5 | 3 | 4 | **3** |
| PC Build | 4 | 4 | 4 | **4** — tidak berubah |
| Cleaning — Basic Cleaning / Repaste | 2 (4 kalau PC Gaming) | 3 | 3 | **3** |
| Cleaning — Deep Clean | 2 (4 kalau PC Gaming) | 3 | 4 | **3** |
| Cleaning — Full Repaste / Full Repaste CPU+GPU | 2 (4 kalau PC Gaming) | 5 | 3 | **5** |
| Warranty Claim | 2 | 2 | 2 | **2** — tidak berubah |
| Upgrade | 2 | 2 | 3 | **2** |
| Extra service (per item) | badge menambah **+3** | 0 | 0 | **0** |

### Yang paling perlu diperhatikan

**1. Cleaning naik, dan sekarang tergantung paketnya — bukan tergantung perangkatnya.**
Dulu angka yang tampil menghitung "PC Gaming" sebagai 4 poin dan sisanya 2. Itu tidak pernah
benar. Yang menentukan sebenarnya adalah **paket servisnya**: Full Repaste dan Full Repaste
CPU+GPU bernilai **5 poin**, paket cleaning lainnya **3 poin**, apa pun perangkatnya. Jadi
kalau selama ini kalian merasa cleaning dihargai terlalu kecil di dashboard — memang begitu,
dan angka yang tercatat sebenarnya sudah lebih tinggi.

**2. Service "Other Device" turun dari 5 ke 3 di layar.**
Angka 3 ini bukan hal baru. Sejak 27 Juli 2026 sistem memang sudah mencatat 3 poin untuk
service perangkat "Other Device"; hanya tampilannya yang masih menunjukkan 5. Sekarang
tampilannya ikut benar.

**3. Tiket yang ditutup admin/CS bernilai beda dari tiket yang ditutup teknisi — ini yang
diperbaiki.**
`admin.ts` punya tabel poin sendiri yang tidak cocok dengan tabel mana pun. Akibatnya nilai
satu tiket bisa berbeda **hanya karena siapa yang menekan tombol terakhir**:

- Service ditutup admin cuma dihitung **4** (seharusnya 5)
- Cleaning Full Repaste ditutup admin cuma dihitung **3** (seharusnya 5)
- Upgrade ditutup admin dihitung **3** (seharusnya 2)

Kalau selama ini ada tiket kalian yang ditutup admin dan terasa poinnya kurang, kemungkinan
besar ini penyebabnya. Sekarang siapa pun yang menutup, nilainya sama.

**4. Extra service tidak pernah menambah poin — badge-nya yang salah.**
Di halaman My Tickets, badge menampilkan "+3" untuk tiap extra service. Angka itu **tidak
pernah** masuk ke total poin kalian; hanya hiasan di layar. Badge sekarang menampilkan poin
yang sebenarnya, dengan penanda "(ada extra)" supaya tetap terlihat kalau tiket itu punya
extra service.

Ini bukan pengurangan hak — tidak ada poin yang dicabut, karena poin itu memang tidak pernah
ada. Kalau memang extra service seharusnya menambah poin, itu keputusan terpisah dan bisa
dinyalakan kapan saja.

---

## Apakah poin saya yang sudah terkumpul berubah?

**Total di halaman profil: tidak diubah.** Angka `total_points` dan jumlah tiket yang sudah
tersimpan dibiarkan apa adanya. Perbaikan ini hanya berlaku untuk tiket yang ditutup mulai
sekarang.

**Angka di Leaderboard dan laporan Performance: bisa bergeser, termasuk untuk bulan-bulan
lalu.** Kedua halaman itu tidak membaca total tersimpan — keduanya menghitung ulang dari
riwayat tiket setiap kali dibuka. Karena tabelnya berubah, hasil hitung ulang untuk bulan lalu
pun ikut berubah.

Arah pergeserannya:

- Teknisi yang banyak mengerjakan **cleaning** kemungkinan **naik** (2 → 3, atau 5 untuk full
  repaste)
- Teknisi yang banyak mengerjakan **service Other Device** kemungkinan **turun** sedikit
  (5 → 3)
- Peringkat bisa bertukar. Ini bukan kesalahan input dan bukan penalti — angka lamanya yang
  memang salah hitung.

Kalau ada yang merasa angkanya aneh setelah perubahan ini, laporkan dengan menyebut **nomor
tiketnya**, bukan cuma totalnya, supaya bisa dicek satu per satu.

---

## Kenapa baru ketahuan sekarang

Tabel poin di-copy ke sembilan tempat berbeda di dalam kode. Pada 27 Juli 2026 salah satunya
diperbarui — yang dipakai untuk mencatat poin — dan delapan sisanya tidak ikut. Tidak ada yang
menyadarinya karena tidak ada satu pun layar yang menampilkan kedua angka itu berdampingan.

Sekarang tabelnya cuma satu file. Kalau nilainya perlu diubah lagi, cukup diubah di satu
tempat dan semua layar serta semua pencatatan ikut berubah bersamaan.
