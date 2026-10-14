"""3D scanning steps that can be tested without a GPU.

Full workflow (runs on Modal; see app.py):
video → frames (ffmpeg) → discard blurry frames → COLMAP (camera poses) → gsplat → compressed PLY.
"""

from __future__ import annotations

from pathlib import Path
from urllib.parse import urlparse

import cv2

# Reuse the photo-analysis service thresholds (analyzer/analisis.py) for blur consistency.
from analisis import TAJAM_MIN, _rasio_ketajaman

FPS_EKSTRAK = 2
SISI_FRAME = 1280  # Longest frame edge for COLMAP and training.
DURASI_MIN = 10  # detik
DURASI_MAKS = 90
FRAME_MIN = 30  # di bawah ini pose kamera biasanya gagal
FRAME_MAKS = 150
LANGKAH_LATIH = 15_000
GAUSSIAN_MAKS = 400_000  # batas ukuran file agar ringan dibuka di ponsel

HOST_VIDEO = ".public.blob.vercel-storage.com"


class GagalProses(Exception):
    """An error with a message that is safe and useful to show to users."""


def cek_url_video(url: str) -> None:
    u = urlparse(url)
    if u.scheme != "https" or not (u.hostname or "").endswith(HOST_VIDEO):
        raise GagalProses("Invalid video URL.")


def cek_durasi(detik: float) -> None:
    if detik < DURASI_MIN:
        raise GagalProses(f"Video is too short ({detik:.0f} seconds). Record at least {DURASI_MIN} seconds.")
    if detik > DURASI_MAKS:
        raise GagalProses(f"Video is too long ({detik:.0f} seconds). Maximum {DURASI_MAKS} seconds per room.")


def perintah_durasi(video: Path) -> list[str]:
    return ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(video)]


def perintah_ekstrak(video: Path, keluar: Path) -> list[str]:
    skala = f"scale='if(gt(iw,ih),{SISI_FRAME},-2)':'if(gt(iw,ih),-2,{SISI_FRAME})'"
    return [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(video),
        "-vf", f"fps={FPS_EKSTRAK},{skala}", "-q:v", "2", str(keluar / "%05d.jpg"),
    ]


def ketajaman(path: Path) -> float:
    gray = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
    if gray is None:
        return 0.0
    s = 1024 / max(gray.shape)
    if s < 1:
        gray = cv2.resize(gray, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
    return _rasio_ketajaman(gray)


def pilih_frame(frames: list[Path]) -> list[Path]:
    """Discard blurry frames, then sample evenly if there are too many."""
    tajam = [f for f in sorted(frames) if ketajaman(f) >= TAJAM_MIN]
    if len(tajam) < FRAME_MIN:
        raise GagalProses(
            f"Only {len(tajam)} frames are sharp enough (at least {FRAME_MIN} required). "
            "Record again with slower movement and brighter lighting."
        )
    if len(tajam) <= FRAME_MAKS:
        return tajam
    langkah = len(tajam) / FRAME_MAKS
    return [tajam[int(i * langkah)] for i in range(FRAME_MAKS)]


def perintah_colmap(kerja: Path) -> list[list[str]]:
    db, gambar, sparse = kerja / "database.db", kerja / "images", kerja / "sparse"
    return [
        ["colmap", "feature_extractor", "--database_path", str(db), "--image_path", str(gambar),
         "--ImageReader.single_camera", "1", "--ImageReader.camera_model", "OPENCV",
         "--SiftExtraction.use_gpu", "0"],
        # Video frames are sequential, so the sequential matcher is much faster than exhaustive matching.
        ["colmap", "sequential_matcher", "--database_path", str(db), "--SiftMatching.use_gpu", "0"],
        ["colmap", "mapper", "--database_path", str(db), "--image_path", str(gambar), "--output_path", str(sparse)],
    ]


def cek_hasil_colmap(kerja: Path) -> None:
    if not (kerja / "sparse" / "0" / "images.bin").exists():
        raise GagalProses(
            "Camera poses were not found. Record again with slower movement, "
            "avoid filling the frame with a blank wall, and ensure there is enough light."
        )


def perintah_latih(trainer: Path, kerja: Path, hasil: Path) -> list[str]:
    return [
        "python", str(trainer), "mcmc",
        "--data_dir", str(kerja), "--data_factor", "1", "--result_dir", str(hasil),
        "--max_steps", str(LANGKAH_LATIH),
        "--strategy.cap-max", str(GAUSSIAN_MAKS),
        "--save_ply", "--ply_steps", str(LANGKAH_LATIH),
        "--eval_steps", str(LANGKAH_LATIH), "--save_steps", str(LANGKAH_LATIH),
        "--disable_viewer", "--disable_video",
    ]


def cari_ply(hasil: Path) -> Path:
    ply = sorted((hasil / "ply").glob("*.ply"), key=lambda p: p.stat().st_mtime)
    if not ply:
        raise GagalProses("3D model training did not produce an output file. Please try again later.")
    return ply[-1]
