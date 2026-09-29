# Rencana — Nomor Pemindahan Stok untuk Klaim Unit Stok Toko

Status: **menunggu persetujuan.** Belum ada kode yang diubah.

Permintaan (2026-09-30): unit yang berasal dari **stok toko** wajib mencantumkan nomor
pemindahan stok dari toko ke gudang klaim, dan pengisiannya **sebelum verifikasi** — desk RMA
tidak boleh meloloskan verifikasi tanpa nomor itu.

---

## Kenapa ini muat tanpa memaksa apa pun

Alur RMA sudah punya bentuk persis ini. `replacement_sn` wajib **hanya kalau** keputusan
vendor `replaced`, dan itu ditangani sebagai syarat bersyarat di satu tempat:

```ts
// lib/rma/state-machine.ts — validateRmaTransition()
if (to === "vendor_decided" && input.decision === "replaced") {
  required.push("replacement_sn");
}
```

Yang diminta adalah saudara kandungnya:

```ts
if (to === "verified" && unitOwnership === "store_stock") {
  required.push("stock_transfer_number");
}
```

Jadi ini menambah satu baris pada aturan yang sudah teruji, bukan mekanisme baru.

---

## Perubahan

### 1. Schema — satu kolom

```prisma
model RmaCase {
  stock_origin          String?   // sudah ada — wajib saat unit_ownership = store_stock
  stock_transfer_number String?   // BARU
}
```

**Nullable di database, wajib di aplikasi** — pola yang sama dengan `recommended_eligible`.
Alasannya: klaim milik customer tidak punya nomor ini, dan memaksanya `NOT NULL` berarti
mengarang nilai untuk kasus yang tidak relevan.

Aman untuk cutover: kolom nullable itu additive, dan `RmaCase` di produksi **masih kosong** —
fitur RMA belum pernah tayang. Jadi tidak ada baris lama yang perlu diisi mundur.

### 2. State machine — `lib/rma/state-machine.ts`

| Yang diubah | |
|---|---|
| `RmaTransitionField` | tambah `"stock_transfer_number"` |
| `RmaTransitionInput` | tambah `stock_transfer_number?: string \| null` |
| `FIELD_LABELS` | `"Nomor pemindahan stok"` |
| `validateRmaTransition()` | terima argumen baru `unitOwnership`, dan dorong syaratnya saat `to === "verified"` |

`validateRmaTransition` sekarang butuh tahu kepemilikan unit. Ditambahkan sebagai argumen,
bukan dibaca dari database, supaya modul ini tetap murni dan bisa diuji tanpa database —
sebagaimana `performanceEffect` dulu menerima `claimEligible`.

### 3. Server action — `app/actions/rma.ts:481`

Meneruskan `unitOwnership` dari case yang sedang diproses ke `validateRmaTransition`, lalu
menyimpan nilainya saat transisi diterima. Validasi server tetap jadi penentu; UI hanya
mencerminkannya.

### 4. UI — `app/rma/cases/[id]/RmaActionPanel.tsx`

- `FIELD_INPUTS`: label **"Nomor Pemindahan Stok"**, placeholder contoh nomor
- Baris 175: cermin syarat bersyarat di sisi klien, sejajar dengan yang sudah ada untuk
  `replacement_sn`
- Muncul **hanya** pada tombol "Verifikasi Lolos", **hanya** untuk case `store_stock`

### 5. Halaman case — tampilkan nilainya

Di samping `stock_origin`, supaya orang berikutnya bisa menelusuri unitnya.

### 6. Halaman publik — **tidak** ditampilkan

Ini logistik internal. `CLAUDE.md` mensyaratkan `/{date}/{ticketCode}` memilih field RMA satu
per satu; kolom baru ini tidak ditambahkan ke sana.

### 7. Test — `lib/rma/state-machine.test.ts`

- `store_stock` tanpa nomor → verifikasi **ditolak**
- `store_stock` dengan nomor → verifikasi **lolos**
- `customer` tanpa nomor → verifikasi **lolos** (tidak relevan)
- Nomor tidak diwajibkan pada transisi lain dari `pending_verification` (`ineligible`,
  `on_hold`, `cancelled`) — unit yang ditolak tidak pernah dipindahkan

---

## ⚠️ Satu celah yang perlu kamu putuskan

Tabel transisi mengizinkan `on_hold → in_vendor_process` ("Lanjut Proses Vendor"). Jalur itu
**melewati** `verified`, jadi case stok toko secara teknis bisa sampai ke vendor tanpa pernah
melewati syarat ini:

```
pending_verification → on_hold → in_vendor_process
```

Dua pilihan:

| | |
|---|---|
| **Tutup sekalian** | Wajibkan juga pada `→ in_vendor_process` untuk case `store_stock`. Menutup lubangnya, satu baris tambahan |
| **Biarkan** | Jalur itu memang ditujukan untuk case yang sudah pernah diajukan ke vendor lalu tertahan, jadi normalnya sudah lewat `verified` |

Saya condong **menutupnya** — syarat yang bisa dilewati lewat jalur lain memberi rasa aman
yang keliru, dan biayanya satu baris.

---

## Yang perlu kamu jawab

1. **Celah di atas** — tutup atau biarkan?
2. **Format nomornya** — teks bebas seperti `stock_origin`, atau ada pola tetap yang perlu
   divalidasi?
3. **Boleh sama antar case?** Kalau satu nomor pemindahan bisa memuat beberapa unit,
   biarkan tidak unik. Kalau satu nomor untuk satu unit, saya tambahkan indeks unik

---

## Urutan terhadap cutover

Cutover belum selesai — build di Hostinger belum pernah sukses. Dua pilihan:

| | |
|---|---|
| **Kerjakan sekarang, ikut cutover** | Fitur RMA belum pernah tayang dan `RmaCase` kosong, jadi menambah field sebelum peluncuran pertama itu gratis. Sesudah tayang, case lama akan kehilangan field ini |
| **Selesaikan cutover dulu** | Satu variabel pada satu waktu. Kalau build gagal lagi, penyebabnya tidak bercampur dengan perubahan schema |

Saya condong ke **yang pertama**, dengan satu syarat: `prisma db push` ke Hostinger
dilakukan **bersamaan dengan penyalinan data final** saat cutover, bukan sekarang — supaya
schema dan data bergerak dalam satu langkah yang sama.
