"""Analisis foto rumah dengan OpenCV (heuristik klasik, tanpa model terlatih).

Setiap fungsi mengembalikan *indikasi* untuk membantu penilai (AI atau manusia),
bukan diagnosis. Semua pengukuran dilakukan pada ukuran kerja tetap (sisi terpanjang
1024 px) agar ambang batas berlaku sama untuk semua foto.
"""

from __future__ import annotations

import base64
from dataclasses import asdict, dataclass, field

import cv2
import numpy as np

VERSI = "cv-0.1"
SISI_KERJA = 1024
SISI_OVERLAY = 480

# Ambang kualitas foto. Ketajaman = rasio gradien foto terhadap versi yang dikaburkan
# (foto yang sudah buram hampir tidak berubah saat dikaburkan lagi → rasio mendekati 1).
TAJAM_MIN = 1.5
AGAK_TAJAM_MIN = 2.0
RESOLUSI_MIN = 480  # sisi terpendek foto asli (px)

# Ambang retak (pada ukuran kerja)
RETAK_KONTRAS_MIN = 20  # nilai black-hat minimum
RETAK_PANJANG_MIN = 0.04  # relatif terhadap diagonal gambar
RETAK_ELONGASI_MIN = 6.0
SUDUT_SUMBU_TOLERANSI = 4.0  # derajat; garis lurus sejajar sumbu = nat/kusen
LURUS_MAKS = 0.035  # rasio lebar/panjang PCA; di bawah ini = garis sangat lurus

# Ambang noda
NODA_SELISIH_MIN = 18  # seberapa gelap dibanding sekitarnya (kanal L, 0–255)
NODA_LATAR_MIN = 120  # hanya di permukaan terang
NODA_AREA_MIN = 0.003  # relatif terhadap luas gambar
NODA_ELONGASI_MAKS = 4.0


@dataclass
class Kualitas:
    ketajaman: float
    kecerahan: float
    status: str  # baik | agak_buram | buram | gelap | terlalu_terang | resolusi_rendah
    layak: bool
    catatan: list[str] = field(default_factory=list)


@dataclass
class Temuan:
    jumlah: int
    area_persen: float
    panjang_relatif: float = 0.0  # khusus retak: total panjang / diagonal gambar


@dataclass
class HasilFoto:
    indeks: int
    lebar: int
    tinggi: int
    kualitas: Kualitas
    retak: Temuan
    noda: Temuan
    overlay: str  # data URL JPEG


class FotoTidakValid(ValueError):
    pass


def baca_gambar(data: bytes) -> np.ndarray:
    arr = np.frombuffer(data, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise FotoTidakValid("File bukan gambar yang dapat dibaca.")
    return img


def ubah_ukuran(img: np.ndarray, sisi: int) -> np.ndarray:
    h, w = img.shape[:2]
    s = sisi / max(h, w)
    if s >= 1:
        return img
    return cv2.resize(img, (round(w * s), round(h * s)), interpolation=cv2.INTER_AREA)


def _rasio_ketajaman(gray: np.ndarray) -> float:
    def gradien(x: np.ndarray) -> float:
        return float(np.mean(np.abs(cv2.Sobel(x, cv2.CV_32F, 1, 0)) + np.abs(cv2.Sobel(x, cv2.CV_32F, 0, 1))))

    g = gray.astype(np.float32)
    return gradien(g) / (gradien(cv2.GaussianBlur(g, (0, 0), 2)) + 1e-6)


def nilai_kualitas(asli: np.ndarray, kerja: np.ndarray) -> Kualitas:
    gray = cv2.cvtColor(kerja, cv2.COLOR_BGR2GRAY)
    ketajaman = _rasio_ketajaman(gray)
    kecerahan = float(gray.mean())
    gelap = float((gray < 30).mean())
    terang = float((gray > 245).mean())

    catatan: list[str] = []
    status = "baik"
    if min(asli.shape[:2]) < RESOLUSI_MIN:
        status = "resolusi_rendah"
        catatan.append("Resolusi foto rendah; detail kecil seperti retak rambut bisa tidak terlihat.")
    if kecerahan < 60 or gelap > 0.4:
        status = "gelap"
        catatan.append("Foto terlalu gelap; gunakan lampu atau ambil foto di siang hari.")
    elif terang > 0.3:
        status = "terlalu_terang"
        catatan.append("Sebagian besar foto terlalu terang (overexposed).")
    if ketajaman < TAJAM_MIN:
        status = "buram"
        catatan.append("Foto buram; tahan kamera lebih stabil atau ketuk layar untuk fokus.")
    elif ketajaman < AGAK_TAJAM_MIN and status == "baik":
        status = "agak_buram"
        catatan.append("Foto agak buram; retak halus mungkin tidak terdeteksi.")

    layak = status not in ("buram", "gelap")
    return Kualitas(round(ketajaman, 2), round(kecerahan, 1), status, layak, catatan)


def _sejajar_sumbu_dan_lurus(ys: np.ndarray, xs: np.ndarray) -> bool:
    """True bila piksel komponen membentuk garis sangat lurus yang hampir horizontal/vertikal
    (pola khas nat keramik, kusen, atau tepi perabot, bukan retak)."""
    pts = np.column_stack((xs, ys)).astype(np.float64)
    pts -= pts.mean(axis=0)
    cov = np.cov(pts, rowvar=False)
    nilai, vektor = np.linalg.eigh(cov)
    if nilai[1] <= 0:
        return False
    lurus = float(np.sqrt(max(nilai[0], 0) / nilai[1]))
    arah = vektor[:, 1]
    sudut = abs(np.degrees(np.arctan2(arah[1], arah[0]))) % 90
    dekat_sumbu = min(sudut, 90 - sudut) <= SUDUT_SUMBU_TOLERANSI
    return lurus < LURUS_MAKS and dekat_sumbu


def deteksi_retak(kerja: np.ndarray) -> tuple[Temuan, np.ndarray]:
    gray = cv2.cvtColor(kerja, cv2.COLOR_BGR2GRAY)
    gray = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(gray)
    gray = cv2.GaussianBlur(gray, (3, 3), 0)
    # Black-hat menonjolkan struktur gelap yang lebih tipis dari kernel (retak, celah)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
    bh = cv2.morphologyEx(gray, cv2.MORPH_BLACKHAT, kernel)
    otsu, _ = cv2.threshold(bh, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    mask = (bh > max(otsu, RETAK_KONTRAS_MIN)).astype(np.uint8)
    # Sambungkan putus-putus kecil di sepanjang retak
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))

    h, w = mask.shape
    # Buang garis lurus panjang horizontal/vertikal (nat keramik, kusen) sebelum mencari komponen,
    # supaya kisi nat tidak tersambung menjadi satu "retak" besar
    panjang_garis = max(25, int(0.05 * max(h, w)))
    garis = cv2.morphologyEx(mask, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (panjang_garis, 1)))
    garis |= cv2.morphologyEx(mask, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (1, panjang_garis)))
    mask &= 1 - cv2.dilate(garis, np.ones((3, 3), np.uint8))

    diag = float(np.hypot(h, w))
    n, label, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    hasil = np.zeros_like(mask)
    jumlah, panjang_total = 0, 0.0
    for i in range(1, n):
        area = stats[i, cv2.CC_STAT_AREA]
        if area < 40:
            continue
        ys, xs = np.nonzero(label == i)
        (_, _), (rw, rh), _ = cv2.minAreaRect(np.column_stack((xs, ys)).astype(np.float32))
        panjang = max(rw, rh)
        lebar = area / max(panjang, 1.0)
        if panjang < RETAK_PANJANG_MIN * diag or panjang / max(lebar, 1.0) < RETAK_ELONGASI_MIN:
            continue
        if _sejajar_sumbu_dan_lurus(ys, xs):
            continue
        hasil[label == i] = 1
        jumlah += 1
        panjang_total += panjang

    return (
        Temuan(jumlah, round(float(hasil.mean()) * 100, 2), round(panjang_total / diag, 3)),
        hasil,
    )


