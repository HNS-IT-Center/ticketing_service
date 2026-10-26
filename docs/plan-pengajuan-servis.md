# Rancangan — Pengajuan Servis Mandiri & Service Eksternal

Status: **rancangan, belum ada kode.** Ditulis 2026-10-26 untuk diputuskan pemilik sebelum dibangun.
Mencakup dua item kartu yang konsepnya belum ada: *customer membuat tiket sendiri* dan
*flow service eksternal (jadwal kedatangan diinformasikan teknisi)*.

---

## 1. Ringkasnya

Customer yang **sudah punya akun di web e-commerce** (hnsitcenter.id) mengajukan servis dari
halaman akunnya. Pengajuan itu masuk ke ticketing sebagai **Pengajuan**, bukan langsung tiket.
Staf toko memeriksanya, menunjuk teknisi, dan **menetapkan jadwal kedatangan**. Customer melihat
jadwal itu di halaman akunnya dan menerima pemberitahuan. Saat unit benar-benar ditangani, pengajuan
**diubah menjadi tiket biasa** dan berjalan dengan alur yang sudah ada.

```
 E-COMMERCE (akun customer)          TICKETING (staf)
 ─────────────────────────           ───────────────────────────────────────────
 Profil → tab "Servis Saya"
   └─ Ajukan Servis ──── API ──▶  Pengajuan [Menunggu]  → bel notifikasi toko
                                      │
                                      ├─ Tolak (alasan) ─────────────▶ [Ditolak]
                                      │
                                      └─ Terima: teknisi + jadwal ───▶ [Terjadwal]
   status + jadwal  ◀─── API ─────────┘        │  (bisa dijadwal ulang)
   + email / WhatsApp                           │
                                               ▼
                                     Unit diterima / teknisi tiba
                                               │
                                               └─ "Jadikan Tiket" ──▶ Ticket [waiting]
   link pelacakan tiket ◀───────────────────────────────── alur tiket seperti biasa
```

## 2. Kenapa bentuknya begini

**Akun customer tetap milik e-commerce.** SSO HNS khusus staf (`HNS-SSO-CLIENT.md` §3.6:
*"Jangan memasukkan pelanggan atau pengguna publik ke SSO"*), dan ticketing sendiri sudah tidak
punya portal customer — role Customer tidak bisa login dan `app/customer/` tidak berisi halaman.
E-commerce sudah punya semuanya: daftar, login email/password dan Google, verifikasi email, lupa
password, halaman profil bertab. Membangun ulang itu di ticketing berarti dua sistem akun untuk
orang yang sama.

**Customer tidak pernah login ke ticketing.** Formulirnya ada di e-commerce; server e-commerce
memanggil API ticketing atas nama customer yang sudah ia verifikasi. Ticketing tetap aplikasi staf.

**Pengajuan ≠ tiket.** Tiket berarti unit sudah ada di tangan toko — kode tiket, KPI, waktu kerja,
dan leaderboard semuanya berangkat dari situ. Pengajuan yang ditolak, dibatalkan, atau tidak
pernah datang tidak boleh menghabiskan kode tiket atau masuk statistik. (Kode tiket yang hilang di
tengah urutan pun sudah pernah menimbulkan masalah — BL34.)

## 3. "Service eksternal" — dua mode, satu alur

Konsepnya belum ada, jadi rancangan ini menyiapkan keduanya dalam satu model; pemilik tinggal
memilih mana yang diaktifkan.

| Mode | Artinya | "Jadwal kedatangan" | Yang dibutuhkan tambahan |
|---|---|---|---|
| **Antar ke toko** | customer membawa unit ke toko | kapan customer datang | — |
| **Teknisi datang** (on-site) | teknisi ke rumah/kantor/warnet customer | kapan teknisi tiba | alamat, area layanan, biaya akomodasi |

