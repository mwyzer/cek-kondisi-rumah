"""Analyze home photos with OpenCV (classical heuristics, without a trained model).

Each function returns *indicators* to assist an assessor (AI or human), not a diagnosis.
All measurements use a fixed working size (maximum dimension 1024 px) so thresholds
are consistent across photos.
"""

from __future__ import annotations

import base64
from dataclasses import asdict, dataclass, field

import cv2
import numpy as np

import deteksi

VERSI = "cv-0.1"
SISI_KERJA = 1024
SISI_OVERLAY = 480

# Photo-quality thresholds. Sharpness = gradient ratio of the photo to a blurred version
# (a blurry photo changes very little when blurred again → ratio approaches 1).
TAJAM_MIN = 1.5
AGAK_TAJAM_MIN = 2.0
RESOLUSI_MIN = 480  # shortest side of original photo (px)

# Crack-detection thresholds (at working size).
RETAK_KONTRAS_MIN = 20  # minimum black-hat value
RETAK_PANJANG_MIN = 0.04  # relative to image diagonal
RETAK_ELONGASI_MIN = 6.0
SUDUT_SUMBU_TOLERANSI = 4.0  # degrees; axis-aligned straight lines are likely grout or frames
LURUS_MAKS = 0.035  # PCA width/length ratio; below this is a very straight line

# Stain-detection thresholds.
NODA_SELISIH_MIN = 18  # darkness compared with surroundings (L channel, 0–255)
NODA_LATAR_MIN = 120  # only on bright surfaces
NODA_AREA_MIN = 0.003  # relative to image area
NODA_ELONGASI_MAKS = 4.0


@dataclass
class Kualitas:
    ketajaman: float
    kecerahan: float
    status: str  # baik | agak_buram | buram | gelap | terlalu_terang | resolusi_rendah (internal codes)
    layak: bool
    catatan: list[str] = field(default_factory=list)


@dataclass
class Temuan:
    jumlah: int
    area_persen: float
    panjang_relatif: float = 0.0  # cracks only: total length / image diagonal


@dataclass
class Kotak:
    kelas: str  # "retak" | "rembesan" — matches dataset class IDs
    x: int  # original photo pixels, top-left
    y: int
    w: int
    h: int


@dataclass
class HasilFoto:
    indeks: int
    lebar: int
    tinggi: int
    kualitas: Kualitas
    retak: Temuan
    noda: Temuan
    overlay: str  # JPEG data URL
    kotak: list[Kotak] = field(default_factory=list)  # label suggestions for the dataset tool
    deteksi: list[dict] = field(default_factory=list)  # RF-DETR results: {kelas, skor, x, y, w, h}


class FotoTidakValid(ValueError):
    pass


def baca_gambar(data: bytes) -> np.ndarray:
    arr = np.frombuffer(data, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise FotoTidakValid("The file is not a readable image.")
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
        catatan.append("Photo resolution is low; small details such as hairline cracks may not be visible.")
    if kecerahan < 60 or gelap > 0.4:
        status = "gelap"
        catatan.append("The photo is too dark; turn on the lights or take the photo during the day.")
    elif terang > 0.3:
        status = "terlalu_terang"
        catatan.append("Most of the photo is overexposed.")
    if ketajaman < TAJAM_MIN:
        status = "buram"
        catatan.append("The photo is blurry; hold the camera steadier or tap the screen to focus.")
    elif ketajaman < AGAK_TAJAM_MIN and status == "baik":
        status = "agak_buram"
        catatan.append("The photo is slightly blurry; fine cracks may not be detected.")

    layak = status not in ("buram", "gelap")
    return Kualitas(round(ketajaman, 2), round(kecerahan, 1), status, layak, catatan)


def _sejajar_sumbu_dan_lurus(ys: np.ndarray, xs: np.ndarray) -> bool:
    """Return True when component pixels form a very straight, nearly horizontal/vertical line
    (typical of tile grout, frames, or furniture edges rather than cracks)."""
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
    # Black-hat highlights dark structures thinner than the kernel (cracks, gaps).
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
    bh = cv2.morphologyEx(gray, cv2.MORPH_BLACKHAT, kernel)
    otsu, _ = cv2.threshold(bh, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    mask = (bh > max(otsu, RETAK_KONTRAS_MIN)).astype(np.uint8)
    # Connect small gaps along cracks.
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))

    h, w = mask.shape
    # Remove long horizontal/vertical straight lines (tile grout, frames) before finding components,
    # so a grout grid does not connect into one large "crack".
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
    # Estimate the background using a wide window (~1/3 of photo width) so large stains
    # are not absorbed into it: apply a median filter at 1/8 size, then scale back up.
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
            continue  # Elongated: more likely a linear shadow or edge than a stain.
        hasil[label == i] = 1
        jumlah += 1

    return Temuan(jumlah, round(float(hasil.mean()) * 100, 2)), hasil