def deteksi_noda(kerja: np.ndarray) -> tuple[Temuan, np.ndarray]:
    L = cv2.cvtColor(kerja, cv2.COLOR_BGR2LAB)[:, :, 0]
    # Perkirakan warna latar dengan jendela lebar (~1/3 lebar foto) supaya bercak besar
    # tidak ikut dianggap latar: median pada versi 1/8, lalu diperbesar kembali
    h, w = L.shape
    kecil = cv2.resize(L, (max(1, w // 8), max(1, h // 8)), interpolation=cv2.INTER_AREA)
    jendela = min(41, (min(kecil.shape) // 2) * 2 - 1)
    latar = cv2.resize(cv2.medianBlur(kecil, max(jendela, 3)), (w, h), interpolation=cv2.INTER_LINEAR)
    selisih = latar.astype(np.int16) - L.astype(np.int16)
    mask = ((selisih > NODA_SELISIH_MIN) & (latar > NODA_LATAR_MIN)).astype(np.uint8)
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, k)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, k)

    luas = mask.size
    n, label, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    hasil = np.zeros_like(mask)
    jumlah = 0
    for i in range(1, n):
        area = stats[i, cv2.CC_STAT_AREA]
        if area < NODA_AREA_MIN * luas:
            continue
        bw, bh_ = stats[i, cv2.CC_STAT_WIDTH], stats[i, cv2.CC_STAT_HEIGHT]
        if max(bw, bh_) / max(min(bw, bh_), 1) > NODA_ELONGASI_MAKS:
            continue  # memanjang: lebih mungkin bayangan garis/tepi daripada bercak
        hasil[label == i] = 1
        jumlah += 1

    return Temuan(jumlah, round(float(hasil.mean()) * 100, 2)), hasil


def buat_overlay(kerja: np.ndarray, retak: np.ndarray, noda: np.ndarray) -> str:
    out = kerja.copy()
    # Noda: garis tepi oranye
    kontur, _ = cv2.findContours(noda, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cv2.drawContours(out, kontur, -1, (0, 140, 255), 3)
    # Retak: merah tebal agar terlihat setelah diperkecil
    tebal = cv2.dilate(retak, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    out[tebal > 0] = (0.35 * out[tebal > 0] + 0.65 * np.array([40, 40, 230])).astype(np.uint8)
    out = ubah_ukuran(out, SISI_OVERLAY)
    ok, buf = cv2.imencode(".jpg", out, [cv2.IMWRITE_JPEG_QUALITY, 72])
    if not ok:
        return ""
    return "data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode("ascii")


def analisis_foto(data: bytes, indeks: int) -> dict:
    asli = baca_gambar(data)
    kerja = ubah_ukuran(asli, SISI_KERJA)
    kualitas = nilai_kualitas(asli, kerja)
    retak, mask_retak = deteksi_retak(kerja)
    noda, mask_noda = deteksi_noda(kerja)
    h, w = asli.shape[:2]
    return asdict(
        HasilFoto(indeks, w, h, kualitas, retak, noda, buat_overlay(kerja, mask_retak, mask_noda))
    )
