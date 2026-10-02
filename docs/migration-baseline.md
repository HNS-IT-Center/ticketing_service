# Baseline migration — dan cara menerapkannya ke produksi

Ditulis 2026-10-02, setelah baseline dibuat dan diterapkan di database lokal.

`docs/rma-deploy.md` § A menjelaskan prosedur ini untuk era Supabase/Postgres, ketika tabel
RMA belum ada. Dokumen itu sudah usang di bagian 3a/3b. Yang berlaku sekarang ada di sini.

---

## Kenapa ini dikerjakan

Produksi sempat mati pada 2026-10-02. Penyebabnya bukan kode yang salah: kolom
`RmaCase.hold_reason_code` naik ke `main` dan ter-deploy, sementara database produksi belum
punya kolomnya. Setiap halaman detail tiket teknisi menjawab 500, dan transisi RMA gagal.

Akar masalahnya bukan urutan deploy yang keliru itu sendiri — melainkan **tidak adanya
mekanisme apa pun** untuk menyalurkan perubahan schema. Repo memakai `prisma db push`, yang
tidak meninggalkan riwayat, jadi setiap kolom baru harus diketik tangan ke produksi oleh orang
yang kebetulan ingat. Selama itu tidak berubah, kejadian yang sama akan terulang.

Dengan baseline ini, perubahan schema berikutnya cukup `prisma migrate deploy`.

---

## Apa yang sudah ada di repo

| Migration | Isi |
|---|---|
| `00000000000000_baseline` | 25 tabel, seluruh schema seperti yang **benar-benar ada** di database per 2026-10-02 — termasuk `hold_reason_code` dan, sengaja, `emoji DEFAULT '?'` yang salah |
| `20261002000100_drop_usertitle_emoji_default` | Membuang default `emoji` yang rusak |

Baseline merekam kondisi nyata, bukan kondisi ideal. Itu disengaja: kalau cacat lama
dimasukkan diam-diam ke dalam baseline sebagai "sudah benar", selisihnya tersembunyi permanen
— persis yang diperingatkan `rma-deploy.md` § 2b. Perbaikannya lewat migration tersendiri,
yang bisa dibaca dan di-review.

### Tentang `UserTitle.emoji`

Schema dulu menulis `@default("🏆")`; database menyimpan `'?'`. Ini **bukan** salah
konfigurasi dan tidak bisa diperbaiki dengan mengatur charset.

MariaDB menyimpan ekspresi DEFAULT kolom memakai `character_set_system`, yang bernilai
`utf8mb3`. U+1F3C6 TROPHY berada di luar BMP, jadi tidak muat, dan server menggantinya dengan
`?`. Dibuktikan langsung: `ALTER ... DEFAULT _utf8mb4 0xF09F8F86` dari klien yang sepenuhnya
utf8mb4 tetap menghasilkan `DEFAULT '?'`.

Karena itu default-nya dibuang, bukan dibetulkan. Tidak ada yang bergantung padanya — kedua
tempat yang membuat `UserTitle` (`lib/performance.ts:151` dan `:169`) mengisi `emoji` secara
eksplisit. Baris yang sudah ada tidak tersentuh: data baris memang utf8mb4 dan menyimpan 🛡️
dengan benar; hanya metadata kolomnya yang tidak.

---

## Menerapkan ke produksi

Produksi **belum** di-baseline. Sampai itu dikerjakan, `prisma migrate deploy` di sana akan
mencoba membuat ulang 25 tabel yang sudah ada.

### 1. Backup

Lewat tunnel, sebelum apa pun:

```bash
ssh -p 65002 -N -L 3309:127.0.0.1:3306 <SSH_USER>@<SSH_HOST>

mysqldump -h 127.0.0.1 -P 3309 -u <DB_USER> -p --single-transaction --routines \
  <DB_NAME> > pre-baseline-$(date +%F).sql
```

### 2. ⛔ Gerbang verifikasi — jangan dilewati

`migrate resolve --applied` adalah pernyataan sepihak: ia bilang "schema ini sudah ada" tanpa
memeriksa apa pun. Kalau keliru, selisihnya tersembunyi permanen.

```bash
DATABASE_URL="mysql://<DB_USER>:<DB_PASS>@127.0.0.1:3309/<DB_NAME>" \
  npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
```

Hasil yang **benar** hanya satu baris ALTER, yaitu default `emoji`:

```sql
ALTER TABLE `UserTitle` MODIFY `emoji` VARCHAR(191) NOT NULL;
```

- **Persis itu saja** → lanjut ke langkah 3.
- **Ada DDL lain** → **BERHENTI.** Produksi menyimpang dari lokal: ada `db push` yang tidak
  masuk git, SQL manual, atau commit yang belum ter-deploy. Pahami selisihnya dulu. Jangan
  `resolve`, dan jangan "membetulkan" dengan `db push` — itu menghapus buktinya.
- **Kosong sama sekali** → berarti seseorang sudah membuang default itu di produksi. Tetap
  lanjut; langkah 4 akan menjadi no-op.

### 3. Tandai baseline

Hanya menulis ke `_prisma_migrations`; tidak mengubah tabel mana pun.

```bash
DATABASE_URL="..." npx prisma migrate resolve --applied 00000000000000_baseline
```

### 4. Terapkan migration yang tertunda

```bash
DATABASE_URL="..." npx prisma migrate deploy
DATABASE_URL="..." npx prisma migrate status    # harus: "Database schema is up to date!"
```

### 5. Verifikasi akhir

```bash
DATABASE_URL="..." npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
```

Harus menjawab `-- This is an empty migration.`

---

## Sesudah ini

Perubahan schema berikutnya tidak lagi diketik tangan ke produksi:

1. Ubah `prisma/schema.prisma`
2. `npx prisma migrate dev --name <nama>` di lokal — menghasilkan file migration
3. Review SQL-nya, commit
4. Di produksi: `npx prisma migrate deploy`, **sebelum** kode yang memakainya naik

⚠️ **Jangan pakai `prisma db push` lagi** terhadap database yang sudah di-baseline. Ia
mengubah tabel tanpa mencatat apa pun, sehingga riwayat migration berbohong — dan dari situ
masalah ini bermula.

⚠️ `prisma migrate dev` boleh dijalankan **hanya terhadap database lokal**. Ia dapat
me-reset database bila mendeteksi drift. Database lokal saat ini berisi salinan produksi,
jadi backup dulu, atau pakai database coretan terpisah.
