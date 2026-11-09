# Alur Input — Setiap Data Diisi Sekali

Prinsipnya: **data yang sudah dicatat di satu langkah tidak diminta lagi di langkah berikutnya.**
Langkah berikutnya menampilkannya ("sudah tercatat"), atau mengisinya otomatis supaya
tinggal dikoreksi bila perlu.

Status: dicoba di lokal (branch `feat/no-double-input`), belum di-push. Tidak ada perubahan
database.

---

## 1. Tiket Service — part yang dipasang

### Sebelumnya
1. Teknisi mencatat part di panel **Part yang Diganti**: jenis, barang, jumlah, foto.
2. Baris tagihannya muncul di **Rincian Biaya** tanpa harga.
3. Teknisi membuka Rincian Biaya, menekan **Ubah**, lalu mengisi harga dan supplier.

Rincian Biaya juga punya pilihan "Part" sendiri, jadi part yang sama bisa tercatat dua kali
dan **tertagih dobel**.

### Sekarang — satu form
1. Teknisi menekan **Tambah part**, di panel Part yang Diganti atau di Rincian Biaya.
2. Form **Rincian Biaya → Part** terbuka dengan isian:
   - jenis part
   - barang (dari katalog Accurate, atau ketik manual bila barangnya belum masuk)
   - jumlah
   - supplier
   - harga jual (harga modal untuk yang berhak)
   - catatan
   - **foto part**
3. Simpan **sekali**. Part tampil di panel Part yang Diganti beserta fotonya, dan sudah berharga
   di tagihan.

Kode Accurate yang menyusul tetap lewat **Masukkan kode**, tanpa mengisi ulang yang lain.

---

## 2. Klaim Garansi — intake sampai serah terima ke RMA

| Data | Diisi saat | Di dialog **Serahkan Unit ke RMA** |
|---|---|---|
| Kepemilikan unit | Intake | Ditampilkan, tidak ditanya lagi *(sudah ada sebelumnya)* |
| Asal stok | Intake | Sudah terisi *(sudah ada sebelumnya)* |
| **Nota pembelian** | Intake | **Langsung terpilih**: "Nota pembelian — dilampirkan saat intake". Tombol **Ganti** bila notanya salah. Unggah nota baru hanya muncul kalau belum ada nota |
| **Deskripsi kerusakan** | Intake (Deskripsi Keluhan) | **Terisi dari keluhan intake**. Teknisi menambah atau mengoreksi hasil pemeriksaannya |
| Cek SN | — | Tetap dicentang: ini verifikasi, bukan input ulang |
| Kondisi fisik, hasil tes, foto/video kerusakan, rekomendasi | Serah terima | Data baru dari pemeriksaan teknisi |

---

## 3. RMA — dari verifikasi sampai vendor

| Langkah | Sebelumnya | Sekarang |
|---|---|---|
| Verifikasi Lolos (stok toko) | Nomor Pemindahan Stok diisi | Sama |
| **Vendor Memproses** | Nomor Pemindahan Stok dan Resi diminta lagi | Keduanya tampil "(sudah tercatat)". Kolom hanya muncul kalau datanya masih kosong |
| **Ajukan ke Vendor lagi** (setelah Tahan → Verifikasi Ulang) | Vendor, Nomor Klaim Pemasok, dan Resi kosong lagi | **Terisi dari pengajuan sebelumnya.** Cukup diubah kalau berubah |
| Nomor Tiket User (unit customer) | Hanya bisa diisi saat Ajukan ke Vendor | Bisa juga diisi saat **Vendor Memproses**, karena nomor ini sering baru keluar setelah unit diterima vendor |

---

## 4. Build PC dari quotation

| Data | Sumber | Perilaku |
|---|---|---|
| Sales | Baris "Sales:" di PDF | Terisi otomatis *(sudah ada sebelumnya)* |
| **Nama customer** | Langkah 1 dan PDF quotation | Kalau namanya beda, muncul peringatan dan tombol **Pakai nama dari quotation** |
| Komponen | PDF quotation | Jadi checklist, tidak diketik ulang *(sudah ada sebelumnya)* |

---

## 5. Biaya cek Rp 50.000

Diputuskan owner 2026-11-08: **selalu ditagih.**

| Sebelumnya | Sekarang |
|---|---|
| Tercatat di tiket saat intake, tapi tidak masuk faktur. Kasir/teknisi harus menambah jasa "Diagnosa / Pengecekan" lagi | Saat tiket service dibuat, baris **Diagnosa / Pengecekan — Rp 50.000** langsung masuk Rincian Biaya. Kalau tidak jadi ditagih, hapus barisnya di Rincian Biaya |

Tiket lama yang sudah dibuat sebelum perubahan ini tidak diubah; fakturnya tetap memberi
pengingat untuk menambahkan jasanya bila ditagih. Poin jasa ini 0, jadi target poin teknisi
tidak berubah — tapi omzet di Target Teknisi ikut bertambah Rp 50.000 per tiket service.

## Tidak diubah — keputusan owner

**Foto unit klaim** (2026-11-08: usulan ditolak). "Foto Barang yang Diklaim" saat intake dan
"Foto/Video Kerusakan" saat serah terima tetap dua langkah terpisah seperti sekarang.
