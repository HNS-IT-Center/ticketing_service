# Rencana: kelayakan klaim diputuskan RMA, bukan teknisi

**Status:** menunggu persetujuan. **Belum ada kode yang ditulis.**
**Disepakati:** 2026-09-25.

---

## 1. Perubahan alur

**Sekarang** — teknisi punya dua pintu keluar dari `on_progress`:

```
on_progress ─┬─→ rma_process        (serahkan ke RMA)
             └─→ done + claim_eligible=false + alasan   (teknisi memutuskan tidak layak)
```

**Menjadi** — teknisi hanya satu pintu; kelayakan pindah ke meja RMA:

```
on_progress ──→ rma_process  (serahkan ke RMA, foto kerusakan WAJIB)

lalu di meja RMA:
  pending_verification ─┬─→ verified ──→ submitted_to_vendor ──→ ...
                        ├─→ on_hold
                        ├─→ ineligible   (BARU: tidak layak, alasan + foto wajib)
                        └─→ cancelled
  verified ─────────────┴─→ ineligible   (BARU)
```

`ineligible` bersifat terminal untuk case, menulis `claim_eligible=false` +
`ineligibility_reason`, dan mengembalikan tiket ke `done` supaya rantai serah terima jalan —
persis seperti `closed` dan `cancelled` sekarang.

**Kenapa nilai baru, bukan `rejected`:** `RmaDecision.rejected` berarti *vendor* yang menolak
setelah unit dikirim. "Tidak layak" berarti tidak pernah sampai vendor. Dua peristiwa berbeda
yang harus bisa dibedakan di laporan — `FLOW.md` § 5 sudah mensyaratkan itu.

**Bedanya dengan `cancelled`:** `cancelled` = klaim dibatalkan (customer menarik, unit
diambil kembali). `ineligible` = sudah diperiksa dan memang di luar cakupan garansi. Hanya
`ineligible` yang menyalakan `claim_eligible=false` dan memunculkan banner kuning di halaman
publik.

## 2. Perubahan state machine

`lib/rma/state-machine.ts`:

| Perubahan | Isi |
|---|---|
| Field baru | `ineligibility_reason` masuk `RmaTransitionField` dan `RmaTransitionInput` |
| Transisi baru | `pending_verification → ineligible`, `requires: ["ineligibility_reason"]` |
| Transisi baru | `verified → ineligible`, `requires: ["ineligibility_reason"]` |
| Terminal | `ineligible` masuk `RMA_TERMINAL_STATUSES` |
| Melepas tiket | `ineligible` masuk `RMA_STATUSES_RELEASING_TICKET` |

`prisma/schema.prisma`: `ineligible` ditambahkan ke `enum RmaStatus`. Perlu `prisma db push`
lokal; untuk Supabase nanti `ALTER TYPE "RmaStatus" ADD VALUE 'ineligible'`.

⚠️ Nilai enum Postgres **tidak bisa dihapus**. Kalau namanya mau diubah, putuskan sekarang.

## 3. Daftar file

### Inti

| File | Perubahan |
|---|---|
| `prisma/schema.prisma` | `ineligible` di `RmaStatus` |
| `lib/rma/state-machine.ts` | 2 transisi + 1 field + 2 daftar (lihat §2) |
| `lib/rma/queue.ts` | `RMA_STAGE_SLA` wajib punya entri `ineligible` (Record-nya exhaustive). Query baru untuk tab "menunggu pemeriksaan teknisi" |
| `lib/kpi.ts` | Hapus cabang ketiga `EARNING_STATUS_LOG_FILTER` dan parameter `claimEligible` di `performanceEffect` — keduanya jadi mati |
| `lib/rma/public-status.ts` | `IN_PROGRESS_HEADLINE` wajib punya entri `ineligible` (Record exhaustive) |

### Server actions

| File | Perubahan |
|---|---|
| `app/actions/rma.ts` | Handover: foto kerusakan jadi **wajib**, terpisah dari `invoice_files`. `transitionRmaAction`: tangani `ineligible` — validasi foto, tulis `claim_eligible=false` + alasan ke `TicketWarrantyDetail`, lepas tiket ke `done` |
| `app/actions/technician.ts` | Guard 3 jadi "satu pintu": klaim di `on_progress` → `done` **ditolak**, arahkan ke handover. Hapus penulisan `claim_eligible`. Hapus argumen ketiga `performanceEffect` |
| `app/actions/admin.ts` | Guard diubah maknanya: `warranty_claim` dari `waiting`/`on_progress` → `done` **ditolak sepenuhnya** (sekarang: diminta alasan). Hapus penulisan `claim_eligible` |

### UI

