# MinIO — pengganti Cloudflare R2 untuk development

Supaya development tidak perlu kredensial R2 sama sekali, dan tidak perlu menyentuh bucket
produksi.

## Kenapa bukan `STORAGE_DRIVER=local` saja

`STORAGE_DRIVER=local` menulis ke `public/uploads/` dan tetap berguna kalau sekadar butuh
upload jalan. Tapi ia **memotong seluruh kode S3** — `lib/r2.ts` keluar lebih awal sebelum
SDK tersentuh.

Artinya, dengan driver itu, hal-hal berikut tidak pernah diuji sampai masuk produksi:

- bentuk object key dan apakah ada karakter yang bermasalah
- `ContentType` yang dikirim (salah di sini = PDF ter-download alih-alih tampil di browser)
- URL publik yang terbentuk, dan apakah benar-benar bisa diakses tanpa login
- perilaku bucket yang tidak public-read
- error path dari SDK (kredensial salah, bucket tidak ada, koneksi putus)

MinIO menjalankan **jalur kode yang sama persis dengan produksi** — SDK yang sama, perintah
`PutObject` yang sama, URL publik yang dibentuk dengan cara yang sama. Bedanya cuma endpoint.

## Setup

### 1. Jalankan container

```bash
docker run -d --name hns-minio \
  -p 127.0.0.1:9000:9000 -p 127.0.0.1:9001:9001 \
  -e MINIO_ROOT_USER=hnsdev -e MINIO_ROOT_PASSWORD=hnsdevsecret123 \
  -v hns-minio-data:/data \
  --restart unless-stopped \
  quay.io/minio/minio:latest server /data --console-address ":9001"
```

> **Pakai `quay.io`, bukan Docker Hub.** `docker pull minio/minio` dari Docker Hub ditolak
> dengan *"pull access denied"* di mesin ini. `quay.io/minio/minio` adalah registry resmi
> MinIO yang lain dan berjalan normal.

Port di-bind ke `127.0.0.1` saja, jadi tidak terekspos ke jaringan. Data disimpan di volume
`hns-minio-data`, jadi selamat dari `docker rm`.

### 2. Isi `.env.local`

```env
# Kosongkan / komentari STORAGE_DRIVER — kalau masih "local", MinIO tidak akan dipakai
# STORAGE_DRIVER=local

R2_ENDPOINT="http://127.0.0.1:9000"
R2_ACCESS_KEY_ID="hnsdev"
R2_SECRET_ACCESS_KEY="hnsdevsecret123"
R2_BUCKET_NAME="hns-attachments"
NEXT_PUBLIC_R2_PUBLIC_URL="http://127.0.0.1:9000/hns-attachments"
```

`NEXT_PUBLIC_R2_PUBLIC_URL` **wajib memuat nama bucket**, karena MinIO dialamatkan path-style
(`<endpoint>/<bucket>/<key>`).

### 3. Buat bucket + policy

```bash
npm run setup:minio
```

Idempoten, aman diulang. Skripnya membuat bucket kalau belum ada, lalu memasang policy
anonymous read — sama seperti bucket R2 yang public — dan membaca policy-nya kembali untuk
memastikan benar-benar terpasang.

Skrip ini **menolak berjalan terhadap endpoint non-lokal**. Ia memberi akses baca publik ke
bucket, dan itu tidak boleh sampai kena bucket sungguhan.

### 4. Jalankan aplikasi

```bash
npm run dev
```

Upload sekarang masuk ke MinIO. Konsol web di **http://localhost:9001**
(`hnsdev` / `hnsdevsecret123`) untuk melihat isinya, seperti dashboard R2.

## Perubahan di kode

Hanya `lib/r2.ts`, dan **produksi tidak terpengaruh**:

- `R2_ENDPOINT` kalau diisi menggantikan endpoint R2. Kalau kosong, perilakunya persis
  seperti sebelumnya.
- `forcePathStyle` ikut `R2_ENDPOINT`, bukan dinyalakan untuk semua. MinIO memang tidak bisa
  virtual-host style (`bucket.localhost` tidak me-resolve), tapi tidak ada alasan mengubah
  cara produksi mengalamatkan bucket-nya.
- Guard: kalau `NODE_ENV=production` dan endpoint-nya bukan `https://`, upload ditolak.
  Endpoint plaintext berarti file **dan kredensial yang menandatanganinya** lewat jaringan
  tanpa enkripsi. Dicek saat client dibangun, bukan saat import, supaya `next build` (yang
  jalan dengan `NODE_ENV=production`) tidak ikut patah.

## Operasional

| Keperluan | Perintah |
|---|---|
| Hidupkan lagi setelah reboot | `docker start hns-minio` (sudah `--restart unless-stopped`) |
| Lihat isi bucket | http://localhost:9001 |
| Kosongkan semua upload | Hapus objek lewat konsol, atau `docker rm -f hns-minio && docker volume rm hns-minio-data` lalu ulangi setup |
| Kembali ke driver filesystem | Set `STORAGE_DRIVER=local` di `.env.local` |
| Kembali ke R2 sungguhan | Hapus `R2_ENDPOINT`, isi kredensial R2 yang asli |

## Yang masih berbeda dari R2

- **Tidak ada CDN/cache.** R2 di depan Cloudflare punya caching dan header-nya berbeda.
- **Latency nol.** Upload besar terasa instan di lokal; di produksi tidak.
- **Tidak menguji kuota, biaya, atau rate limit** R2.
- **Lifecycle rules dan CORS** tidak disetel di sini. Kalau nanti dipakai di produksi, perlu
  diuji tersendiri.
