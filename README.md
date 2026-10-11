# Cek Kondisi Rumah

Penilaian kondisi rumah otomatis dari foto. Pengguna mengunggah foto bagian rumah, AI (Claude) menilai 8 komponen bangunan dengan skor 1–5, lalu aplikasi menghitung indeks kondisi, tingkat kerusakan, kategori (Baik / Rusak Ringan / Sedang / Berat), serta prioritas perbaikan dan kisaran biaya. Setiap laporan disimpan dan bisa dibuka lagi.

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

## Struktur

| Berkas | Isi |
| --- | --- |
| `src/lib/penilaian.ts` | Komponen, bobot, skala, perhitungan, normalisasi jawaban AI |
| `src/lib/ai.ts` | Prompt, skema Zod, pemanggilan model |
| `src/lib/db.ts` | Penyimpanan (libSQL/SQLite) |
| `src/lib/analisis.ts` | Klien layanan analisis Python |
| `analyzer/analisis.py` | Analisis citra (OpenCV) |
| `analyzer/main.py` | API FastAPI (`POST /analisis`, `GET /sehat`) |
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