| File | Perubahan |
|---|---|
| `app/technician/tickets/[id]/StatusUpdater.tsx` | Hapus tombol + modal "Tidak layak klaim". Tambah `FileUpload` foto kerusakan (wajib) di form handover |
| `app/admin/tickets/[id]/AdminStatusPanel.tsx` | Hapus tombol "Tidak Layak Klaim" + modal alasan yang baru dibuat di `d983b53` |
| `app/rma/cases/[id]/RmaActionPanel.tsx` | Tombol `ineligible` muncul otomatis dari tabel transisi, tapi perlu field alasan + `FileUpload` |
| `components/rma/RmaStatusCard.tsx` | Entri `RMA_STATUS_META` untuk `ineligible`. Ada fallback, jadi tidak gagal compile — tapi tanpa ini labelnya tampil mentah, persis bug `rma_process` dulu |
| `app/rma/dashboard/page.tsx` | Tab read-only "Menunggu Pemeriksaan Teknisi": tiket `warranty_claim` berstatus `waiting`/`on_progress`, tanpa `RmaCase` |

### Dokumen

`FLOW.md` § 5 (dua pintu keluar → satu), `CLAUDE.md` (status flow + aturan KPI),
`docs/rma-test-checklist.md` (tulis ulang D dan B-02).

## 4. Test

### Dihapus

| Berkas | Blok | Jumlah |
|---|---|---|
| `lib/kpi.test.ts` | Seluruh pengujian argumen `claimEligible` | ±8 |
| `app/actions/technician.test.ts` | `KPI — an ineligible claim is credited like a handover` | 4 |

### Ditulis ulang

| Berkas | Blok | Jadi |
|---|---|---|
| `app/actions/technician.test.ts` | `guard 3 — leaves on_progress only two ways` (6) | "hanya satu pintu": `done` ditolak apa pun alasannya |
| `app/actions/admin.test.ts` | `a warranty claim closed from the admin portal must say why` (9) | "ditolak sepenuhnya", tanpa jalur alasan |
| `app/actions/admin.test.ts` | Blok KPI yang mengkredit klaim tidak layak | Tidak ada kredit dari sisi admin sama sekali |
| `lib/rma/public-status.test.ts` | `ALL_RMA_STATUSES` | Tambah `ineligible`. Pengujian banner tetap berlaku — kuncinya `claim_eligible`, bukan siapa yang menetapkan |

### Ditambah

- `lib/rma/state-machine.test.ts` — 2 transisi baru di `SPEC_TRANSITIONS`, alasan wajib,
  `ineligible` terminal dan melepas tiket, dan **tidak** bisa dicapai dari `in_vendor_process`
  ke atas (unit sudah terlanjur dikirim).
- `app/actions/rma.test.ts` — handover tanpa foto ditolak; `ineligible` menulis
  `claim_eligible=false` + alasan; tiket kembali ke `done`; teknisi **tidak** dikredit lagi
  saat itu (sudah dibayar di handover).
- `app/actions/rma.test.ts` — `validForm()` yang sudah ada perlu tambahan foto, kalau tidak
  seluruh 35 test handover gagal.

Perkiraan akhir: ±12 test dihapus, ±19 ditulis ulang, ±15 baru.

## 5. Yang perlu Anda putuskan

1. **`on_hold → ineligible`?** Rencana ini hanya menambahkan dari `pending_verification` dan
   `verified`, sesuai instruksi. Tapi case yang ditahan karena dokumen kurang lalu ternyata
   memang di luar garansi saat ini harus lewat `pending_verification` dulu. Ditambahkan atau
   tidak?
2. **Nama enum `ineligible`.** Tidak bisa dihapus setelah masuk Postgres. Alternatif:
   `not_eligible`, `rejected_by_desk`, `tidak_layak`.
3. **Foto wajib saat handover: berapa minimal, tipe apa?** Usulan: minimal 1, gambar atau
   video, maksimal 5 — mengikuti `FileUpload` yang sudah ada di intake.
4. **Unit yang jelas tidak rusak.** Alur baru mewajibkan teknisi tetap menyerahkan ke RMA
   walau unitnya jelas normal atau jelas rusak karena pemakaian. Itu memang yang diinginkan,
   atau teknisi perlu jalan keluar untuk kasus yang tidak perlu dilihat RMA?

## 6. Urutan & dampak QC

Dikerjakan **setelah QC putaran ini selesai**. Urutan aman:

1. Schema + state machine + test murni (tidak menyentuh UI)
2. Server actions + test integrasi
3. UI
4. Dokumen + tulis ulang test case D dan B-02

Data lokal aman: 5 case di `rma_process`, belum ada satu pun `ineligible`, jadi tidak ada
migrasi data. `claim_eligible` semua masih `true`.

Setelah selesai, bagian **D dan B-02 harus diuji ulang penuh**, ditambah bagian C (form
handover berubah karena foto wajib) dan F (panel aksi RMA bertambah tombol).