Mode on-site punya dasar di data yang ada: katalog Accurate sudah memuat item
`2507000017 AKOMODASI SERVICE`, dan `DeviceType` punya `Company` serta `Internet_Cafe`. Biaya
akomodasi cukup menjadi satu baris **Jasa service** di Rincian Biaya — Daftar Jasa dan pemetaan kode
Accurate-nya sudah ada.

## 4. Status pengajuan

| Status | Artinya | Siapa yang mengubah |
|---|---|---|
| `submitted` — Menunggu | baru masuk, belum ditangani | (customer mengajukan) |
| `scheduled` — Terjadwal | diterima, ada teknisi dan jadwal | staf toko |
| `rejected` — Ditolak | tidak bisa dilayani, wajib alasan | staf toko |
| `cancelled` — Dibatalkan | customer membatalkan sebelum hari H | customer |
| `no_show` — Tidak datang | jadwal lewat tanpa kedatangan | staf toko |
| `converted` — Jadi tiket | unit ditangani, tiket dibuat | staf toko |

Jadwal ulang tidak menjadi status sendiri: jadwal yang diubah tetap `scheduled`, dan setiap
perubahan tercatat di riwayat dan diberitahukan ke customer.

## 5. Data (ticketing)

```
ServiceRequest
  id, request_code (REQ-NGW-2611-0001)
  source = "ecommerce", external_customer_id   ← id customer di e-commerce
  customer_name, customer_email, customer_phone  ← salinan saat mengajukan
  store_location_id
  ticket_type        service | cleaning | upgrade | pc_build   (klaim garansi: lihat §9)
  mode               drop_off | on_site
  device_name, device_sku, device_catalog_item_id   ← dari katalog Accurate, seperti tiket
  complaint (Text)
  address (Text)?    hanya on_site
  preferred_date?, preferred_slot?   ← usulan customer, bukan janji
  status
  scheduled_at?, schedule_note?, assigned_technician_id?
  rejection_reason?
  ticket_id?         ← diisi saat "Jadikan Tiket"
  created_at, updated_at

ServiceRequestEvent      riwayat: siapa, kapan, dari status apa ke apa, catatan
ServiceRequestPhoto      foto dari customer (R2), maks 5
```

Pola yang sudah ada dipakai ulang: kode berformat seperti `RmaCase.rma_code`, riwayat seperti
`RmaEvent`, unit dari katalog seperti `Ticket.device_sku` (W4-1).

## 6. API ticketing ↔ e-commerce

Server-ke-server saja. Kuncinya disimpan di env kedua aplikasi (`TICKETING_API_KEY`), tidak pernah
sampai ke browser. E-commerce bertanggung jawab memastikan customernya login dan emailnya
terverifikasi sebelum memanggil.

| Endpoint | Gunanya |
|---|---|
| `POST /api/v1/service-requests` | buat pengajuan. Header `Idempotency-Key` supaya klik ganda tidak membuat dua |
| `GET /api/v1/service-requests?customer={id}` | daftar pengajuan milik satu customer, untuk tab "Servis Saya" |
| `GET /api/v1/service-requests/{id}` | detail + jadwal + riwayat yang boleh dilihat customer |
| `POST /api/v1/service-requests/{id}/cancel` | customer membatalkan, hanya selama `submitted`/`scheduled` |
| `GET /api/v1/stores` | daftar toko untuk pilihan di formulir |

Batasan: maksimal **3 pengajuan aktif** per customer, foto maksimal 5 dan hanya gambar. Catatan
internal staf, nama vendor, dan harga modal tidak pernah keluar lewat API ini — aturan yang sama
dengan halaman pelacakan publik.

## 7. Layar

**E-commerce**
- `/profile/servis` — tab baru di sebelah *Profil Saya · Quotation · Rakitan Tersimpan*: daftar
  pengajuan dengan status dan jadwal, tombol **Ajukan Servis**, tombol **Batalkan**.
- Formulir: jenis servis → mode → toko → unit (cari di katalog, atau ketik) → keluhan → foto →
  alamat (on-site) → usulan tanggal.
- Setelah jadi tiket: tautan ke halaman pelacakan tiket yang sudah ada (`/{tanggal}/{token}`).

