# Rencana: field "komponen yang diklaim"

**Status:** disetujui, dikerjakan **setelah QC selesai**.
**Cakupan yang dipilih:** semua tipe perangkat, bukan hanya PC.
**Diminta:** 2026-09-25, saat membangun rincian klaim per merek dan per tipe perangkat.

---

## Masalahnya

Dashboard RMA sekarang bisa menjawab "merek apa yang paling sering diklaim" dan "tipe
perangkat apa", tapi tidak bisa menjawab **"bagian mana yang rusak"**.

Tidak ada field untuk itu. Yang tersimpan pada tiket klaim hanya:

| Field | Isi |
|---|---|
| `Ticket.device_type` | enum: `PC_Office`, `PC_Gaming`, `Laptop_Office`, `Laptop_Gaming`, `Printer`, `Other_Device` |
| `Ticket.device_name` | teks bebas, mis. `"ASUS ROG G15"` |
| `Ticket.device_sn` | serial number |
| `Ticket.notes` | keluhan, teks bebas |

`TicketPcBuildComponent` **bukan** jalan keluarnya — tabel itu milik tiket `pc_build`
(daftar komponen rakitan), tidak ada hubungannya dengan klaim garansi.

Jadi klaim PC hari ini tercatat sebagai "PC Gaming" saja. Apakah yang rusak PSU, VGA, RAM,
atau motherboard hanya ada di `notes` sebagai kalimat bebas — tidak bisa dihitung.

## Kenapa semua perangkat, bukan hanya PC

Permintaan awalnya "pc itu komponennya apa". Tapi per 2026-09-25 **seluruh 9 klaim yang
pernah masuk adalah laptop** (8 Laptop Gaming, 1 Laptop Office) — belum ada satu pun klaim
PC. Kalau field-nya hanya untuk PC, rinciannya akan kosong sampai klaim PC pertama datang.

Klaim laptop juga punya pola komponen yang jelas dan berulang: baterai, layar, keyboard,
engsel. Justru di situ datanya ada.

## Rancangan

### 1. Schema

```prisma
model TicketWarrantyDetail {
  // ...
  claimed_component String?   // null untuk baris lama
}
```

Disimpan di `TicketWarrantyDetail`, bukan di `Ticket`, karena ini khusus klaim.
Nullable supaya 9 klaim yang sudah ada tidak perlu diisi mundur.

Disimpan sebagai `String` dengan daftar pilihan di kode, **bukan** enum Postgres. Alasannya:
daftar komponen akan berubah seiring waktu, dan menambah nilai enum Postgres itu migrasi;
menambah entri di array TypeScript tidak. Nilai yang tidak dikenal tetap tampil apa adanya.

### 2. Daftar komponen per tipe perangkat

`lib/rma/component.ts`, dipakai bersama oleh form dan dashboard:

| Tipe perangkat | Pilihan |
|---|---|
| Laptop (Office / Gaming) | Baterai, Layar / LCD, Keyboard, Engsel, Motherboard, SSD / HDD, RAM, Adaptor / Charger, Kipas / Pendingin, Speaker, Lainnya |
| PC (Office / Gaming) | Motherboard, Processor, RAM, VGA / GPU, PSU, SSD / HDD, Casing, Kipas / Pendingin, Monitor, Keyboard / Mouse, Lainnya |
| Printer | Head / Cartridge, Roller, Board, Power Supply, Scanner, Lainnya |
| Perangkat Lain | Lainnya + isian bebas |

"Lainnya" harus memunculkan isian teks pendek, kalau tidak semuanya akan jatuh ke sana.

### 3. Form intake

`app/technician/tickets/create/CreateTicketForm.tsx`, di blok yang sudah muncul saat
`ticketType === "warranty_claim"` (sekitar baris 468). Dropdown yang isinya menyesuaikan
`deviceType` / `gridDevice` yang sudah dipilih di langkah sebelumnya.

Wajib diisi, disamakan dengan SN dan tanggal pembelian — divalidasi **di server** di
`createTicketAction`, bukan hanya di form. Tiga field klaim yang sudah ada divalidasi begitu;
ikuti polanya.

⚠️ Ingat pola kesalahan yang sudah tiga kali terjadi di fitur ini: form yang merender bukan
berarti alurnya bisa diselesaikan. Uji sampai tombol **Create Ticket** benar-benar menghasilkan
tiket, jangan berhenti di "field-nya muncul".

### 4. Dashboard

Kartu `BreakdownCard` di `app/rma/dashboard/page.tsx` sudah generik — tinggal satu pemanggilan
lagi, "Klaim per Komponen". Hitungannya di `lib/rma/queue.ts` mengikuti pola `brands` dan
`deviceTypes` yang sudah ada.

Pertimbangkan filter tipe perangkat pada kartu itu: "PSU" dan "Baterai" tidak sebanding kalau
dicampur dalam satu daftar.

### 5. Dampak ke QC

Test case berikut perlu diuji ulang karena form intake klaim berubah:

- **A-02, A-03** — pola validasi field wajib, sekarang bertambah satu
- **A-04, A-05** — pembuatan klaim berhasil
- **A-07** — form yang sama dipakai Sales
- **A-08** — jenis kasus wajib dipilih

Tambahkan juga: dropdown berubah isi saat tipe perangkat diganti, dan "Lainnya" memunculkan
isian bebas.

## Yang sengaja TIDAK termasuk

- **Mengisi mundur 9 klaim lama.** Nilainya null, dan dashboard cukup menampilkannya sebagai
  "Belum dicatat" alih-alih memaksa orang menebak komponen dari tiket lama.
- **Tabel komponen tersendiri.** Sama alasannya dengan vendor: daftar di kode dulu, naikkan
  jadi tabel hanya kalau memang perlu dikelola dari UI.
