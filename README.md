# Cek Kondisi Rumah

Penilaian kondisi rumah otomatis dari foto. Pengguna mengunggah foto bagian rumah, AI (Claude) menilai 8 komponen bangunan dengan skor 1–5, lalu aplikasi menghitung indeks kondisi, tingkat kerusakan, kategori (Baik / Rusak Ringan / Sedang / Berat), serta prioritas perbaikan dan kisaran biaya. Setiap laporan disimpan dan bisa dibuka lagi.

## Tampilan

Halaman utama: unggah foto dan riwayat penilaian.

![Halaman utama dengan riwayat penilaian](docs/dashboard.png)

Laporan: indeks kondisi, analisis foto otomatis, prioritas perbaikan, dan rincian per komponen. Data pada screenshot adalah contoh.

![Laporan kondisi rumah](docs/laporan.png)

## Menjalankan

1. Salin `.env.example` menjadi `.env.local`, lalu isi **salah satu**:
   - `AI_GATEWAY_API_KEY` (Vercel AI Gateway), atau
   - `ANTHROPIC_API_KEY` (langsung ke Anthropic).
2. Jalankan aplikasi web:

   ```bash
   npm install
   npm run dev
   ```

3. (Opsional) Jalankan layanan analisis foto Python di terminal lain. Butuh Python ≥ 3.11 dan [uv](https://docs.astral.sh/uv/):

   ```bash
   npm run analyzer
   ```

   Layanan ini berjalan di http://127.0.0.1:8000 (`ANALYZER_URL`). Kalau tidak dijalankan, penilaian tetap berjalan tanpa analisis otomatis.

4. Buka http://localhost:3000.

Database SQLite dibuat otomatis di `data/penilaian.db`.

## Cara kerja

```
Browser: pilih foto → diperkecil ke JPEG 1568 px + thumbnail 360 px
   │  POST /api/penilaian (multipart)
   ▼
Server: validasi
   → analisis Python/OpenCV (kualitas foto, indikasi retak & noda, overlay)   [opsional]
   → Claude (output terstruktur, skema Zod; hasil analisis dikirim sebagai petunjuk)
   → normalisasi → hitung → simpan
   ▼
/penilaian/[id]: laporan
```

### Analisis foto otomatis (Python)

Folder `analyzer/` berisi layanan FastAPI + OpenCV dengan heuristik klasik, tanpa model terlatih:

| Pemeriksaan | Metode |
| --- | --- |
| Kualitas foto | Rasio ketajaman (gradien foto terhadap versi yang dikaburkan), kecerahan, resolusi → `baik`, `agak_buram`, `buram`, `gelap`, `terlalu_terang`, `resolusi_rendah` |
| Indikasi retak | Black-hat morfologi untuk garis gelap tipis → buang garis lurus panjang horizontal/vertikal (nat, kusen) → simpan komponen yang panjang dan memanjang |
| Indikasi noda/rembesan | Bercak yang lebih gelap dari latar sekitarnya (latar diperkirakan dengan median berjendela lebar) di permukaan terang |

Hasilnya dipakai di dua tempat: sebagai petunjuk di prompt AI, dan sebagai foto bertanda di laporan (merah untuk retak, garis tepi oranye untuk noda). Ambang batas ada di bagian atas `analyzer/analisis.py` dan baru diuji dengan gambar sintetis, jadi perlu dikalibrasi dengan foto rumah sungguhan.

```bash
npm run test:analyzer
```

- **AI hanya memberi skor dan temuan per komponen.** Semua angka turunan (indeks, persentase kerusakan, kategori, total biaya) dihitung oleh kode di `src/lib/penilaian.ts`, sehingga konsisten dan bisa diaudit.
- Bobot komponen: struktur 25, atap 20, dinding 15, lantai 10, plafon 10, pintu/jendela 8, utilitas 7, finishing 5.
- Skor → kerusakan: 5→0%, 4→10%, 3→30%, 2→55%, 1→85%. Komponen yang tidak terlihat di foto dikeluarkan dan bobot sisanya dinormalkan ulang.
- Kategori mengacu batas tingkat kerusakan bangunan PUPR: <10% Baik, ≤30% Rusak Ringan, ≤45% Rusak Sedang, >45% Rusak Berat.

### Model deteksi kerusakan (RF-DETR, opsional)

Model deteksi kerusakan dilatih dari foto rumah yang Anda beri label sendiri. Setelah terpasang, model ini menggantikan heuristik retak/noda pada foto bertanda, hasilnya dikirim ke AI sebagai petunjuk, dan dipakai sebagai saran label untuk foto baru. Model ini memakai [RF-DETR](https://github.com/roboflow/rf-detr) ukuran Nano–Large (Apache 2.0). Ukuran XL/2XL sengaja tidak dipakai karena lisensinya berbeda (PML).

Kelas (urutan tetap, lihat `src/lib/kelas-kerusakan.ts`): retak, rembesan/noda air, jamur/lumut, cat mengelupas, plester terkelupas, karat, kayu lapuk/rayap, keramik rusak, plafon rusak.

1. **Kumpulkan dan beri label foto** di http://localhost:3000/dataset. Saran kotak untuk retak dan rembesan dibuat otomatis bila layanan analisis berjalan. Tombol pintas: `1`–`9` kelas, `Del` hapus kotak, `A` terima saran, `Enter` simpan & lanjut, `Ctrl+Z` undo. Patokan awal: sekitar 100 kotak per kelas dari banyak rumah yang berbeda. Simpan juga foto tanpa kerusakan (tanpa kotak).
2. **Ekspor** dengan tombol di halaman dataset. Hasilnya ada di `data/dataset/ekspor/{train,valid,test}` dalam format COCO, dibagi 80/10/10 secara stabil.
3. **Latih** di GPU Modal (butuh akun Modal):

   ```bash
   cd detector
   uv sync
   uv run modal run modal_app.py --ukuran small --epochs 60
   ```

   Model tersimpan di `analyzer/model/kerusakan.pth` beserta `kerusakan.json`. Untuk uji kecil di CPU (lambat, hanya memastikan alurnya jalan): `uv run python latih.py --ukuran nano --epochs 1 --device cpu --keluar <folder-uji>`.
4. **Pakai** di layanan analisis:

   ```bash
   cd analyzer
   uv sync --extra deteksi
   ```

   Lalu restart `npm run analyzer`. Status model bisa dicek di http://127.0.0.1:8000/sehat.

Alat dataset tidak punya login, jadi di produksi alat ini nonaktif kecuali `DATASET_AKTIF=1`. Foto dataset disimpan lokal di `data/dataset/` dan tidak ikut ke git.

### Pemindaian 3D (Gaussian Splatting, opsional)

Di halaman laporan, pengguna bisa mengunggah video pendek (10–90 detik) satu ruangan. Video diproses menjadi model 3D Gaussian Splatting yang bisa diputar dan di-zoom langsung di laporan. **Tampilan ini visual saja dan tidak memengaruhi skor, indeks, atau kategori.**

```
Browser ──unggah video──▶ Vercel Blob
   │ POST /api/pemindaian
   ▼
Modal (GPU L4): ffmpeg → buang frame buram → COLMAP → gsplat (MCMC, maks. 400 rb gaussian) → PLY terkompresi
   ▲ GET /api/pemindaian/[id] (dicek tiap 10 detik)
   │ bila selesai: hasil disimpan ke Vercel Blob → viewer Spark (three.js) di laporan
```

Mengaktifkan:

1. Buat Blob store di Vercel, lalu isi `BLOB_READ_WRITE_TOKEN` di `.env.local`.
2. Deploy worker ke Modal (butuh akun Modal):

   ```bash
   cd splat
   uv sync
   uv run modal token new
   uv run modal secret create cek-rumah-splat SPLAT_TOKEN=<token-acak-panjang>
   uv run modal deploy app.py
   ```

3. Isi `MODAL_SPLAT_URL` dengan URL endpoint `mulai` dari hasil deploy, dan `SPLAT_TOKEN` dengan token yang sama.
4. Restart `npm run dev`.

Catatan:
- Biaya GPU dihitung per pemakaian di Modal. `MAKS_PEMINDAIAN_HARIAN` (default 5) membatasi jumlah job per 24 jam karena aplikasi belum punya login.
- Video dan model 3D disimpan sebagai blob publik dengan nama acak. Siapa pun yang tahu URL-nya bisa membukanya.
- Tes langkah tanpa GPU: `cd splat && uv run pytest`.

## Struktur

| Berkas | Isi |
| --- | --- |
| `src/lib/penilaian.ts` | Komponen, bobot, skala, perhitungan, normalisasi jawaban AI |
| `src/lib/ai.ts` | Prompt, skema Zod, pemanggilan model |
| `src/lib/db.ts` | Penyimpanan (libSQL/SQLite) |
| `src/lib/analisis.ts` | Klien layanan analisis Python |
| `analyzer/analisis.py` | Analisis citra (OpenCV) |
| `analyzer/main.py` | API FastAPI (`POST /analisis`, `GET /sehat`) |
| `analyzer/deteksi.py` | Prediksi model RF-DETR (opsional) |
| `detector/latih.py`, `detector/modal_app.py` | Pelatihan RF-DETR (lokal CPU / GPU Modal) |
| `src/lib/kelas-kerusakan.ts`, `src/lib/dataset.ts` | Kelas kerusakan, penyimpanan & ekspor dataset COCO |
| `src/app/dataset/`, `src/components/AlatLabel.tsx` | Halaman dataset dan alat label |
| `splat/app.py` | Worker Modal pemindaian 3D (image GPU, endpoint `mulai` dan `status`) |
| `splat/pipeline.py` | Langkah pemindaian: pemilihan frame, validasi, perintah COLMAP/gsplat |
| `src/lib/splat.ts` | Klien worker Modal |
| `src/components/Pemindaian3D.tsx`, `ViewerSplat.tsx` | Unggah video, status, viewer 3D |
| `src/app/api/penilaian/route.ts` | Endpoint penilaian |
| `src/components/FormPenilaian.tsx` | Unggah foto & data bangunan |
| `src/components/Laporan.tsx` | Tampilan laporan |
| `prototipe/` | Prototipe awal satu file HTML |

## Deploy

Di hosting serverless (mis. Vercel), file SQLite lokal tidak bertahan. Isi `DATABASE_URL` dan `DATABASE_AUTH_TOKEN` dengan database libSQL (mis. Turso). Kodenya tidak perlu diubah.

Layanan Python di-deploy terpisah (mis. container dengan `uv run uvicorn main:app --host 0.0.0.0`). Setelah itu isi `ANALYZER_URL` dengan alamatnya. Layanan ini belum punya autentikasi, jadi tempatkan di jaringan privat atau tambahkan token sebelum diekspos ke internet.

## Batasan MVP

- Belum ada login, jadi semua orang melihat riwayat yang sama dan belum ada pembatasan jumlah permintaan. Tambahkan keduanya sebelum dibuka untuk umum.
- Biaya masih perkiraan AI, belum memakai tabel harga satuan.
- Foto asli tidak disimpan, hanya thumbnail di database.
- Format HEIC (foto iPhone) belum didukung. Pengguna perlu memakai JPG/PNG/WebP.