def buat_overlay(kerja: np.ndarray, retak: np.ndarray, noda: np.ndarray, model: list[dict] | None = None, skala: float = 1.0) -> str:
    out = kerja.copy()
    if model is not None:
        # When a trained model is active, show only its boxes to avoid overlap with heuristic markers.
        deteksi.gambar_kotak(out, model, skala)
    else:
        # Stains: orange outlines.
        kontur, _ = cv2.findContours(noda, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        cv2.drawContours(out, kontur, -1, (0, 140, 255), 3)
        # Cracks: thick red markers remain visible after resizing.
        tebal = cv2.dilate(retak, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
        out[tebal > 0] = (0.35 * out[tebal > 0] + 0.65 * np.array([40, 40, 230])).astype(np.uint8)
    out = ubah_ukuran(out, SISI_OVERLAY)
    ok, buf = cv2.imencode(".jpg", out, [cv2.IMWRITE_JPEG_QUALITY, 72])
    if not ok:
        return ""
    return "data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode("ascii")


def kotak_dari_mask(mask: np.ndarray, kelas: str, skala: float) -> list[Kotak]:
    """Return a bounding box for each mask component in original-photo coordinates."""
    n, _, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    hasil = []
    for i in range(1, n):
        x, y, w, h = (int(v) for v in stats[i, :4])
        pad = 4  # Add a little padding so thin cracks are not cropped.
        hasil.append(Kotak(
            kelas,
            round(max(0, x - pad) / skala), round(max(0, y - pad) / skala),
            round((w + 2 * pad) / skala), round((h + 2 * pad) / skala),
        ))
    return hasil


def analisis_foto(data: bytes, indeks: int) -> dict:
    asli = baca_gambar(data)
    kerja = ubah_ukuran(asli, SISI_KERJA)
    kualitas = nilai_kualitas(asli, kerja)
    retak, mask_retak = deteksi_retak(kerja)
    noda, mask_noda = deteksi_noda(kerja)
    h, w = asli.shape[:2]
    skala = kerja.shape[1] / w

    # If available, run RF-DETR on the working image and convert coordinates back to the original photo.
    dets = None
    if deteksi.info()["aktif"]:
        dets = [
            {**d, "x": round(d["x"] / skala), "y": round(d["y"] / skala), "w": round(d["w"] / skala), "h": round(d["h"] / skala)}
            for d in deteksi.deteksi(kerja)
        ]

    if dets is not None:
        kotak = [Kotak(d["kelas"], d["x"], d["y"], d["w"], d["h"]) for d in dets]
    else:
        kotak = kotak_dari_mask(mask_retak, "retak", skala) + kotak_dari_mask(mask_noda, "rembesan", skala)
    for k in kotak:  # Keep boxes within the photo.
        k.w = min(k.w, w - k.x)
        k.h = min(k.h, h - k.y)
    overlay = buat_overlay(kerja, mask_retak, mask_noda, dets, skala)
    return asdict(HasilFoto(indeks, w, h, kualitas, retak, noda, overlay, kotak, dets or []))