**Ticketing**
- Sidebar **Tiket → Pengajuan**: antrean per toko, badge jumlah `submitted`. Admin melihat semua
  toko, koordinator tokonya sendiri.
- Detail pengajuan: data customer, unit, keluhan, foto; aksi **Terima & Jadwalkan** (teknisi +
  tanggal/jam + catatan), **Jadwal Ulang**, **Tolak**, **Tidak Datang**, **Jadikan Tiket**.
- "Jadikan Tiket" membuka formulir buat tiket yang sudah terisi dari pengajuan.
- Teknisi: kunjungan/kedatangan yang ditugaskan tampil di dashboard dan di **Schedule**.
- Bel notifikasi: pengajuan baru → staf toko; penugasan → teknisi.

## 8. Memberi tahu customer

Tiga jalur, saling melengkapi:
1. **Halaman akun e-commerce** — selalu menampilkan status dan jadwal terbaru.
2. **Email** — saat diterima/dijadwal, dijadwal ulang, ditolak. Dari ticketing (sudah punya Resend
   dan `EMAIL_MILESTONES`) atau dari e-commerce — **perlu diputuskan** (§9).
3. **WhatsApp** — tombol di layar staf yang membuka chat dengan pesan jadwal siap kirim, seperti
   `CustomerWhatsAppActions` yang sudah ada. Teknisi yang "menginformasikan", sesuai permintaan.

## 9. Yang perlu diputuskan pemilik

1. **Mode mana yang dibuka** — antar ke toko, teknisi datang, atau keduanya?
2. **Siapa yang menjadwalkan** — teknisi toko itu sendiri, koordinator, atau keduanya?
3. **Jenis servis apa yang boleh diajukan online.** Usulan: service, cleaning, upgrade, rakit PC.
   Klaim garansi lebih aman tetap di toko, karena butuh pemeriksaan unit dan faktur asli.
4. **Customer memilih tanggal atau hanya mengusulkan?** Usulan: mengusulkan, toko yang menetapkan.
5. **Email dikirim oleh siapa** — ticketing atau e-commerce?
6. **On-site**: area layanan, biaya akomodasi tetap atau per jarak, minimal pemesanan.
7. **Batas waktu tanggap**: berapa lama pengajuan boleh `submitted` sebelum ditandai terlambat
   (pola SLA yang sama dengan antrean RMA).

## 10. Tahapan

| Fase | Isi | Butuh |
|---|---|---|
| **1. Ticketing** | model + migration, API, antrean Pengajuan, jadwal, jadikan tiket, notifikasi staf | keputusan §9 no. 1–4 |
| **2. E-commerce** | tab "Servis Saya", formulir, daftar status, batalkan | Fase 1 + kunci API di kedua env |
| **3. Pemberitahuan & on-site** | email, tombol WhatsApp, alamat + biaya akomodasi, tampilan jadwal teknisi | keputusan §9 no. 5–7 |

Fase 1 bisa diuji tanpa e-commerce: API-nya dipanggil dari test dan dari skrip, dan staf bisa
melihat antreannya. Fase 2 dikerjakan di repo `ecommerce-hns`.

## 11. Risiko yang sudah terlihat

- **Spam/pengajuan palsu** — dibatasi karena hanya akun e-commerce terverifikasi yang bisa
  mengajukan, plus batas 3 pengajuan aktif dan idempotency key.
- **Data pribadi** — alamat rumah hanya untuk on-site, hanya terlihat oleh staf toko itu, tidak
  pernah ikut ke halaman pelacakan publik.
- **Dua sistem, satu customer** — ticketing menyimpan `external_customer_id` dan salinan nama/nomor
  saat mengajukan; kalau customer mengubah profil di e-commerce, pengajuan lama tidak ikut berubah
  (sama seperti harga dan poin yang disalin ke baris biaya).
- **Rilis** — Fase 1 menambah migration; aturan tetap berlaku: `migrate deploy` ke production dulu,
  baru push.
