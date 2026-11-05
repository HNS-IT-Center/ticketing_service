# Integrasi Quotation PC Build: e-commerce → Ticketing

Status: **rancangan, belum dibangun** (2026-11-04).

Tujuannya: sales tidak lagi mengirim daftar komponen PC Build sebagai file atau foto.
Tiket PC Build mengambil langsung isi quotation rakitan (`PcBuildQuote` di
`ecommerce-hns`) memakai kodenya.

## 1. Alur

1. Sales menyusun quotation di `/build-pc` (atau paket prebuild) di web e-commerce, seperti
   sekarang.
2. Saat deal, sales membuat tiket PC Build di sistem tiket, lalu menempel **kode quotation**
   dan menekan **Ambil**.
3. Server tiket memanggil API e-commerce (server ke server, pakai token). Hasilnya mengisi
   data customer, daftar komponen (asal: **beli di toko**), nama paket, dan biaya rakit.
4. Komponen yang dibawa customer sendiri ditambahkan sales lewat "Ketik manual" dengan asal
   **bawaan customer**.
5. Teknisi melihat kedua kelompok komponen itu, plus tautan ke quotation.

Sistem tiket **menarik** data, e-commerce tidak mengirim. Alasannya:
- Quotation masih bisa direvisi setelah DP, jadi tiket mengambil revisi terakhir saat
  serah terima.
- Tidak semua deal lewat web.
- Tidak ada tiket yang terbentuk untuk quotation yang batal dirakit.

Tombol "Kirim ke teknisi" di sisi e-commerce bisa ditambahkan nanti (tahap 2) memakai API
yang sama.

## 2. Kontrak API (dibangun di `ecommerce-hns`)

```
GET {ECOMMERCE_API_URL}/api/integrations/ticketing/pc-build-quotes/{code}
Authorization: Bearer {token}
```

- `code` dirapikan dulu: spasi di awal/akhir dibuang, huruf dijadikan kapital.
- Token dibandingkan dengan `timingSafeEqual`. Env var di e-commerce:
  `TICKETING_INTEGRATION_TOKEN`. Kalau env var ini kosong, endpoint menjawab 503, bukan
  terbuka tanpa token.
- Token juga diterima lewat header `X-Integration-Token`. Proxy Hostinger (LiteSpeed/Apache)
  kadang membuang `Authorization` sebelum sampai ke Node, jadi sistem tiket mengirim kedua
  header.
- Hanya membaca: tidak menandai, tidak mencatat status, tidak mengubah apa pun.

**Lintas server.** E-commerce ada di hPanel, sistem tiket di VPS `201.18.219.113`.
Panggilannya lewat HTTPS publik.
- Kalau domain e-commerce lewat Cloudflare dengan Bot Fight Mode atau WAF, buat aturan
  "Skip" untuk `/api/integrations/*` atau izinkan IP VPS. Tanpa itu, panggilan server
  dijawab halaman tantangan 403.
- Aplikasi Node di hPanel bisa lambat merespons setelah lama tidak dipakai. Sistem tiket
  menunggu sampai 15 detik.
- Kalau e-commerce tidak bisa dihubungi, sales tetap bisa membuat tiket dengan mengetik
  komponen manual.

**200**

```json
{
  "code": "Q-2611-0042",
  "kind": "build",
  "prebuildName": null,
  "revision": 3,
  "status": "closing",
  "dpAt": "2026-11-03T08:12:00.000Z",
  "closedAt": null,
  "customer": { "name": "Budi", "phone": "6281234567890" },
  "salesName": "Tyo",
  "items": [
    {
      "productId": "123",
      "name": "MSI RTX 4060 VENTUS 2X 8GB",
      "sku": "web-sku-atau-null",
      "accurateCode": "2503000069",
      "quantity": 1,
      "unitPrice": 5250000,
      "stepName": "VGA"
    }
  ],
  "subtotal": 15250000,
  "assemblyFee": 150000,
  "discount": 0,
  "total": 15400000,
  "publicUrl": "https://hnsitcenter.id/q/abcd1234",
  "updatedAt": "2026-11-04T02:00:00.000Z"
}
```

- Semua uang dalam **Rupiah bulat (integer)**, bukan string desimal.
- `items` diambil dari snapshot `items` revisi terakhir.
- `accurateCode` dibaca saat permintaan masuk dari `Product.accurateCode` lewat
  `productId`. Nilainya `null` kalau produk sudah tidak ada atau belum tertaut.
- `publicUrl` bernilai `null` kalau `publicToken` masih NULL.

**Error:** `400 {"error":"invalid_code"}` · `401 {"error":"unauthorized"}` ·
`404 {"error":"not_found"}` · `503 {"error":"not_configured"}`

**Tidak boleh pernah ikut dikirim:** `internalNote`, `contentHash`, id user (owner, createdBy,
closedBy, dpBy), `submissions`, riwayat revisi, dan data `pc_build_submissions`.

## 3. Sisi Ticketing (dikerjakan di repo ini)

| # | Pekerjaan |
|---|---|
| 1 | Env `ECOMMERCE_API_URL`, `ECOMMERCE_API_TOKEN`. Fitur mati (kolom kode disembunyikan) kalau belum diisi |
| 2 | `lib/ecommerce/quotes.ts`: ambil dan validasi bentuk respons, batas waktu 15 detik. Error dibedakan: tidak dikonfigurasi, tidak ditemukan, tidak bisa dihubungi |
| 3 | `GET /api/pc-build-quotes/[code]`: khusus staf, meneruskan ke e-commerce. Token tidak pernah sampai ke browser |
| 4 | Migrasi: `TicketPcBuildDetail.quote_code`, `quote_revision`, `quote_snapshot Json?`. `TicketPcBuildComponent.origin` (`store` / `customer`, null = data lama) dan `unit_price Int?` |
| 5 | Form Create Ticket langkah PC Build: kolom **Kode Quotation** + tombol **Ambil**. Komponen terisi dengan asal "beli di toko"; nama dan WA customer terisi kalau masih kosong; muncul peringatan kalau quotation belum DP/closing. Komponen manual bisa ditandai "bawaan customer". Lampiran tidak wajib kalau quotation sudah diambil |
| 6 | `createTicketAction` **mengambil ulang quotation di server** berdasarkan kode. Isi yang dikirim browser tidak dipercaya, mengikuti aturan katalog |
| 7 | Halaman tiket teknisi/admin/sales: komponen dibagi dua kelompok (beli di toko / bawaan customer), dengan kode quotation, revisi, dan tautan publiknya. Tombol **Sinkron ulang** selama tiket belum `done` |
| 8 | Tes: parser respons, aksi dengan API tiruan, dan memastikan token tidak bocor |

**Keputusan bawaan (bisa diubah pemilik):** yang boleh mengambil quotation adalah siapa pun
yang boleh membuat tiket. Harga per komponen disimpan sebagai catatan, tapi **tidak** dibuat
jadi baris Rincian Biaya, karena Rincian Biaya saat ini hanya ada untuk tiket service.

## 4. Revisi dan selisih barang (tahap 2)

Prinsipnya: **quotation = apa yang dijual** (harga, sumbernya e-commerce). **Tiket = apa yang
diterima dan dipasang** (sumbernya pengecekan teknisi). Keduanya disimpan, dan selisihnya
ditampilkan. Tidak ada sisi yang menimpa sisi lain secara diam-diam.

### 4.1 Webhook e-commerce → tiket

```
POST {ticketing}/api/integrations/ecommerce/quote-events
X-Timestamp: <detik unix>
X-Signature: hex(HMAC-SHA256(TICKETING_WEBHOOK_SECRET, "<timestamp>.<rawBody>"))
{ "event": "quote.revised" | "quote.dp_marked" | "quote.closed", "code": "...", "revision": 4, "occurredAt": "..." }
```

- Isinya hanya penanda, tanpa komponen dan tanpa data customer. Sistem tiket menarik sendiri
  isinya lewat endpoint baca.
- Tiket menolak tanda tangan yang salah, dan menolak `X-Timestamp` yang lebih dari 5 menit
  dari sekarang (supaya pesan lama tidak bisa diputar ulang).
- Kode yang tidak tertaut ke tiket mana pun diabaikan dengan jawaban 200.
- Untuk kode yang tertaut: tiket ditandai "quotation sudah direvisi (rev N), belum disinkron"
  dan teknisi diberi notifikasi.

### 4.2 Tiket → e-commerce

```
POST {ecommerce}/api/integrations/ticketing/pc-build-quotes/{code}/ticket-events
Authorization: Bearer <token>
X-Integration-Token: <token>
Idempotency-Key: <id kejadian di tiket>
{ "type": "ticket_linked" | "mismatch_reported" | "mismatch_resolved" | "build_completed",
  "ticketCode", "ticketUrl", "revision", "message",
  "lines": [{ "name", "accurateCode", "check": "missing" | "different", "received", "note" }] }
```

Dikirim setelah perubahan di tiket tersimpan. Kalau gagal dikirim, simpan tiket tetap
berhasil; pengiriman dicoba ulang dan kegagalannya dicatat di log server.

### 4.3 Sisi tiket

| # | Pekerjaan |
|---|---|
| 9 | Tombol **Sinkron ulang** menampilkan perbedaan (+ ditambah / − dihapus / ~ jumlah berubah) sebelum disimpan. Diizinkan selama tiket belum `done`. Tercatat di Log Aktivitas, dan teknisi diberi notifikasi |
| 10 | **Cek terima barang** per komponen, termasuk bawaan customer: Sesuai / Tidak sesuai (barang yang diterima dipilih dari katalog + catatan) / Belum ada. SN dicatat. Selisih mengirim `mismatch_reported` dan memberi notifikasi ke sales dan koordinator |
| 11 | Selisih selesai lewat **revisi + sinkron**, atau **disetujui tanpa revisi** dengan catatan wajib. Setelah itu `mismatch_resolved` dikirim |
| 12 | **`done` ditolak** selama ada komponen yang belum dicek atau selisih yang terbuka. Saat `done`, `build_completed` dikirim |
| 13 | Penerima webhook 4.1: cek tanda tangan, cek umur timestamp, abaikan kode yang tidak tertaut |

Belum diputuskan pemilik:
- selisih yang terbuka memblokir `done` (usulan) atau cukup peringatan;
- siapa yang boleh menyetujui penggantian tanpa revisi;
- SN wajib atau opsional;
- aturan revisi quotation yang sudah closing (poin D di prompt e-commerce).
